// DOD CAC Server-Side Client Certificate Authentication
// This is the proper way DOD applications handle CAC authentication

import { getDb } from './database-bun';
import { auditLog } from './security';

export interface CACClientCertificate {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  pem: string;
  dodId?: string;
  email?: string;
  commonName?: string;
}

// Extract DOD ID from certificate subject
function extractDODID(subject: string): string | null {
  // CAC certificates typically have DOD ID in the subject
  // Format: CN=LAST.FIRST.MIDDLE.1234567890 or similar
  const cnMatch = subject.match(/CN=([^,]+)/);
  const commonName = cnMatch?.[1];
  if (!commonName) return null;
  // Extract 10-digit DOD ID (EDIPI)
  const dodIdMatch = commonName.match(/(\d{10})/);
  return dodIdMatch?.[1] ?? null;
}

// Extract email from certificate
function extractEmail(subject: string): string | null {
  const emailMatch = subject.match(/emailAddress=([^,]+)/);
  return emailMatch?.[1] ?? null;
}

// Parse certificate subject into components
function parseSubject(subject: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const parts = subject.split(',');

  parts.forEach((part) => {
    const trimmed = part.trim();
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmed.substring(0, equalIndex).trim();
      const value = trimmed.substring(equalIndex + 1).trim();
      parsed[key] = value;
    }
  });

  return parsed;
}

// Validate that certificate is from DOD CA
function isDODCertificate(certificate: CACClientCertificate): boolean {
  // Check if issuer contains DOD certificate authorities
  const dodCAs = ['DOD CA-', 'DEPARTMENT OF DEFENSE', 'DOD ID CA-', 'DOD EMAIL CA-'];

  return dodCAs.some((ca) => certificate.issuer.toUpperCase().includes(ca.toUpperCase()));
}

// Validate certificate is currently valid
function isValidCertificate(certificate: CACClientCertificate): boolean {
  const now = new Date();
  return now >= certificate.validFrom && now <= certificate.validTo;
}

// Get or create user from CAC certificate.
//
// The users table does NOT have a dedicated dod_id column. We match by
// email (extracted from the certificate) and, as a fallback, by the
// fingerprint stored in the cac_certificates table. We refuse to auto-
// create users from a CAC alone - admins must provision the account first.
async function getUserFromCertificate(certificate: CACClientCertificate): Promise<{ id: number; is_active: boolean | number; [key: string]: unknown } | null> {
  const db = getDb();

  const email = extractEmail(certificate.subject);

  let user: any = null;
  if (email) {
    user = await db.query(`SELECT * FROM users WHERE email = ? AND is_active = TRUE`).get(email);
  }

  if (!user && certificate.fingerprint) {
    user = await db
      .query(`
      SELECT u.* FROM users u
      JOIN cac_certificates cc ON cc.user_id = u.id
      WHERE cc.fingerprint = ? AND u.is_active = TRUE
    `)
      .get(certificate.fingerprint);
  }

  if (user) {
    // Bind / refresh the certificate <-> user mapping for future lookups.
    await storeCertificate(user.id, certificate);
  }

  return user;
}

// Store CAC certificate information. The cac_certificates table is owned
// by the schema migration in schema/001_init.sql.
async function storeCertificate(userId: number, certificate: CACClientCertificate): Promise<void> {
  const db = getDb();

  await db
    .query(`
    INSERT INTO cac_certificates (
      user_id, subject, issuer, serial_number, fingerprint,
      valid_from, valid_to, pem_data, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
    ON CONFLICT (fingerprint) DO UPDATE
      SET user_id      = EXCLUDED.user_id,
          subject      = EXCLUDED.subject,
          issuer       = EXCLUDED.issuer,
          serial_number = EXCLUDED.serial_number,
          valid_from   = EXCLUDED.valid_from,
          valid_to     = EXCLUDED.valid_to,
          pem_data     = EXCLUDED.pem_data,
          updated_at   = EXTRACT(EPOCH FROM NOW())::BIGINT
  `)
    .run(
      userId,
      certificate.subject,
      certificate.issuer,
      certificate.serialNumber,
      certificate.fingerprint,
      Math.floor(certificate.validFrom.getTime() / 1000),
      Math.floor(certificate.validTo.getTime() / 1000),
      certificate.pem,
    );
}

// Authenticate user with client certificate
async function authenticateWithCertificate(
  certificate: CACClientCertificate,
  ipAddress: string,
): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    // Validate certificate is from DOD
    if (!isDODCertificate(certificate)) {
      return { success: false, error: 'Certificate must be issued by DOD Certificate Authority' };
    }

    // Validate certificate is not expired
    if (!isValidCertificate(certificate)) {
      return { success: false, error: 'Certificate has expired or is not yet valid' };
    }

    // Get or create user from certificate
    const user = await getUserFromCertificate(certificate);

    if (!user) {
      return { success: false, error: 'Unable to create or find user from certificate' };
    }

    if (!user.is_active) {
      return { success: false, error: 'User account is disabled' };
    }

    // Log successful authentication
    await auditLog(
      user.id,
      'CAC_AUTHENTICATION_SUCCESS',
      'User authenticated with CAC certificate',
      ipAddress,
      {
        certificateSubject: certificate.subject,
        certificateFingerprint: certificate.fingerprint,
        dodId: extractDODID(certificate.subject),
      },
    );

    return { success: true, user };
  } catch (error) {
    console.error('CAC authentication error:', error);
    return { success: false, error: 'Authentication failed due to server error' };
  }
}

// Configure Bun server for client certificate authentication
function getServerConfig(certPath: string, keyPath: string, caCertPath: string) {
  return {
    port: 443, // HTTPS required for client certificates
    tls: {
      cert: Bun.file(certPath),
      key: Bun.file(keyPath),
      ca: Bun.file(caCertPath), // DOD CA certificates
      requestCert: true, // Request client certificate
      rejectUnauthorized: false, // Allow validation in application code
    },
  };
}

// Extract client certificate from request
function getClientCertificate(_request: Request): CACClientCertificate | null {
  // In a real implementation, this would extract the certificate from the TLS context
  // For now, this is a placeholder that would be implemented based on the specific
  // server framework being used

  // Example of what might be available:
  // const cert = request.socket?.getPeerCertificate();

  return null; // Placeholder - needs actual implementation
}

export const CACServerAuth = {
  extractDODID,
  extractEmail,
  parseSubject,
  isDODCertificate,
  isValidCertificate,
  getUserFromCertificate,
  storeCertificate,
  authenticateWithCertificate,
  getServerConfig,
  getClientCertificate,
};

// Middleware to handle CAC authentication
export async function CACAuthMiddleware(
  request: Request,
  ipAddress: string,
): Promise<{ success: boolean; user?: any; error?: string }> {
  const clientCert = CACServerAuth.getClientCertificate(request);

  if (!clientCert) {
    return { success: false, error: 'No client certificate provided' };
  }

  return await CACServerAuth.authenticateWithCertificate(clientCert, ipAddress);
}
