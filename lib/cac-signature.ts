// CAC Digital Signature Integration for AFT Requests
// Handles the application of CAC certificate signatures to AFT request documents

import { getDb } from "./database-bun";
import { auditLog } from "./security";

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
// NOTE: The cac_signatures schema is owned by lib/database-bun.ts. Do NOT
// re-create it here with different columns. This module only adds the
// supporting `manual_signatures` table and the `signature_method` /
// `submitted_at` columns on aft_requests, which are not part of the base
// schema.
export class CACSignatureManager {

  // Initialize supporting tables. Idempotent.
  static initializeTables(): void {
    const db = getDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS manual_signatures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL,
        signer_id INTEGER NOT NULL,
        signer_email TEXT NOT NULL,
        signature_text TEXT NOT NULL,
        certification_statement TEXT NOT NULL,
        signature_timestamp TEXT NOT NULL,
        ip_address TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (request_id) REFERENCES aft_requests(id),
        FOREIGN KEY (signer_id) REFERENCES users(id)
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cac_signatures_request_id
      ON cac_signatures(request_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_manual_signatures_request_id
      ON manual_signatures(request_id)
    `);

    try {
      db.exec(`ALTER TABLE aft_requests ADD COLUMN signature_method TEXT DEFAULT 'manual'`);
    } catch (error: any) {
      if (!error.message?.includes('duplicate column name')) throw error;
    }
    try {
      db.exec(`ALTER TABLE aft_requests ADD COLUMN submitted_at INTEGER`);
    } catch (error: any) {
      if (!error.message?.includes('duplicate column name')) throw error;
    }
  }

  // Apply Approver CAC signature to request
  static async applyApproverSignature(
    requestId: number,
    signerId: number,
    signerEmail: string,
    signatureData: CACSignatureData,
    ipAddress: string,
    role: string
  ): Promise<{ success: boolean; error?: string }> {
    const db = getDb();
    
    try {
      // Begin transaction
      db.exec('BEGIN TRANSACTION');

      // Verify request exists and is in correct state for approval
      const allowedStatuses = role === 'CPSO' 
        ? ['pending_cpso']
        : ['pending_approver', 'submitted', 'pending_approval'];
      
      const request = db.query(`
        SELECT id, status 
        FROM aft_requests 
        WHERE id = ? AND status IN (${allowedStatuses.map(() => '?').join(',')})
      `).get(requestId, ...allowedStatuses) as any;

      if (!request) {
        db.exec('ROLLBACK');
        return { 
          success: false, 
          error: 'Request not found or not ready for approval' 
        };
      }

      // Verify certificate validity
      const certValid = this.verifyCertificateValidity(signatureData.certificate);
      if (!certValid.isValid) {
        db.exec('ROLLBACK');
        return { 
          success: false, 
          error: certValid.error || 'Certificate validation failed' 
        };
      }

      // Generate signature hash for integrity
      const signatureHash = await this.generateSignatureHash(signatureData);

      // Store CAC signature
      const stepType = role === 'CPSO' ? 'cpso_approval' : 'approver_approval';
      const signatureId = db.query(`
        INSERT INTO cac_signatures (
          request_id, user_id, step_type,
          certificate_thumbprint, certificate_subject, certificate_issuer,
          certificate_serial, certificate_not_before, certificate_not_after,
          signature_data, signed_data, signature_algorithm, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      `).run(
        requestId, 
        signerId, 
        stepType,
        signatureData.certificate.thumbprint,
        signatureData.certificate.subject,
        signatureData.certificate.issuer,
        signatureData.certificate.serialNumber,
        new Date(signatureData.certificate.validFrom).getTime() / 1000,
        new Date(signatureData.certificate.validTo).getTime() / 1000,
        signatureData.signature,
        JSON.stringify(signatureData),
        signatureData.algorithm
      ).lastInsertRowid as number;

      // Update request status based on role
      const newStatus = role === 'CPSO' ? 'pending_dta' : 'pending_cpso';
      db.query(`
        UPDATE aft_requests 
        SET status = ?,
            approver_email = ?,
            approver_id = ?,
            updated_at = unixepoch(),
            approval_notes = ?
        WHERE id = ?
      `).run(newStatus, signerEmail, signerId, signatureData.notes || null, requestId);

      // Add to request history
      const historyAction = role === 'CPSO' ? 'CPSO_APPROVED_CAC' : 'ISSM_APPROVED_CAC';
      const historyNotes = role === 'CPSO' 
        ? `Request approved by CPSO with CAC signature - Forwarded to DTA. Signature ID: ${signatureId}${signatureData.notes ? '. Notes: ' + signatureData.notes : ''}`
        : `Request approved by ISSM with CAC signature - Forwarded to CPSO. Signature ID: ${signatureId}${signatureData.notes ? '. Notes: ' + signatureData.notes : ''}`;
      
      db.query(`
        INSERT INTO aft_request_history (request_id, action, notes, user_email)
        VALUES (?, ?, ?, ?)
      `).run(
        requestId,
        historyAction,
        historyNotes,
        signerEmail
      );

      // Commit transaction
      db.exec('COMMIT');

      // Audit log
      await auditLog(
        signerId,
        'CAC_SIGNATURE_APPROVAL',
        `CAC signature approval applied to request ${requestId} by ${role}`,
        ipAddress,
        {
          requestId,
          signatureId,
          role,
          certificateThumbprint: signatureData.certificate.thumbprint,
          certificateSubject: signatureData.certificate.subject
        }
      );

      console.log(`✅ CAC signature approval applied to request ${requestId} by ${role} user ${signerId}`);

      return { success: true };

    } catch (error) {
      db.exec('ROLLBACK');
      console.error('Error applying approver CAC signature:', error);
      
      await auditLog(
        signerId,
        'CAC_SIGNATURE_APPROVAL_FAILED',
        `Failed to apply CAC signature approval to request ${requestId}: ${error}`,
        ipAddress,
        { requestId, role, error: String(error) }
      );

      return { 
        success: false, 
        error: `Failed to apply signature: ${error}` 
      };
    }
  }
  
  // Apply CAC signature to request (for SME)
  static async applySignature(
    requestId: number,
    signerId: number,
    signerEmail: string,
    signatureData: CACSignatureData,
    ipAddress: string
  ): Promise<{ success: boolean; error?: string }> {
    const db = getDb();
    
    try {
      // Begin transaction
      db.exec('BEGIN TRANSACTION');

      // Verify request exists and is in correct state
      // Allow both 'draft' (for requestor signatures) and 'pending_sme_signature' (for SME signatures)
      const request = db.query(`
        SELECT id, status, requestor_id 
        FROM aft_requests 
        WHERE id = ? AND (status = 'pending_sme_signature' OR status = 'draft')
      `).get(requestId) as any;

      if (!request) {
        db.exec('ROLLBACK');
        return { 
          success: false, 
          error: 'Request not found or not ready for signature' 
        };
      }

      // Verify certificate validity
      const certValid = this.verifyCertificateValidity(signatureData.certificate);
      if (!certValid.isValid) {
        db.exec('ROLLBACK');
        return { 
          success: false, 
          error: certValid.error || 'Certificate validation failed' 
        };
      }

      // Generate signature hash for integrity
      const signatureHash = await this.generateSignatureHash(signatureData);

      // Store CAC signature
      const signatureId = db.query(`
        INSERT INTO cac_signatures (
          request_id, user_id, step_type,
          certificate_thumbprint, certificate_subject, certificate_issuer,
          certificate_serial, certificate_not_before, certificate_not_after,
          signature_data, signed_data, signature_algorithm, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      `).run(
        requestId, 
        signerId, 
        'requestor_signature', // step_type
        signatureData.certificate.thumbprint,
        signatureData.certificate.subject,
        signatureData.certificate.issuer,
        signatureData.certificate.serialNumber,
        new Date(signatureData.certificate.validFrom).getTime() / 1000, // certificate_not_before (unix timestamp)
        new Date(signatureData.certificate.validTo).getTime() / 1000, // certificate_not_after (unix timestamp)
        signatureData.signature, // signature_data
        JSON.stringify(signatureData), // signed_data
        signatureData.algorithm // signature_algorithm
      ).lastInsertRowid as number;

      // Update request status
      db.query(`
        UPDATE aft_requests 
        SET status = 'pending_media_custodian',
            updated_at = unixepoch(),
            sme_id = ?,
            sme_signature_date = unixepoch()
        WHERE id = ?
      `).run(signerId, requestId);

      // Add to request history
      db.query(`
        INSERT INTO aft_request_history (request_id, action, notes, user_email)
        VALUES (?, ?, ?, ?)
      `).run(
        requestId,
        'SME_CAC_SIGNED',
        `Request digitally signed with CAC certificate by SME. Signature ID: ${signatureId}${signatureData.notes ? '. Notes: ' + signatureData.notes : ''}`,
        signerEmail
      );

      // Commit transaction
      db.exec('COMMIT');

      // Audit log
      await auditLog(
        signerId,
        'CAC_SIGNATURE_APPLIED',
        `CAC signature applied to request ${requestId}`,
        ipAddress,
        {
          requestId,
          signatureId,
          certificateThumbprint: signatureData.certificate.thumbprint,
          certificateSubject: signatureData.certificate.subject
        }
      );

      console.log(`✅ CAC signature applied to request ${requestId} by user ${signerId}`);

      return { success: true };

    } catch (error) {
      db.exec('ROLLBACK');
      console.error('Error applying CAC signature:', error);
      
      await auditLog(
        signerId,
        'CAC_SIGNATURE_FAILED',
        `Failed to apply CAC signature to request ${requestId}: ${error}`,
        ipAddress,
        { requestId, error: String(error) }
      );

      return { 
        success: false, 
        error: `Failed to apply signature: ${error}` 
      };
    }
  }

  // Verify certificate validity
  static verifyCertificateValidity(certificate: CACSignatureData['certificate']): { isValid: boolean; error?: string } {
    try {
      // Check certificate dates
      const validFrom = new Date(certificate.validFrom);
      const validTo = new Date(certificate.validTo);
      const now = new Date();

      if (now < validFrom) {
        return { isValid: false, error: 'Certificate is not yet valid' };
      }

      if (now > validTo) {
        return { isValid: false, error: 'Certificate has expired' };
      }

      // Check if certificate is from DOD CA
      if (!certificate.issuer.includes('DOD') && !certificate.issuer.includes('DEPARTMENT OF DEFENSE')) {
        return { isValid: false, error: 'Certificate must be issued by DOD Certificate Authority' };
      }

      // Check certificate subject format for CAC
      if (!certificate.subject.includes('CN=') || !certificate.subject.includes('OU=')) {
        return { isValid: false, error: 'Invalid certificate subject format for CAC certificate' };
      }

      return { isValid: true };

    } catch (error) {
      return { isValid: false, error: `Certificate validation error: ${error}` };
    }
  }

  // Generate signature hash for integrity verification
  static async generateSignatureHash(signatureData: CACSignatureData): Promise<string> {
    const signatureText = JSON.stringify({
      signature: signatureData.signature,
      certificateThumbprint: signatureData.certificate.thumbprint,
      timestamp: signatureData.timestamp,
      algorithm: signatureData.algorithm
    });

    const encoder = new TextEncoder();
    const data = encoder.encode(signatureText);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    
    return Array.from(hashArray, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Get signatures for request
  static getRequestSignatures(requestId: number): any[] {
    const db = getDb();
    
    return db.query(`
      SELECT * FROM cac_signatures 
      WHERE request_id = ? 
      ORDER BY created_at DESC
    `).all(requestId) as any[];
  }

  // Verify signature integrity. The full original signature payload is stored
  // verbatim in `signed_data` (JSON). To verify integrity we re-generate the
  // hash from that payload and compare it to a hash recomputed from the
  // individual columns; the columns and the JSON must agree.
  static async verifySignatureIntegrity(signatureId: number): Promise<{ isValid: boolean; error?: string }> {
    const db = getDb();

    try {
      const signature = db.query(`
        SELECT * FROM cac_signatures WHERE id = ?
      `).get(signatureId) as any;

      if (!signature) {
        return { isValid: false, error: 'Signature not found' };
      }

      // signed_data holds the original CACSignatureData JSON.
      let original: CACSignatureData;
      try {
        original = JSON.parse(signature.signed_data);
      } catch {
        return { isValid: false, error: 'Stored signature payload is corrupt' };
      }

      // Reconstruct from the discrete columns and ensure they match.
      const reconstructed: CACSignatureData = {
        signature: signature.signature_data,
        certificate: {
          thumbprint: signature.certificate_thumbprint,
          subject: signature.certificate_subject,
          issuer: signature.certificate_issuer,
          validFrom: new Date((signature.certificate_not_before as number) * 1000).toISOString(),
          validTo: new Date((signature.certificate_not_after as number) * 1000).toISOString(),
          serialNumber: signature.certificate_serial,
          certificateData: original.certificate.certificateData
        },
        timestamp: original.timestamp,
        algorithm: signature.signature_algorithm
      };

      const originalHash = await this.generateSignatureHash(original);
      const reconstructedHash = await this.generateSignatureHash(reconstructed);
      if (originalHash !== reconstructedHash) {
        return { isValid: false, error: 'Signature integrity check failed' };
      }

      // Verify certificate is still valid
      const certValid = this.verifyCertificateValidity(reconstructed.certificate);
      if (!certValid.isValid) {
        return { isValid: false, error: `Certificate validation failed: ${certValid.error}` };
      }

      return { isValid: true };

    } catch (error) {
      return { isValid: false, error: `Verification error: ${error}` };
    }
  }

  // Get signature display information.
  // The active schema stores certificate validity as unix-epoch INTEGERS in
  // certificate_not_before / certificate_not_after, and signature created_at
  // is also a unix epoch integer. There is no separate signature_timestamp
  // column - we use created_at instead.
  static formatSignatureForDisplay(signature: any): {
    signerName: string;
    signedAt: string;
    certificateInfo: string;
    isValid: boolean;
  } {
    try {
      const subject = this.parseCertificateSubject(signature.certificate_subject);
      const commonName = subject.CN || 'Unknown Signer';

      // Format signer name (CAC format: LAST.FIRST.MIDDLE.ID)
      let signerName = commonName;
      const nameParts = commonName.split('.');
      if (nameParts.length >= 2) {
        signerName = `${nameParts[1]} ${nameParts[0]}`.toUpperCase();
      }

      const signedAt = signature.created_at
        ? new Date((signature.created_at as number) * 1000).toLocaleString()
        : 'Unknown';

      const validTo = signature.certificate_not_after
        ? new Date((signature.certificate_not_after as number) * 1000)
        : null;
      const isExpired = !!validTo && validTo < new Date();
      const certificateInfo = validTo
        ? `Serial: ${signature.certificate_serial}, Expires: ${validTo.toLocaleDateString()}`
        : `Serial: ${signature.certificate_serial}`;

      return {
        signerName,
        signedAt,
        certificateInfo,
        isValid: !isExpired
      };

    } catch (error) {
      return {
        signerName: 'Unknown',
        signedAt: 'Unknown',
        certificateInfo: 'Invalid certificate data',
        isValid: false
      };
    }
  }

  // Parse certificate subject
  static parseCertificateSubject(subject: string): Record<string, string> {
    const parsed: Record<string, string> = {};
    const parts = subject.split(',');
    
    parts.forEach(part => {
      const [key, value] = part.trim().split('=');
      if (key && value) {
        parsed[key.trim()] = value.trim();
      }
    });

    return parsed;
  }

  // Generate signature block for display
  static generateSignatureBlock(signature: any): string {
    const display = this.formatSignatureForDisplay(signature);
    const subject = this.parseCertificateSubject(signature.certificate_subject);
    
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
          <div>
            <span class="font-medium">Signed by:</span>
            <span class="ml-2">${display.signerName}</span>
          </div>
          <div>
            <span class="font-medium">Organization:</span>
            <span class="ml-2">${organization}</span>
          </div>
          <div>
            <span class="font-medium">Signed on:</span>
            <span class="ml-2">${display.signedAt}</span>
          </div>
          <div>
            <span class="font-medium">Certificate:</span>
            <span class="ml-2 font-mono text-xs">${display.certificateInfo}</span>
          </div>
          ${signature.notes ? `
            <div>
              <span class="font-medium">Notes:</span>
              <span class="ml-2">${signature.notes}</span>
            </div>
          ` : ''}
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

  // Export signature for verification. Uses the active schema (user_id,
  // signed_data, certificate_not_before/after as unix epochs).
  static exportSignatureData(signatureId: number): any {
    const db = getDb();

    const signature = db.query(`
      SELECT cs.*, r.request_number, u.first_name, u.last_name, u.email
      FROM cac_signatures cs
      LEFT JOIN aft_requests r ON cs.request_id = r.id
      LEFT JOIN users u ON cs.user_id = u.id
      WHERE cs.id = ?
    `).get(signatureId) as any;

    if (!signature) return null;

    let original: any = null;
    try { original = JSON.parse(signature.signed_data); } catch {}

    return {
      signatureId: signature.id,
      requestId: signature.request_id,
      requestNumber: signature.request_number,
      signer: {
        name: `${signature.first_name || ''} ${signature.last_name || ''}`.trim(),
        email: signature.email
      },
      certificate: {
        thumbprint: signature.certificate_thumbprint,
        subject: signature.certificate_subject,
        issuer: signature.certificate_issuer,
        serialNumber: signature.certificate_serial,
        validFrom: new Date((signature.certificate_not_before as number) * 1000).toISOString(),
        validTo: new Date((signature.certificate_not_after as number) * 1000).toISOString(),
        data: original?.certificate?.certificateData || null
      },
      signature: {
        data: signature.signature_data,
        algorithm: signature.signature_algorithm,
        timestamp: original?.timestamp || null
      },
      notes: original?.notes || null,
      createdAt: signature.created_at
    };
  }

  // Apply DTA CAC signature to transfer
  static async applyDTASignature(
    requestId: number,
    signerId: number,
    signerEmail: string,
    signatureData: CACSignatureData,
    ipAddress: string,
    smeUserId: number
  ): Promise<{ success: boolean; error?: string }> {
    const db = getDb();
    
    try {
      // Begin transaction
      db.exec('BEGIN TRANSACTION');

      // Verify request exists and is ready for DTA signature
      const request = db.query(`
        SELECT id, status 
        FROM aft_requests 
        WHERE id = ? AND dta_id = ?
      `).get(requestId, signerId) as any;

      if (!request) {
        db.exec('ROLLBACK');
        return { 
          success: false, 
          error: 'Request not found or access denied' 
        };
      }

      // Verify certificate validity
      const certValid = this.verifyCertificateValidity(signatureData.certificate);
      if (!certValid.isValid) {
        db.exec('ROLLBACK');
        return { 
          success: false, 
          error: certValid.error || 'Certificate validation failed' 
        };
      }

      // Generate signature hash for integrity
      const signatureHash = await this.generateSignatureHash(signatureData);

      // Store CAC signature
      const signatureId = db.query(`
        INSERT INTO cac_signatures (
          request_id, user_id, step_type,
          certificate_thumbprint, certificate_subject, certificate_issuer,
          certificate_serial, certificate_not_before, certificate_not_after,
          signature_data, signed_data, signature_algorithm, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      `).run(
        requestId, 
        signerId, 
        'dta_signature',
        signatureData.certificate.thumbprint,
        signatureData.certificate.subject,
        signatureData.certificate.issuer,
        signatureData.certificate.serialNumber,
        new Date(signatureData.certificate.validFrom).getTime() / 1000,
        new Date(signatureData.certificate.validTo).getTime() / 1000,
        signatureData.signature,
        JSON.stringify(signatureData),
        signatureData.algorithm
      ).lastInsertRowid as number;

      // Update request status and assign SME
      db.query(`
        UPDATE aft_requests 
        SET status = 'pending_sme_signature',
            dta_signature_date = unixepoch(),
            assigned_sme_id = ?,
            updated_at = unixepoch()
        WHERE id = ?
      `).run(smeUserId, requestId);

      // Add to request history
      db.query(`
        INSERT INTO aft_request_history (request_id, action, notes, user_email)
        VALUES (?, ?, ?, ?)
      `).run(
        requestId,
        'DTA_SIGNED_CAC',
        `DTA CAC signature applied and forwarded to SME. Signature ID: ${signatureId}${signatureData.notes ? '. Notes: ' + signatureData.notes : ''}`,
        signerEmail
      );

      // Commit transaction
      db.exec('COMMIT');

      // Audit log
      await auditLog(
        signerId,
        'CAC_SIGNATURE_DTA',
        `DTA CAC signature applied to request ${requestId}`,
        ipAddress,
        {
          requestId,
          signatureId,
          smeUserId,
          certificateThumbprint: signatureData.certificate.thumbprint,
          certificateSubject: signatureData.certificate.subject
        }
      );

      console.log(`✅ DTA CAC signature applied to request ${requestId} by user ${signerId}`);

      return { success: true };

    } catch (error) {
      db.exec('ROLLBACK');
      console.error('Error applying DTA CAC signature:', error);
      
      await auditLog(
        signerId,
        'CAC_SIGNATURE_DTA_FAILED',
        `Failed to apply DTA CAC signature to request ${requestId}: ${error}`,
        ipAddress,
        { requestId, error: String(error) }
      );

      return {
        success: false,
        error: `Failed to apply signature: ${error}`
      };
    }
  }

  // Apply SME CAC signature to complete two-person integrity check
  static async applySMESignature(
    requestId: number,
    signerId: number,
    signerEmail: string,
    signatureData: CACSignatureData,
    ipAddress: string
  ): Promise<{ success: boolean; error?: string }> {
    const db = getDb();

    try {
      // Begin transaction
      db.exec('BEGIN TRANSACTION');

      // Verify request exists and is ready for SME signature
      const request = db.query(`
        SELECT id, status, assigned_sme_id
        FROM aft_requests
        WHERE id = ? AND status = 'pending_sme_signature'
      `).get(requestId) as any;

      if (!request) {
        db.exec('ROLLBACK');
        return {
          success: false,
          error: 'Request not found or not ready for SME signature'
        };
      }

      // Verify this SME is assigned to this request
      if (request.assigned_sme_id && request.assigned_sme_id !== signerId) {
        db.exec('ROLLBACK');
        return {
          success: false,
          error: 'You are not assigned to sign this request'
        };
      }

      // Verify certificate validity
      const certValid = this.verifyCertificateValidity(signatureData.certificate);
      if (!certValid.isValid) {
        db.exec('ROLLBACK');
        return {
          success: false,
          error: certValid.error || 'Certificate validation failed'
        };
      }

      // Generate signature hash for integrity
      const signatureHash = await this.generateSignatureHash(signatureData);

      // Store CAC signature
      const signatureId = db.query(`
        INSERT INTO cac_signatures (
          request_id, user_id, step_type,
          certificate_thumbprint, certificate_subject, certificate_issuer,
          certificate_serial, certificate_not_before, certificate_not_after,
          signature_data, signed_data, signature_algorithm, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      `).run(
        requestId,
        signerId,
        'sme_signature',
        signatureData.certificate.thumbprint,
        signatureData.certificate.subject,
        signatureData.certificate.issuer,
        signatureData.certificate.serialNumber,
        new Date(signatureData.certificate.validFrom).getTime() / 1000,
        new Date(signatureData.certificate.validTo).getTime() / 1000,
        signatureData.signature,
        JSON.stringify(signatureData),
        signatureData.algorithm
      ).lastInsertRowid as number;

      // Update request status to forward to media custodian
      db.query(`
        UPDATE aft_requests
        SET status = 'pending_media_custodian',
            sme_signature_date = unixepoch(),
            updated_at = unixepoch()
        WHERE id = ?
      `).run(requestId);

      // Add to request history
      db.query(`
        INSERT INTO aft_request_history (request_id, action, notes, user_email)
        VALUES (?, ?, ?, ?)
      `).run(
        requestId,
        'SME_SIGNED_CAC',
        `SME CAC signature applied. Two-Person Integrity check completed. Signature ID: ${signatureId}${signatureData.notes ? '. Notes: ' + signatureData.notes : ''}`,
        signerEmail
      );

      // Commit transaction
      db.exec('COMMIT');

      // Audit log
      await auditLog(
        signerId,
        'CAC_SIGNATURE_SME',
        `SME CAC signature applied to request ${requestId}`,
        ipAddress,
        {
          requestId,
          signatureId,
          certificateThumbprint: signatureData.certificate.thumbprint,
          certificateSubject: signatureData.certificate.subject
        }
      );

      console.log(`✅ SME CAC signature applied to request ${requestId} by user ${signerId}`);

      return { success: true };

    } catch (error) {
      db.exec('ROLLBACK');
      console.error('Error applying SME CAC signature:', error);

      await auditLog(
        signerId,
        'CAC_SIGNATURE_SME_FAILED',
        `Failed to apply SME CAC signature to request ${requestId}: ${error}`,
        ipAddress,
        { requestId, error: String(error) }
      );

      return {
        success: false,
        error: `Failed to apply signature: ${error}`
      };
    }
  }

  // Apply DTA CAC signature without workflow status changes (for signing only)
  static async applyDTASignatureOnly(
    requestId: number,
    signerId: number,
    signerEmail: string,
    signatureData: CACSignatureData,
    ipAddress: string
  ): Promise<{ success: boolean; error?: string }> {
    const db = getDb();

    try {
      // Begin transaction
      db.exec('BEGIN TRANSACTION');

      // Verify request exists and DTA has access
      const request = db.query(`
        SELECT id, status, dta_id
        FROM aft_requests
        WHERE id = ? AND dta_id = ?
      `).get(requestId, signerId) as any;

      if (!request) {
        db.exec('ROLLBACK');
        return {
          success: false,
          error: 'Request not found or access denied'
        };
      }

      // Verify request is in active transfer status
      if (request.status !== 'active_transfer') {
        db.exec('ROLLBACK');
        return {
          success: false,
          error: `Request must be in active transfer status. Current status: ${request.status}`
        };
      }

      // Verify certificate validity
      const certValid = this.verifyCertificateValidity(signatureData.certificate);
      if (!certValid.isValid) {
        db.exec('ROLLBACK');
        return {
          success: false,
          error: certValid.error || 'Certificate validation failed'
        };
      }

      // Generate signature hash for integrity
      const signatureHash = await this.generateSignatureHash(signatureData);

      // Store CAC signature
      const signatureId = db.query(`
        INSERT INTO cac_signatures (
          request_id, user_id, step_type,
          certificate_thumbprint, certificate_subject, certificate_issuer,
          certificate_serial, certificate_not_before, certificate_not_after,
          signature_data, signed_data, signature_algorithm, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      `).run(
        requestId,
        signerId,
        'dta_signature_only',
        signatureData.certificate.thumbprint,
        signatureData.certificate.subject,
        signatureData.certificate.issuer,
        signatureData.certificate.serialNumber,
        new Date(signatureData.certificate.validFrom).getTime() / 1000,
        new Date(signatureData.certificate.validTo).getTime() / 1000,
        signatureData.signature,
        JSON.stringify(signatureData),
        signatureData.algorithm
      ).lastInsertRowid as number;

      // Update DTA signature date only (do NOT change status)
      db.query(`
        UPDATE aft_requests
        SET dta_signature_date = unixepoch(),
            updated_at = unixepoch()
        WHERE id = ?
      `).run(requestId);

      // Add to request history
      db.query(`
        INSERT INTO aft_request_history (request_id, action, notes, user_email)
        VALUES (?, ?, ?, ?)
      `).run(
        requestId,
        'DTA_SIGNED_CAC_ONLY',
        `DTA CAC signature applied. Signature ID: ${signatureId}${signatureData.notes ? '. Notes: ' + signatureData.notes : ''}`,
        signerEmail
      );

      // Commit transaction
      db.exec('COMMIT');

      // Audit log
      await auditLog(
        signerId,
        'CAC_SIGNATURE_DTA_ONLY',
        `DTA CAC signature applied to request ${requestId} (no workflow change)`,
        ipAddress,
        {
          requestId,
          signatureId,
          certificateThumbprint: signatureData.certificate.thumbprint,
          certificateSubject: signatureData.certificate.subject
        }
      );

      console.log(`✅ DTA CAC signature applied to request ${requestId} by user ${signerId} (no workflow change)`);

      return { success: true };

    } catch (error) {
      db.exec('ROLLBACK');
      console.error('Error applying DTA CAC signature:', error);

      await auditLog(
        signerId,
        'CAC_SIGNATURE_DTA_ONLY_FAILED',
        `Failed to apply DTA CAC signature to request ${requestId}: ${error}`,
        ipAddress,
        { requestId, error: String(error) }
      );

      return {
        success: false,
        error: `Failed to apply signature: ${error}`
      };
    }
  }
}

// Initialize tables when module is imported
CACSignatureManager.initializeTables();