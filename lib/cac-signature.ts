// CAC Digital Signature Integration for AFT Requests
// Handles the application of CAC certificate signatures to AFT request documents

import type { DbRow } from './database-bun';
import { getDb, type TxDb } from './database-bun';
import { auditLog } from './security';

export interface CACSignatureData {
  signature: string; // Base64 encoded signature
  certificate: {
    thumbprint: string;
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    serialNumber: string;
    certificateData: string;
  };
  timestamp: string;
  algorithm: string;
  notes?: string;
}

export interface SignedRequestData {
  requestId: number;
  signerId: number;
  signerEmail: string;
  signatureData: CACSignatureData;
  signatureHash: string;
  createdAt: Date;
}

// CAC Signature Manager
//
// All tables (cac_signatures, manual_signatures, aft_requests) are owned by
// the schema migration in schema/001_init.sql. This class provides only the
// runtime helpers used by the API layer.
/** No-op kept for backward compat with code that calls it at module load. */
function initializeTables(): void {
  /* schema is now managed by schema/001_init.sql */
}

// -------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------

// Insert a CAC signature row inside a transaction and return its id.
async function insertSignature(
  tx: TxDb,
  requestId: number,
  signerId: number,
  stepType: string,
  signatureData: CACSignatureData,
): Promise<number> {
  const result = await tx
    .query(`
    INSERT INTO cac_signatures (
      request_id, user_id, step_type,
      certificate_thumbprint, certificate_subject, certificate_issuer,
      certificate_serial, certificate_not_before, certificate_not_after,
      signature_data, signed_data, signature_algorithm, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
    RETURNING id
  `)
    .run(
      requestId,
      signerId,
      stepType,
      signatureData.certificate.thumbprint,
      signatureData.certificate.subject,
      signatureData.certificate.issuer,
      signatureData.certificate.serialNumber,
      Math.floor(new Date(signatureData.certificate.validFrom).getTime() / 1000),
      Math.floor(new Date(signatureData.certificate.validTo).getTime() / 1000),
      signatureData.signature,
      JSON.stringify(signatureData),
      signatureData.algorithm,
    );
  if (result.lastInsertRowid === undefined) {
    throw new Error('Failed to insert CAC signature row');
  }
  return result.lastInsertRowid;
}

// -------------------------------------------------------------------------
// Approver / CPSO signature
// -------------------------------------------------------------------------

async function applyApproverSignature(
  requestId: number,
  signerId: number,
  signerEmail: string,
  signatureData: CACSignatureData,
  ipAddress: string,
  role: string,
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    const result = await db.withTransaction(async (tx) => {
      const allowedStatuses =
        role === 'CPSO' ? ['pending_cpso'] : ['pending_approver', 'submitted', 'pending_approval'];

      const request = (await tx
        .query(`
        SELECT id, status
        FROM aft_requests
        WHERE id = ? AND status IN (${allowedStatuses.map(() => '?').join(',')})
      `)
        .get(requestId, ...allowedStatuses)) as DbRow;

      if (!request) {
        return { success: false as const, error: 'Request not found or not ready for approval' };
      }

      const certValid = verifyCertificateValidity(signatureData.certificate);
      if (!certValid.isValid) {
        return {
          success: false as const,
          error: certValid.error || 'Certificate validation failed',
        };
      }

      const stepType = role === 'CPSO' ? 'cpso_approval' : 'approver_approval';
      const signatureId = await insertSignature(tx, requestId, signerId, stepType, signatureData);

      const newStatus = role === 'CPSO' ? 'pending_dta' : 'pending_cpso';
      await tx
        .query(`
        UPDATE aft_requests
        SET status = ?,
            approver_email = ?,
            approver_id = ?,
            updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT,
            approval_notes = ?
        WHERE id = ?
      `)
        .run(newStatus, signerEmail, signerId, signatureData.notes || null, requestId);

      const historyAction = role === 'CPSO' ? 'CPSO_APPROVED_CAC' : 'ISSM_APPROVED_CAC';
      const historyNotes =
        role === 'CPSO'
          ? `Request approved by CPSO with CAC signature - Forwarded to DTA. Signature ID: ${signatureId}${signatureData.notes ? `. Notes: ${signatureData.notes}` : ''}`
          : `Request approved by ISSM with CAC signature - Forwarded to CPSO. Signature ID: ${signatureId}${signatureData.notes ? `. Notes: ${signatureData.notes}` : ''}`;

      await tx
        .query(`
        INSERT INTO aft_request_history (request_id, action, notes, user_email)
        VALUES (?, ?, ?, ?)
      `)
        .run(requestId, historyAction, historyNotes, signerEmail);

      return { success: true as const, signatureId };
    });

    if (!result.success) return result;

    await auditLog(
      signerId,
      'CAC_SIGNATURE_APPROVAL',
      `CAC signature approval applied to request ${requestId} by ${role}`,
      ipAddress,
      {
        requestId,
        signatureId: result.signatureId,
        role,
        certificateThumbprint: signatureData.certificate.thumbprint,
        certificateSubject: signatureData.certificate.subject,
      },
    );

    console.log(
      `CAC signature approval applied to request ${requestId} by ${role} user ${signerId}`,
    );
    return { success: true };
  } catch (error) {
    console.error('Error applying approver CAC signature:', error);
    await auditLog(
      signerId,
      'CAC_SIGNATURE_APPROVAL_FAILED',
      `Failed to apply CAC signature approval to request ${requestId}: ${error}`,
      ipAddress,
      { requestId, role, error: String(error) },
    );
    return { success: false, error: `Failed to apply signature: ${error}` };
  }
}

