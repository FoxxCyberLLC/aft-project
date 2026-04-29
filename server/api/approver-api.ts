// Approver API Endpoints

import { type CACSignatureData, CACSignatureManager } from '../../lib/cac-signature';
import { getDb, UserRole, type DbRow } from '../../lib/database-bun';
import { emailService, getNextApproverEmails } from '../../lib/email-service';
import { escapeCsv, escapeHtml } from '../../lib/formatters';
import { auditLog } from '../../lib/security';
import { RoleMiddleware } from '../../middleware/role-middleware';

export async function handleApproverAPI(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response> {
  // Check authentication and APPROVER role (ISSM only)
  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress);
  if (authResult.response) return authResult.response;
  const activeRole = authResult.session.activeRole || authResult.session.primaryRole;
  if (activeRole !== UserRole.APPROVER) {
    return RoleMiddleware.accessDenied(
      `This API requires APPROVER (ISSM) role. Your current role is ${activeRole?.toUpperCase()}.`,
    );
  }
  // CSRF protection for unsafe methods
  const csrfFail = RoleMiddleware.verifyCsrf(request, authResult.session);
  if (csrfFail) return csrfFail;

  const db = getDb();
  const method = request.method;
  const session = authResult.session;

  // Parse path to get endpoint
  const apiPath = path.replace('/api/approver/', '');

  try {
    // GET endpoints
    if (method === 'GET') {
      if (apiPath === 'pending-count') {
        // Only count requests pending ISSM approval, not CPSO
        const result = (await db
          .query(
            "SELECT COUNT(*) as count FROM aft_requests WHERE status IN ('pending_approver', 'submitted')",
          )
          .get()) as DbRow;
        return new Response(JSON.stringify({ count: result?.count || 0 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (apiPath === 'export/approved') {
        const requests = (await db
          .query(`
          SELECT * FROM aft_requests 
          WHERE status = 'approved' AND approver_email = ?
          ORDER BY updated_at DESC
        `)
          .all(session.email)) as DbRow[];

        // Generate CSV
        const csv = generateCSV(requests);
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="approved-requests.csv"',
          },
        });
      }

      // Get client certificate information for CAC authentication
      if (apiPath === 'cac-info') {
        try {
          // First check if we have CAC info stored in the session
          let hasCACCert = false;
          let certInfo = null;

          if (session.cacCertificate) {
            // Use CAC from session
            hasCACCert = true;
            certInfo = session.cacCertificate;
            console.log('Using CAC Certificate from session for approver:', {
              subject: certInfo.subject,
              issuer: certInfo.issuer,
              serial: certInfo.serialNumber,
            });
          } else {
            // Check headers as fallback (shouldn't happen with proper setup)
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

              console.log('CAC Certificate detected via headers for approver:', {
                subject: clientCertSubject,
                issuer: clientCertIssuer,
                serial: clientCertSerial,
              });
            } else {
              // No client certificate provided
              hasCACCert = false;
              certInfo = null;
              console.log('No CAC certificate found in session or headers for approver');
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
        } catch (error) {
          console.error('Error getting CAC info for approver:', error);
          return new Response(
            JSON.stringify({
              hasClientCert: false,
              certificate: null,
              error: 'Failed to retrieve CAC information',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }
      }
    }

    // POST endpoints
    if (method === 'POST') {
      const body: any = await request.json();

      // Approve request with CAC signature
      if (apiPath.startsWith('approve-cac/')) {
        const requestId = apiPath.split('/')[1];

        if (!requestId) {
          return new Response(JSON.stringify({ error: 'Request ID is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const { signature, certificate, timestamp, algorithm, notes } = body as {
          signature: string;
          certificate: any;
          timestamp: string;
          algorithm: string;
          notes?: string;
        };

        // Validate signature data
        if (!signature || !certificate || !timestamp || !algorithm) {
          return new Response(JSON.stringify({ error: 'Invalid signature data' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Construct CAC signature data
        const signatureData: CACSignatureData = {
          signature,
          certificate,
          timestamp,
          algorithm,
          notes,
        };

        // Apply CAC signature and approve request (ISSM approval)
        const signatureResult = await CACSignatureManager.applyApproverSignature(
          parseInt(requestId, 10),
          session.userId,
          session.email,
          signatureData,
          ipAddress,
          'ISSM', // Always ISSM for approver role
        );

        if (!signatureResult.success) {
          return new Response(
            JSON.stringify({
              success: false,
              error: signatureResult.error || 'Failed to apply CAC signature',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }

        // Log the action
        await auditLog(
          session.userId,
          'REQUEST_APPROVED_CAC',
          `Approved request #${requestId} with CAC signature`,
          ipAddress,
          { requestId },
        );

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Request approved with CAC signature',
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      // Standard approve request (without CAC)
      if (apiPath.startsWith('approve/')) {
        const requestId = apiPath.split('/')[1];

        if (!requestId) {
          return new Response(JSON.stringify({ error: 'Request ID is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const { notes }: { notes?: string } = body;

        // Update request status - ISSM approver sends to CPSO
        const newStatus = 'pending_cpso';

        // Only allow approval if request is in the correct pending state for ISSM
        const allowedStatuses = ['pending_approver', 'submitted', 'pending_approval'];

        const result = await db
          .prepare(`
          UPDATE aft_requests 
          SET status = ?, 
              approver_email = ?,
              approver_id = (SELECT id FROM users WHERE email = ?),
              updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT,
              approval_notes = ?,
              rejection_reason = NULL
          WHERE id = ? AND status IN (${allowedStatuses.map(() => '?').join(',')})
        `)
          .run(
            newStatus,
            session.email,
            session.email,
            notes || null,
            requestId,
            ...allowedStatuses,
          );

        // Check if the update actually affected any rows (prevents double approval)
        if (result.changes === 0) {
          const currentRequest = (await db
            .query('SELECT status FROM aft_requests WHERE id = ?')
            .get(requestId)) as DbRow;
          let errorMessage = 'This request cannot be approved at this time.';

          if (currentRequest) {
            switch (currentRequest.status) {
              case 'pending_cpso':
                errorMessage = 'This request has already been approved and is pending CPSO review.';
                break;
              case 'pending_dta':
                errorMessage =
                  'This request has already been approved by CPSO and is pending DTA assignment.';
                break;
              case 'approved':
                errorMessage = 'This request has already been fully approved.';
                break;
              case 'rejected':
                errorMessage = 'This request has been rejected and cannot be approved.';
                break;
              case 'completed':
                errorMessage = 'This request has already been completed.';
                break;
              default:
                errorMessage = `This request is in "${currentRequest.status}" status and cannot be approved by your role.`;
            }
          }

          return new Response(JSON.stringify({ error: errorMessage }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Get request details for notification
        const requestData = (await db
          .query(`
          SELECT request_number, requestor_email, transfer_type, classification
          FROM aft_requests WHERE id = ?
        `)
          .get(requestId)) as { request_number: string; requestor_email: string; transfer_type: string | null; classification: string | null; } | undefined;

        // Add to history (ISSM approval)
        const historyAction = 'ISSM_APPROVED';
        const historyNotes = notes || 'Request approved by ISSM - Forwarded to CPSO';
        await db
          .prepare(`
          INSERT INTO aft_request_history (request_id, action, user_email, notes, created_at)
          VALUES (?, ?, ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
        `)
          .run(requestId, historyAction, session.email, historyNotes);

        // Notify CPSO approvers
        const requestIdNum = parseInt(requestId, 10);
        const cpsoEmails = await getNextApproverEmails(newStatus);
        for (const email of cpsoEmails) {
          await emailService.notifyNextApprover(requestIdNum, newStatus, email, {
            requestNumber: (requestData?.request_number ?? ""),
            requestorName: (requestData?.requestor_email ?? ""),
            transferType: (requestData?.transfer_type) || 'N/A',
            classification: (requestData?.classification) || 'N/A',
            notes: notes,
          });
        }

        // Notify requestor of approval progress
        await emailService.notifyRequestApproved(requestIdNum, (requestData?.requestor_email ?? ""), {
          requestNumber: (requestData?.request_number ?? ""),
          requestorName: (requestData?.requestor_email ?? ""),
          transferType: (requestData?.transfer_type) || 'N/A',
          classification: (requestData?.classification) || 'N/A',
          nextApprover: 'ISSM',
          notes: notes,
        });

        // Log the action
        await auditLog(
          session.userId,
          'REQUEST_APPROVED',
          `Approved request #${requestId}`,
          ipAddress,
          { requestId },
        );

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Reject request
      if (apiPath.startsWith('reject/')) {
        const requestId = apiPath.split('/')[1];

        if (!requestId) {
          return new Response(JSON.stringify({ error: 'Request ID is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const { reason, notes }: { reason: string; notes?: string } = body;

        if (!reason) {
          return new Response(JSON.stringify({ error: 'Rejection reason is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Update request status to 'rejected' - rejected requests cannot be edited
        // Only allow rejection if request is in the correct pending state for ISSM
        const allowedStatuses = ['pending_approver', 'submitted', 'pending_approval'];

        const result = await db
          .prepare(`
          UPDATE aft_requests 
          SET status = 'rejected',
              approver_email = ?,
              approver_id = (SELECT id FROM users WHERE email = ?),
              updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT,
              rejection_reason = ?,
              approval_notes = ?
          WHERE id = ? AND status IN (${allowedStatuses.map(() => '?').join(',')})
        `)
          .run(session.email, session.email, reason, notes || null, requestId, ...allowedStatuses);

        // Check if the update actually affected any rows
        if (result.changes === 0) {
          const currentRequest = (await db
            .query('SELECT status FROM aft_requests WHERE id = ?')
            .get(requestId)) as DbRow;
          let errorMessage = 'This request cannot be rejected at this time.';

          if (currentRequest) {
            switch (currentRequest.status) {
              case 'pending_cpso':
                errorMessage = 'This request has already been approved and is pending CPSO review.';
                break;
              case 'pending_dta':
                errorMessage =
                  'This request has already been approved by CPSO and cannot be rejected at this stage.';
                break;
              case 'approved':
                errorMessage =
                  'This request has already been fully approved and cannot be rejected.';
                break;
              case 'rejected':
                errorMessage = 'This request has already been rejected.';
                break;
              case 'completed':
                errorMessage = 'This request has already been completed and cannot be rejected.';
                break;
              default:
                errorMessage = `This request is in "${currentRequest.status}" status and cannot be rejected by your role.`;
            }
          }

          return new Response(JSON.stringify({ error: errorMessage }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Get request details for notification
        const requestData = (await db
          .query(`
          SELECT request_number, requestor_email, transfer_type, classification
          FROM aft_requests WHERE id = ?
        `)
          .get(requestId)) as { request_number: string; requestor_email: string; transfer_type: string | null; classification: string | null; } | undefined;

        // Add to history
        await db
          .prepare(`
          INSERT INTO aft_request_history (request_id, action, user_email, notes, created_at)
          VALUES (?, 'REJECTED', ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
        `)
          .run(requestId, session.email, `Reason: ${reason}. ${notes || ''}`);

        // Notify requestor of rejection
        if (requestData) {
          await emailService.notifyRequestRejected(
            parseInt(requestId, 10),
            (requestData?.requestor_email ?? ""),
            {
              requestNumber: (requestData?.request_number ?? ""),
              requestorName: (requestData?.requestor_email ?? ""),
              transferType: (requestData?.transfer_type) || 'N/A',
              classification: (requestData?.classification) || 'N/A',
              nextApprover: 'ISSM',
              rejectionReason: reason,
              notes: notes,
            },
          );
        }

        // Log the action
        await auditLog(
          session.userId,
          'REQUEST_REJECTED',
          `Rejected request #${requestId}: ${reason}`,
          ipAddress,
          { requestId, reason },
        );

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Generate reports
      if (apiPath === 'reports/generate') {
        const { type }: { type: 'monthly' | 'quarterly' | 'annual' } = body;

        // r.updated_at is unixepoch (seconds); compare as unix epoch.
        let dateFilter = '';
        switch (type) {
          case 'monthly':
            dateFilter = `AND r.updated_at >= EXTRACT(EPOCH FROM NOW() - INTERVAL '1 month')::BIGINT`;
            break;
          case 'quarterly':
            dateFilter = `AND r.updated_at >= EXTRACT(EPOCH FROM NOW() - INTERVAL '3 months')::BIGINT`;
            break;
          case 'annual':
            dateFilter = `AND r.updated_at >= EXTRACT(EPOCH FROM NOW() - INTERVAL '1 year')::BIGINT`;
            break;
        }

        const reportData = (await db
          .query(`
          SELECT 
            r.*,
            u.first_name || ' ' || u.last_name as requestor_name,
            u.email as requestor_email
          FROM aft_requests r
          LEFT JOIN users u ON r.requestor_id = u.id
          WHERE r.approver_email = ? ${dateFilter}
          ORDER BY r.updated_at DESC
        `)
          .all(session.email)) as DbRow[];

        // Generate a printable HTML report
        const html = generatePrintableReport(reportData, type, session.email);

        return new Response(html, {
          headers: {
            'Content-Type': 'text/html',
          },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Approver API error:', error);
    await auditLog(
      session.userId,
      'APPROVER_API_ERROR',
      `API error on ${path}: ${error}`,
      ipAddress,
      { error: String(error) },
    );

    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function generateCSV(requests: any[]): string {
  const headers = [
    'Request ID',
    'Source System',
    'Destination System',
    'Classification',
    'Requestor',
    'Approved Date',
    'Status',
  ];
  const rows = requests.map((r) => [
    r.id,
    r.source_system,
    r.dest_system,
    r.classification || 'UNCLASSIFIED',
    r.requestor_email,
    r.updated_at ? new Date((r.updated_at as number) * 1000).toLocaleDateString() : '',
    r.status,
  ]);

  return [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ].join('\n');
}

function generatePrintableReport(requests: any[], type: string, approverEmail: string): string {
  const reportTitle = `${type.charAt(0).toUpperCase() + type.slice(1)} Report`;
  const generatedDate = new Date().toLocaleString();

  const summary = {
    total: requests.length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  };

  const tableRows = requests
    .map(
      (r) => `
    <tr>
        <td>${escapeHtml(r.id)}</td>
        <td>${escapeHtml(r.created_at ? new Date((r.created_at as number) * 1000).toLocaleDateString() : '')}</td>
        <td>${escapeHtml(r.updated_at ? new Date((r.updated_at as number) * 1000).toLocaleDateString() : '')}</td>
        <td>${escapeHtml(r.status)}</td>
        <td>${escapeHtml(r.source_system)} -&gt; ${escapeHtml(r.dest_system)}</td>
        <td>${escapeHtml(r.requestor_name || r.requestor_email)}</td>
    </tr>
  `,
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${reportTitle}</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 2rem; color: #333; }
            h1, h2 { color: #111; }
            table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
            th, td { border: 1px solid #ddd; padding: 0.75rem; text-align: left; font-size: 0.9rem; }
            th { background-color: #f7f7f7; font-weight: 600; }
            .header { border-bottom: 2px solid #eee; padding-bottom: 1rem; margin-bottom: 2rem; }
            .summary { display: flex; justify-content: space-between; list-style: none; padding: 0; margin: 1rem 0; }
            .summary li { border: 1px solid #eee; padding: 1rem; border-radius: 8px; flex-grow: 1; text-align: center; margin: 0 0.5rem; }
            .summary li:first-child { margin-left: 0; }
            .summary li:last-child { margin-right: 0; }
            .summary strong { display: block; font-size: 1.5rem; margin-bottom: 0.25rem; }
            @media print {
                body { margin: 1rem; }
                .no-print { display: none; }
                table { page-break-inside: auto; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                thead { display: table-header-group; }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>${escapeHtml(reportTitle)}</h1>
            <p><strong>Approver:</strong> ${escapeHtml(approverEmail)}</p>
            <p><strong>Generated on:</strong> ${escapeHtml(generatedDate)}</p>
        </div>

        <h2>Summary</h2>
        <ul class="summary">
            <li><strong>${summary.total}</strong> Total Processed</li>
            <li><strong>${summary.approved}</strong> Approved</li>
            <li><strong>${summary.rejected}</strong> Rejected</li>
        </ul>

        <h2>Details</h2>
        <table>
            <thead>
                <tr>
                    <th>Request ID</th>
                    <th>Created</th>
                    <th>Processed</th>
                    <th>Status</th>
                    <th>Transfer Route</th>
                    <th>Requestor</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
        
        <script>
            window.onload = () => {
                window.print();
            };
        </script>
    </body>
    </html>
  `;
}
