// Requestor API routes

import { type CACSignatureData, CACSignatureManager } from '../../lib/cac-signature';
import { generateRequestNumber, getDb, UserRole, type DbRow } from '../../lib/database-bun';
import { emailService, getNextApproverEmails } from '../../lib/email-service';
import { auditLog } from '../../lib/security';
import { RoleMiddleware } from '../../middleware/role-middleware';

const db = getDb();

export async function handleRequestorAPI(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response | null> {
  const method = request.method;

  // List all DTAs with drive status indicator
  if (path === '/api/requestor/dtas' && method === 'GET') {
    // Allow any authenticated user to access requestor APIs
    const authResult = await RoleMiddleware.checkAuth(request, ipAddress);
    if (authResult.response) return authResult.response;
    try {
      const dtas = (await db
        .query(`
        SELECT DISTINCT u.id, u.email, u.first_name, u.last_name,
          CASE WHEN md.id IS NOT NULL THEN 1 ELSE 0 END as has_drive
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = TRUE
        LEFT JOIN media_drives md ON md.issued_to_user_id = u.id AND md.status = 'issued'
        WHERE u.is_active = TRUE AND ur.role = ?
        ORDER BY u.last_name, u.first_name
      `)
        .all(UserRole.DTA)) as DbRow[];
      return new Response(JSON.stringify(dtas), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (_e) {
      return new Response(JSON.stringify({ error: 'Failed to load DTAs' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Check if a given DTA has an issued drive
  if (
    path.startsWith('/api/requestor/dta/') &&
    path.endsWith('/issued-drive') &&
    method === 'GET'
  ) {
    // Allow any authenticated user to access requestor APIs
    const authResult = await RoleMiddleware.checkAuth(request, ipAddress);
    if (authResult.response) return authResult.response;
    try {
      const segments = path.split('/');
      const dtaIdStr = segments.length >= 5 ? segments[4] : '';
      const dtaId = parseInt(dtaIdStr || '', 10);
      if (!dtaId) {
        return new Response(JSON.stringify({ error: 'Invalid DTA ID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const drive = (await db
        .query(`
        SELECT id, serial_number, media_control_number, type, model, capacity, status, issued_at
        FROM media_drives
        WHERE issued_to_user_id = ? AND status = 'issued'
        ORDER BY issued_at DESC
        LIMIT 1
      `)
        .get(dtaId)) as DbRow;
      return new Response(JSON.stringify({ hasDrive: !!drive, drive: drive || null }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (_e) {
      return new Response(JSON.stringify({ error: 'Failed to check DTA drive' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Requestor save draft API
  if (path === '/api/requestor/save-draft' && method === 'POST') {
    // Allow any authenticated user to access requestor APIs
    const authResult = await RoleMiddleware.checkAuth(request, ipAddress);
    if (authResult.response) return authResult.response;
    const csrfFail = RoleMiddleware.verifyCsrf(request, authResult.session);
    if (csrfFail) return csrfFail;

    try {
      const requestData = (await request.json()) as {
        additional_file_list_attached?: string;
        dest_location?: string;
        dest_system?: string;
        destination_poc?: string;
        destinations_json?: string;
        draft_id?: string;
        dta_id?: string;
        files?: Array<{ name?: string; size?: number; type?: string; hash?: string }>;
        justification?: string;
        media_control_number?: string;
        media_encrypted?: boolean;
        media_type?: string;
        overall_classification?: string;
        source_classification?: string;
        source_is?: string;
        transfer_type?: string;
      };

      // Parse multi-destination payload and prepare transfer_data JSON
      let destinations: Array<{
        is?: string;
        classification?: string;
        location?: string;
        contact?: string;
      }> = [];
      try {
        if (requestData.destinations_json) {
          const parsed = JSON.parse(String(requestData.destinations_json));
          if (Array.isArray(parsed)) destinations = parsed;
        }
      } catch {}
      const transferDataJson = JSON.stringify({ destinations });

      // If primary destination fields are empty, seed them from the first destination entry
      if (destinations.length > 0) {
        const first = destinations[0] || {};
        if (!requestData.dest_system) requestData.dest_system = first.is || '';
        if (!requestData.dest_location) requestData.dest_location = first.location || '';
        if (!requestData.destination_poc) requestData.destination_poc = first.contact || '';
      }

      // Ensure we have a request number and that it is unique
      if (!requestData.media_control_number) {
        requestData.media_control_number = generateRequestNumber();
      }

      // Helper to ensure uniqueness of request_number
      const ensureUniqueRequestNumber = async (
        desired: string,
        excludeId?: number,
      ): Promise<string> => {
        let candidate = desired;
        let attempt = 0;
        while (true) {
          const existing = (await db
            .query('SELECT id FROM aft_requests WHERE request_number = ? LIMIT 1')
            .get(candidate)) as DbRow;
          if (!existing || (excludeId && existing.id === excludeId)) {
            return candidate;
          }
          // Generate a fresh unique number after first collision or if repeated collisions
          candidate = generateRequestNumber();
          attempt++;
          if (attempt > 5) {
            // Extremely unlikely; still return candidate
            return candidate;
          }
        }
      };

      let requestId: number;

      if (requestData.draft_id && requestData.draft_id !== '') {
        // Update existing draft
        requestId = parseInt(requestData.draft_id, 10);

        // Check if request is rejected - prevent editing
        const existingRequest = (await db
          .query(`
          SELECT status FROM aft_requests WHERE id = ? AND requestor_id = ?
        `)
          .get(requestId, authResult.session.userId)) as DbRow;

        if (existingRequest?.status === 'rejected') {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Rejected requests cannot be modified. Please create a new request.',
            }),
            {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }

        // If request_number collides with another record, make it unique (excluding this draft id)
        requestData.media_control_number = await ensureUniqueRequestNumber(
          requestData.media_control_number,
          requestId,
        );

        // Get the drive assigned to the selected DTA
        let selectedDriveId = null;
        if (requestData.dta_id) {
          const dtaDrive = (await db
            .query(`
            SELECT id FROM media_drives 
            WHERE issued_to_user_id = ? AND status = 'issued'
            ORDER BY issued_at DESC LIMIT 1
          `)
            .get(parseInt(requestData.dta_id, 10))) as { id: number } | undefined;
          selectedDriveId = dtaDrive?.id || null;
        }

        await db
          .query(`
          UPDATE aft_requests SET
            request_number = ?,
            status = 'draft',
            requestor_name = ?,
            requestor_org = ?,
            requestor_phone = ?,
            requestor_email = ?,
            transfer_purpose = ?,
            transfer_type = ?,
            classification = ?,
            data_description = ?,
            source_system = ?,
            source_location = ?,
            dta_id = ?,
            selected_drive_id = ?,
            dest_system = ?,
            dest_location = ?,
            dest_contact = ?,
            files_list = ?,
            additional_file_list_attached = ?,
            compression_required = ?,
            encryption = ?,
            transfer_data = ?,
            updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
          WHERE id = ? AND requestor_id = ?
        `)
          .run(
            requestData.media_control_number,
            authResult.session.email.split('@')[0], // Extract name from email
            'AFT System', // Default org
            '555-0000', // Default phone
            authResult.session.email,
            requestData.justification || '',
            requestData.transfer_type || '',
            requestData.overall_classification || '',
            `Transfer Type: ${requestData.transfer_type || 'N/A'}, Media: ${requestData.media_type || 'N/A'}`,
            requestData.source_is || '',
            requestData.source_classification || '',
            requestData.dta_id ? parseInt(requestData.dta_id, 10) : null,
            selectedDriveId,
            requestData.dest_system || '',
            requestData.dest_location || '',
            requestData.destination_poc || '',
            JSON.stringify(requestData.files || []),
            !!requestData.additional_file_list_attached,
            !!requestData.media_encrypted,
            requestData.media_encrypted ? 'Yes' : 'No',
            transferDataJson,
            requestId,
            authResult.session.userId,
          );
      } else {
        // Create new draft
        // Ensure unique request number
        requestData.media_control_number = await ensureUniqueRequestNumber(
          requestData.media_control_number,
        );

        // Get the drive assigned to the selected DTA
        let selectedDriveId = null;
        if (requestData.dta_id) {
          const dtaDrive = (await db
            .query(`
            SELECT id FROM media_drives 
            WHERE issued_to_user_id = ? AND status = 'issued'
            ORDER BY issued_at DESC LIMIT 1
          `)
            .get(parseInt(requestData.dta_id, 10))) as { id: number } | undefined;
          selectedDriveId = dtaDrive?.id || null;
        }

        const result = (await db
          .query(`
          INSERT INTO aft_requests (
            request_number, status, requestor_id, requestor_name, requestor_org, requestor_phone, requestor_email,
            transfer_purpose, transfer_type, classification, data_description, source_system, source_location,
            dta_id, selected_drive_id, dest_system, dest_location, dest_contact, files_list, additional_file_list_attached,
            compression_required, encryption, transfer_data, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT)
        `)
          .run(
            requestData.media_control_number,
            'draft',
            authResult.session.userId,
            authResult.session.email.split('@')[0], // Extract name from email
            'AFT System', // Default org
            '555-0000', // Default phone
            authResult.session.email,
            requestData.justification || '',
            requestData.transfer_type || '',
            requestData.overall_classification || '',
            `Transfer Type: ${requestData.transfer_type || 'N/A'}, Media: ${requestData.media_type || 'N/A'}`,
            requestData.source_is || '',
            requestData.source_classification || '',
            requestData.dta_id ? parseInt(requestData.dta_id, 10) : null,
            selectedDriveId,
            requestData.dest_system || '',
            requestData.dest_location || '',
            requestData.destination_poc || '',
            JSON.stringify(requestData.files || []),
            !!requestData.additional_file_list_attached,
            !!requestData.media_encrypted,
            requestData.media_encrypted ? 'Yes' : 'No',
            transferDataJson,
          ));

        requestId = Number(result.lastInsertRowid);
      }

      // Send notification if DTA was selected
      if (requestData.dta_id) {
        const dtaUser = (await db
          .query(`
          SELECT email, first_name, last_name
          FROM users
          WHERE id = ?
        `)
          .get(parseInt(requestData.dta_id, 10))) as { email: string; first_name: string; last_name: string } | undefined;

        if (dtaUser) {
          await emailService.notifyDTASelection(requestId, dtaUser.email, {
            requestNumber: requestData.media_control_number,
            requestorName: authResult.session.email,
            transferType: requestData.transfer_type || 'N/A',
            classification: requestData.overall_classification || 'N/A',
            dtaName: `${dtaUser.first_name} ${dtaUser.last_name}`,
          });
        }
      }

      await auditLog(
        authResult.session.userId,
        'AFT_DRAFT_SAVED',
        `AFT request draft saved: ${requestData.media_control_number}`,
        ipAddress,
      );

      return new Response(
        JSON.stringify({
          success: true,
          requestId,
          message: 'Draft saved successfully',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (error: any) {
      console.error('Error saving AFT draft:', error);
      return new Response(
        JSON.stringify({
          success: false,
          message: `Failed to save draft: ${error.message}`,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  // Requestor submit (or resubmit) request API
  if (path === '/api/requestor/submit-request' && method === 'POST') {
    // Allow any authenticated user to access requestor APIs
    const authResult = await RoleMiddleware.checkAuth(request, ipAddress);
    if (authResult.response) return authResult.response;
    const csrfFail = RoleMiddleware.verifyCsrf(request, authResult.session);
    if (csrfFail) return csrfFail;

    try {
      const requestData = (await request.json()) as {
        requestId?: number;
        signatureMethod?: 'cac' | 'manual';
        manualSignature?: string;
        cacCertificate?: {
          signature: string;
          thumbprint: string;
          subject: string;
          issuer: string;
          serialNumber: string;
          validFrom: string;
          validTo: string;
          certificateData: string;
          timestamp: string;
          algorithm: string;
          notes?: string;
        };
      };
      const { requestId, signatureMethod, manualSignature, cacCertificate } = requestData;

      if (!requestId) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Request ID is required',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      if (!signatureMethod || !['manual', 'cac'].includes(signatureMethod)) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Valid signature method is required (manual or cac)',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      // Verify the request belongs to this user and is in a submittable status
      const existingRequest = (await db
        .query(`
        SELECT id, status, request_number, transfer_type FROM aft_requests 
        WHERE id = ? AND requestor_id = ?
      `)
        .get(requestId, authResult.session.userId)) as { id: number; status: string; request_number: string; transfer_type: string | null; classification: string | null; } | undefined;

      console.log('Submit request - Request ID:', requestId, 'User ID:', authResult.session.userId);
      console.log('Found request:', existingRequest);

      if (!existingRequest) {
        console.log('ERROR: Request not found or access denied');
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Request not found or access denied',
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      console.log('Request found successfully, checking status:', existingRequest.status);

      if (!['draft'].includes(existingRequest.status)) {
        console.log('ERROR: Request status is not draft:', existingRequest.status);
        return new Response(
          JSON.stringify({
            success: false,
            message: `Request status is '${existingRequest.status}', only draft requests can be submitted`,
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      console.log('Status check passed, proceeding with submission...');

      // Determine initial status based on transfer type
      // High-to-Low transfers require DAO review first, others go directly to approver
      const nextStatus =
        existingRequest.transfer_type === 'high-to-low' ? 'pending_dao' : 'pending_approver';

      // Handle signature based on method
      let signatureResult: { success: boolean; error?: string } | undefined;

      if (signatureMethod === 'cac') {
        // CAC signing requires the client to provide the actual signature value,
        // certificate, and the timestamp/algorithm produced by the local CAC
        // middleware (browser plugin / native host). We do not synthesise these
        // values server-side - that would defeat the entire purpose of a CAC
        // signature. Validate that all the required pieces are present.
        if (
          !cacCertificate?.signature ||
          !cacCertificate.thumbprint ||
          !cacCertificate.subject ||
          !cacCertificate.issuer ||
          !cacCertificate.serialNumber ||
          !cacCertificate.validFrom ||
          !cacCertificate.validTo ||
          !cacCertificate.certificateData ||
          !cacCertificate.timestamp ||
          !cacCertificate.algorithm
        ) {
          return new Response(
            JSON.stringify({
              success: false,
              message:
                'CAC signature data is incomplete. The browser CAC client must provide signature, certificate (subject/issuer/serial/thumbprint/validFrom/validTo/certificateData), timestamp and algorithm.',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }

        const cacSignatureData: CACSignatureData = {
          signature: cacCertificate.signature,
          certificate: {
            thumbprint: cacCertificate.thumbprint,
            subject: cacCertificate.subject,
            issuer: cacCertificate.issuer,
            validFrom: cacCertificate.validFrom,
            validTo: cacCertificate.validTo,
            serialNumber: cacCertificate.serialNumber,
            certificateData: cacCertificate.certificateData,
          },
          timestamp: cacCertificate.timestamp,
          algorithm: cacCertificate.algorithm,
          notes: cacCertificate.notes || 'Requestor CAC signature',
        };

        // Apply the CAC signature using the proper CAC signature manager
        signatureResult = await CACSignatureManager.applySignature(
          requestId,
          authResult.session.userId,
          authResult.session.email,
          cacSignatureData,
          ipAddress,
        );

        if (!signatureResult.success) {
          console.log('ERROR: CAC signature failed:', signatureResult.error);
          return new Response(
            JSON.stringify({
              success: false,
              message: signatureResult.error || 'Failed to apply CAC signature',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }

        console.log('CAC signature applied successfully');
      } else if (signatureMethod === 'manual') {
        // Manual signature processing
        if (!manualSignature || manualSignature.trim() === '') {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Manual signature (full name) is required',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }

        // Store manual signature record
        await db
          .query(`
          INSERT INTO manual_signatures (
            request_id, signer_id, signer_email, signature_text,
            certification_statement, signature_timestamp, ip_address, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
        `)
          .run(
            requestId,
            authResult.session.userId,
            authResult.session.email,
            manualSignature.trim(),
            'I certify that the above file(s)/media to be transferred to/from the IS are required to support the development and sustainment contractual efforts and comply with all applicable security requirements.',
            new Date().toISOString(),
            ipAddress,
          );
      }

      // Update request status
      await db
        .query(`
        UPDATE aft_requests SET
          status = ?,
          rejection_reason = NULL,
          updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT,
          signature_method = ?,
          submitted_at = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = ?
      `)
        .run(nextStatus, signatureMethod, requestId);

      // Notify next approver in the queue
      const nextApproverEmails = await getNextApproverEmails(nextStatus);
      for (const email of nextApproverEmails) {
        await emailService.notifyNextApprover(requestId, nextStatus, email, {
          requestNumber: existingRequest.request_number,
          requestorName: authResult.session.email,
          transferType: existingRequest.transfer_type || 'N/A',
          classification: existingRequest.classification || 'N/A',
        });
      }

      // History: mark submission with signature method
      const historyNote =
        signatureMethod === 'cac'
          ? 'Request submitted with CAC digital signature'
          : 'Request submitted with manual signature';

      try {
        await db
          .query(`
          INSERT INTO aft_request_history (request_id, action, user_email, notes, created_at)
          VALUES (?, 'SUBMITTED', ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
        `)
          .run(requestId, authResult.session.email, historyNote);
      } catch {}

      await auditLog(
        authResult.session.userId,
        'AFT_REQUEST_SUBMITTED',
        `AFT request submitted for approval: ${existingRequest.request_number} (${signatureMethod} signature)`,
        ipAddress,
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Request submitted successfully and is now pending ISSM/ISSO review',
          status: 'submitted',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (error: any) {
      console.error('Error submitting AFT request:', error);
      return new Response(
        JSON.stringify({
          success: false,
          message: `Failed to submit request: ${error.message}`,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  // Get client certificate information for CAC authentication
  if (path === '/api/requestor/cac-info' && method === 'GET') {
    // Allow any authenticated user to access requestor APIs
    const authResult = await RoleMiddleware.checkAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    try {
      // First check if we have CAC info stored in the session
      const session = authResult.session;
      let hasCACCert = false;
      let certInfo = null;

      if (session.cacCertificate) {
        // Use CAC from session
        hasCACCert = true;
        certInfo = session.cacCertificate;
        console.log('Using CAC Certificate from session:', {
          subject: certInfo.subject,
          issuer: certInfo.issuer,
          serial: certInfo.serialNumber,
        });
      } else {
        // Check headers as fallback (shouldn't happen with Apache setup)
        const clientCertSubject = request.headers.get('X-Client-Cert-Subject');
        const clientCertIssuer = request.headers.get('X-Client-Cert-Issuer');
        const clientCertSerial = request.headers.get('X-Client-Cert-Serial');
        const clientCertFingerprint = request.headers.get('X-Client-Cert-Fingerprint');
        const clientCertNotBefore = request.headers.get('X-Client-Cert-Not-Before');
        const clientCertNotAfter = request.headers.get('X-Client-Cert-Not-After');
        const clientCertPEM = request.headers.get('X-Client-Cert-PEM');

        if (clientCertSubject && clientCertIssuer) {
          hasCACCert = true;
          certInfo = {
            subject: clientCertSubject,
            issuer: clientCertIssuer,
            serialNumber: clientCertSerial || 'Unknown',
            thumbprint: clientCertFingerprint || 'Unknown',
            validFrom: clientCertNotBefore || new Date().toISOString(),
            validTo: clientCertNotAfter || new Date().toISOString(),
            pemData: clientCertPEM || null,
          };

          console.log('CAC Certificate detected via headers:', {
            subject: clientCertSubject,
            issuer: clientCertIssuer,
            serial: clientCertSerial,
          });
        } else {
          // No client certificate provided
          hasCACCert = false;
          certInfo = null;
          console.log('No CAC certificate found in session or headers');
        }
      }

      return new Response(
        JSON.stringify({
          hasClientCert: hasCACCert,
          certificate: certInfo,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (_e) {
      return new Response(
        JSON.stringify({
          hasClientCert: false,
          error: 'Failed to check client certificate',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  return null;
}