// -------------------------------------------------------------------------
// Requestor / SME generic signature (legacy `applySignature`)
// -------------------------------------------------------------------------

async function applySignature(
  requestId: number,
  signerId: number,
  signerEmail: string,
  signatureData: CACSignatureData,
  ipAddress: string,
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    const result = await db.withTransaction(async (tx) => {
      const request = (await tx
        .query(`
        SELECT id, status, requestor_id
        FROM aft_requests
        WHERE id = ? AND (status = 'pending_sme_signature' OR status = 'draft')
      `)
        .get(requestId)) as DbRow;

      if (!request) {
        return { success: false as const, error: 'Request not found or not ready for signature' };
      }

      const certValid = verifyCertificateValidity(signatureData.certificate);
      if (!certValid.isValid) {
        return {
          success: false as const,
          error: certValid.error || 'Certificate validation failed',
        };
      }

      const signatureId = await insertSignature(
        tx,
        requestId,
        signerId,
        'requestor_signature',
        signatureData,
      );

      await tx
        .query(`
        UPDATE aft_requests
        SET status = 'pending_media_custodian',
            updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT,
            sme_id = ?,
            sme_signature_date = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = ?
      `)
        .run(signerId, requestId);

      await tx
        .query(`
        INSERT INTO aft_request_history (request_id, action, notes, user_email)
        VALUES (?, ?, ?, ?)
      `)
        .run(
          requestId,
          'SME_CAC_SIGNED',
          `Request digitally signed with CAC certificate by SME. Signature ID: ${signatureId}${signatureData.notes ? `. Notes: ${signatureData.notes}` : ''}`,
          signerEmail,
        );

      return { success: true as const, signatureId };
    });

    if (!result.success) return result;

    await auditLog(
      signerId,
      'CAC_SIGNATURE_APPLIED',
      `CAC signature applied to request ${requestId}`,
      ipAddress,
      {
        requestId,
        signatureId: result.signatureId,
        certificateThumbprint: signatureData.certificate.thumbprint,
        certificateSubject: signatureData.certificate.subject,
      },
    );

    console.log(`CAC signature applied to request ${requestId} by user ${signerId}`);
    return { success: true };
  } catch (error) {
    console.error('Error applying CAC signature:', error);
    await auditLog(
      signerId,
      'CAC_SIGNATURE_FAILED',
      `Failed to apply CAC signature to request ${requestId}: ${error}`,
      ipAddress,
      { requestId, error: String(error) },
    );
    return { success: false, error: `Failed to apply signature: ${error}` };
  }
}

// -------------------------------------------------------------------------
// DTA signature
// -------------------------------------------------------------------------

async function applyDTASignature(
  requestId: number,
  signerId: number,
  signerEmail: string,
  signatureData: CACSignatureData,
  ipAddress: string,
  smeUserId: number,
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    const result = await db.withTransaction(async (tx) => {
      const request = (await tx
        .query(`
        SELECT id, status
        FROM aft_requests
        WHERE id = ? AND dta_id = ?
      `)
        .get(requestId, signerId)) as DbRow;

      if (!request) {
        return { success: false as const, error: 'Request not found or access denied' };
      }

      const certValid = verifyCertificateValidity(signatureData.certificate);
      if (!certValid.isValid) {
        return {
          success: false as const,
          error: certValid.error || 'Certificate validation failed',
        };
      }

      const signatureId = await insertSignature(
        tx,
        requestId,
        signerId,
        'dta_signature',
        signatureData,
      );

      await tx
        .query(`
        UPDATE aft_requests
        SET status = 'pending_sme_signature',
            dta_signature_date = EXTRACT(EPOCH FROM NOW())::BIGINT,
            assigned_sme_id = ?,
            updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = ?
      `)
        .run(smeUserId, requestId);

      await tx
        .query(`
        INSERT INTO aft_request_history (request_id, action, notes, user_email)
        VALUES (?, ?, ?, ?)
      `)
        .run(
          requestId,
          'DTA_SIGNED_CAC',
          `DTA CAC signature applied and forwarded to SME. Signature ID: ${signatureId}${signatureData.notes ? `. Notes: ${signatureData.notes}` : ''}`,
          signerEmail,
        );

      return { success: true as const, signatureId };
    });

    if (!result.success) return result;

    await auditLog(
      signerId,
      'CAC_SIGNATURE_DTA',
      `DTA CAC signature applied to request ${requestId}`,
      ipAddress,
      {
        requestId,
        signatureId: result.signatureId,
        smeUserId,
        certificateThumbprint: signatureData.certificate.thumbprint,
        certificateSubject: signatureData.certificate.subject,
      },
    );

    console.log(`DTA CAC signature applied to request ${requestId} by user ${signerId}`);
    return { success: true };
  } catch (error) {
    console.error('Error applying DTA CAC signature:', error);
    await auditLog(
      signerId,
      'CAC_SIGNATURE_DTA_FAILED',
      `Failed to apply DTA CAC signature to request ${requestId}: ${error}`,
      ipAddress,
      { requestId, error: String(error) },
    );
    return { success: false, error: `Failed to apply signature: ${error}` };
  }
}

// -------------------------------------------------------------------------
// SME signature (Two-Person Integrity completion)
// -------------------------------------------------------------------------

async function applySMESignature(
  requestId: number,
  signerId: number,
  signerEmail: string,
  signatureData: CACSignatureData,
  ipAddress: string,
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    const result = await db.withTransaction(async (tx) => {
      const request = (await tx
        .query(`
        SELECT id, status, assigned_sme_id
        FROM aft_requests
        WHERE id = ? AND status = 'pending_sme_signature'
      `)
        .get(requestId)) as DbRow;

      if (!request) {
        return {
          success: false as const,
          error: 'Request not found or not ready for SME signature',
        };
      }

      if (request.assigned_sme_id && request.assigned_sme_id !== signerId) {
        return { success: false as const, error: 'You are not assigned to sign this request' };
      }

      const certValid = verifyCertificateValidity(signatureData.certificate);
      if (!certValid.isValid) {
        return {
          success: false as const,
          error: certValid.error || 'Certificate validation failed',
        };
      }

      const signatureId = await insertSignature(
        tx,
        requestId,
        signerId,
        'sme_signature',
        signatureData,
      );

      await tx
        .query(`
        UPDATE aft_requests
        SET status = 'pending_media_custodian',
            sme_signature_date = EXTRACT(EPOCH FROM NOW())::BIGINT,
            updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = ?
      `)
        .run(requestId);

      await tx
        .query(`
        INSERT INTO aft_request_history (request_id, action, notes, user_email)
        VALUES (?, ?, ?, ?)
      `)
        .run(
          requestId,
          'SME_SIGNED_CAC',
          `SME CAC signature applied. Two-Person Integrity check completed. Signature ID: ${signatureId}${signatureData.notes ? `. Notes: ${signatureData.notes}` : ''}`,
          signerEmail,
        );

      return { success: true as const, signatureId };
    });

    if (!result.success) return result;

    await auditLog(
      signerId,
      'CAC_SIGNATURE_SME',
      `SME CAC signature applied to request ${requestId}`,
      ipAddress,
      {
        requestId,
        signatureId: result.signatureId,
        certificateThumbprint: signatureData.certificate.thumbprint,
        certificateSubject: signatureData.certificate.subject,
      },
    );

    console.log(`SME CAC signature applied to request ${requestId} by user ${signerId}`);
    return { success: true };
  } catch (error) {
    console.error('Error applying SME CAC signature:', error);
    await auditLog(
      signerId,
      'CAC_SIGNATURE_SME_FAILED',
      `Failed to apply SME CAC signature to request ${requestId}: ${error}`,
      ipAddress,
      { requestId, error: String(error) },
    );
    return { success: false, error: `Failed to apply signature: ${error}` };
  }
}

// -------------------------------------------------------------------------
// DTA signature ONLY (does not change workflow status)
// -------------------------------------------------------------------------

async function applyDTASignatureOnly(
  requestId: number,
  signerId: number,
  signerEmail: string,
  signatureData: CACSignatureData,
  ipAddress: string,
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    const result = await db.withTransaction(async (tx) => {
      const request = (await tx
        .query(`
        SELECT id, status, dta_id
        FROM aft_requests
        WHERE id = ? AND dta_id = ?
      `)
        .get(requestId, signerId)) as DbRow;

      if (!request) {
        return { success: false as const, error: 'Request not found or access denied' };
      }

      if (request.status !== 'active_transfer') {
        return {
          success: false as const,
          error: `Request must be in active transfer status. Current status: ${request.status as string}`,
        };
      }

      const certValid = verifyCertificateValidity(signatureData.certificate);
      if (!certValid.isValid) {
        return {
          success: false as const,
          error: certValid.error || 'Certificate validation failed',
        };
      }

      const signatureId = await insertSignature(
        tx,
        requestId,
        signerId,
        'dta_signature_only',
        signatureData,
      );

      await tx
        .query(`
        UPDATE aft_requests
        SET dta_signature_date = EXTRACT(EPOCH FROM NOW())::BIGINT,
            updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = ?
      `)
        .run(requestId);

      await tx
        .query(`
        INSERT INTO aft_request_history (request_id, action, notes, user_email)
        VALUES (?, ?, ?, ?)
      `)
        .run(
          requestId,
          'DTA_SIGNED_CAC_ONLY',
          `DTA CAC signature applied. Signature ID: ${signatureId}${signatureData.notes ? `. Notes: ${signatureData.notes}` : ''}`,
          signerEmail,
        );

      return { success: true as const, signatureId };
    });

    if (!result.success) return result;

    await auditLog(
      signerId,
      'CAC_SIGNATURE_DTA_ONLY',
      `DTA CAC signature applied to request ${requestId} (no workflow change)`,
      ipAddress,
      {
        requestId,
        signatureId: result.signatureId,
        certificateThumbprint: signatureData.certificate.thumbprint,
        certificateSubject: signatureData.certificate.subject,
      },
    );

    console.log(
      `DTA CAC signature applied to request ${requestId} by user ${signerId} (no workflow change)`,
    );
    return { success: true };
  } catch (error) {
    console.error('Error applying DTA CAC signature:', error);
    await auditLog(
      signerId,
      'CAC_SIGNATURE_DTA_ONLY_FAILED',
      `Failed to apply DTA CAC signature to request ${requestId}: ${error}`,
      ipAddress,
      { requestId, error: String(error) },
    );
    return { success: false, error: `Failed to apply signature: ${error}` };
  }
}

// -------------------------------------------------------------------------
// Verification helpers (read-only)
// -------------------------------------------------------------------------

function verifyCertificateValidity(certificate: CACSignatureData['certificate']): {
  isValid: boolean;
  error?: string;
} {
  try {
    const validFrom = new Date(certificate.validFrom);
    const validTo = new Date(certificate.validTo);
    const now = new Date();

    if (now < validFrom) {
      return { isValid: false, error: 'Certificate is not yet valid' };
    }
    if (now > validTo) {
      return { isValid: false, error: 'Certificate has expired' };
    }
    if (
      !certificate.issuer.includes('DOD') &&
      !certificate.issuer.includes('DEPARTMENT OF DEFENSE')
    ) {
      return { isValid: false, error: 'Certificate must be issued by DOD Certificate Authority' };
    }
    if (!certificate.subject.includes('CN=') || !certificate.subject.includes('OU=')) {
      return { isValid: false, error: 'Invalid certificate subject format for CAC certificate' };
    }
    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: `Certificate validation error: ${error}` };
  }
}

async function generateSignatureHash(signatureData: CACSignatureData): Promise<string> {
  const signatureText = JSON.stringify({
    signature: signatureData.signature,
    certificateThumbprint: signatureData.certificate.thumbprint,
    timestamp: signatureData.timestamp,
    algorithm: signatureData.algorithm,
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(signatureText);

  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);

  return Array.from(hashArray, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getRequestSignatures(requestId: number): Promise<DbRow[]> {
  const db = getDb();
  return (await db
    .query(`
    SELECT * FROM cac_signatures
    WHERE request_id = ?
    ORDER BY created_at DESC
  `)
    .all(requestId)) as DbRow[];
}

async function verifySignatureIntegrity(
  signatureId: number,
): Promise<{ isValid: boolean; error?: string }> {
  const db = getDb();

  try {
    const signature = (await db
      .query(`
      SELECT * FROM cac_signatures WHERE id = ?
    `)
      .get(signatureId)) as
      | {
          signed_data: string;
          signature_data: string;
          certificate_thumbprint: string;
          certificate_subject: string;
          certificate_issuer: string;
          certificate_not_before: number;
          certificate_not_after: number;
          certificate_serial: string;
          signature_algorithm: string;
        }
      | undefined;

    if (!signature) {
      return { isValid: false, error: 'Signature not found' };
    }

    let original: CACSignatureData;
    try {
      original = JSON.parse(signature.signed_data);
    } catch {
      return { isValid: false, error: 'Stored signature payload is corrupt' };
    }

    const reconstructed: CACSignatureData = {
      signature: signature.signature_data,
      certificate: {
        thumbprint: signature.certificate_thumbprint,
        subject: signature.certificate_subject,
        issuer: signature.certificate_issuer,
        validFrom: new Date(Number(signature.certificate_not_before) * 1000).toISOString(),
        validTo: new Date(Number(signature.certificate_not_after) * 1000).toISOString(),
        serialNumber: signature.certificate_serial,
        certificateData: original.certificate.certificateData,
      },
      timestamp: original.timestamp,
      algorithm: signature.signature_algorithm,
    };

    const originalHash = await generateSignatureHash(original);
    const reconstructedHash = await generateSignatureHash(reconstructed);
    if (originalHash !== reconstructedHash) {
      return { isValid: false, error: 'Signature integrity check failed' };
    }

    const certValid = verifyCertificateValidity(reconstructed.certificate);
    if (!certValid.isValid) {
      return { isValid: false, error: `Certificate validation failed: ${certValid.error}` };
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: `Verification error: ${error}` };
  }
}

function formatSignatureForDisplay(signature: DbRow): {
  signerName: string;
  signedAt: string;
  certificateInfo: string;
  isValid: boolean;
} {
  try {
    const subject = parseCertificateSubject(signature.certificate_subject as string);
    const commonName = subject.CN || 'Unknown Signer';

    let signerName = commonName;
    const nameParts = commonName.split('.');
    if (nameParts.length >= 2) {
      signerName = `${nameParts[1]} ${nameParts[0]}`.toUpperCase();
    }

    const signedAt = signature.created_at
      ? new Date(Number(signature.created_at) * 1000).toLocaleString()
      : 'Unknown';

    const validTo = signature.certificate_not_after
      ? new Date(Number(signature.certificate_not_after) * 1000)
      : null;
    const isExpired = !!validTo && validTo < new Date();
    const certificateInfo = validTo
      ? `Serial: ${signature.certificate_serial}, Expires: ${validTo.toLocaleDateString()}`
      : `Serial: ${signature.certificate_serial}`;

    return { signerName, signedAt, certificateInfo, isValid: !isExpired };
  } catch {
    return {
      signerName: 'Unknown',
      signedAt: 'Unknown',
      certificateInfo: 'Invalid certificate data',
      isValid: false,
    };
  }
}

function parseCertificateSubject(subject: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const parts = subject.split(',');
  parts.forEach((part) => {
    const [key, value] = part.trim().split('=');
    if (key && value) {
      parsed[key.trim()] = value.trim();
    }
  });
  return parsed;
}

function generateSignatureBlock(signature: DbRow): string {
  const display = formatSignatureForDisplay(signature);
  const subject = parseCertificateSubject(signature.certificate_subject as string);
  const organization = subject.OU || subject.O || 'Department of Defense';

  return `
    <div class="cac-signature-block border-2 border-[var(--primary)] rounded-lg p-4 bg-[var(--card)]">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="text-[var(--primary)]">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
          </svg>
          <span class="font-semibold text-[var(--primary)]">CAC Digital Signature</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-2 h-2 rounded-full ${display.isValid ? 'bg-[var(--success)]' : 'bg-[var(--destructive)]'}"></div>
          <span class="text-xs text-[var(--muted-foreground)]">${display.isValid ? 'Valid' : 'Invalid'}</span>
        </div>
      </div>
      <div class="space-y-2 text-sm">
        <div><span class="font-medium">Signed by:</span><span class="ml-2">${display.signerName}</span></div>
        <div><span class="font-medium">Organization:</span><span class="ml-2">${organization}</span></div>
        <div><span class="font-medium">Signed on:</span><span class="ml-2">${display.signedAt}</span></div>
        <div><span class="font-medium">Certificate:</span><span class="ml-2 font-mono text-xs">${display.certificateInfo}</span></div>
      </div>
      <div class="mt-3 pt-2 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
        <div class="flex justify-between">
          <span>Algorithm: ${signature.signature_algorithm}</span>
          <span>Signature ID: ${signature.id}</span>
        </div>
      </div>
    </div>
  `;
}

async function exportSignatureData(signatureId: number): Promise<unknown> {
  const db = getDb();

  const signature = (await db
    .query(`
    SELECT cs.*, r.request_number, u.first_name, u.last_name, u.email
    FROM cac_signatures cs
    LEFT JOIN aft_requests r ON cs.request_id = r.id
    LEFT JOIN users u ON cs.user_id = u.id
    WHERE cs.id = ?
  `)
    .get(signatureId)) as
    | (DbRow & {
        id: number;
        request_id: number;
        request_number: string;
        first_name: string;
        last_name: string;
        email: string;
        signature_algorithm: string;
        signed_data: string;
      })
    | undefined;

  if (!signature) return null;

  let original: CACSignatureData | null = null;
  try {
    original = JSON.parse(signature.signed_data);
  } catch {}

  return {
    signatureId: signature.id,
    requestId: signature.request_id,
    requestNumber: signature.request_number,
    signer: {
      name: `${signature.first_name || ''} ${signature.last_name || ''}`.trim(),
      email: signature.email,
    },
    certificate: {
      thumbprint: signature.certificate_thumbprint,
      subject: signature.certificate_subject,
      issuer: signature.certificate_issuer,
      serialNumber: signature.certificate_serial,
      validFrom: new Date(Number(signature.certificate_not_before) * 1000).toISOString(),
      validTo: new Date(Number(signature.certificate_not_after) * 1000).toISOString(),
      data: original?.certificate?.certificateData || null,
    },
    signature: {
      data: signature.signature_data,
      algorithm: signature.signature_algorithm,
      timestamp: original?.timestamp || null,
    },
    notes: original?.notes || null,
    createdAt: signature.created_at,
  };
}

export const CACSignatureManager = {
  initializeTables,
  applyApproverSignature,
  applySignature,
  applyDTASignature,
  applySMESignature,
  applyDTASignatureOnly,
  verifyCertificateValidity,
  generateSignatureHash,
  getRequestSignatures,
  verifySignatureIntegrity,
  formatSignatureForDisplay,
  parseCertificateSubject,
  generateSignatureBlock,
  exportSignatureData,
};

// Initialize tables when module is imported (no-op now; schema is managed
// by schema/001_init.sql).
CACSignatureManager.initializeTables();
