// CPSO API Endpoints

import { type CACSignatureData, CACSignatureManager } from '../../lib/cac-signature';
import { getDb, UserRole, type DbRow } from '../../lib/database-bun';
import { escapeCsv, escapeHtml } from '../../lib/formatters';
import { auditLog } from '../../lib/security';
import { RoleMiddleware } from '../../middleware/role-middleware';

export async function handleCPSOAPI(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response> {
  // Check authentication and CPSO role
  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress);
  if (authResult.response) return authResult.response;
  const activeRole = authResult.session.activeRole || authResult.session.primaryRole;
  if (activeRole !== UserRole.CPSO) {
    return RoleMiddleware.accessDenied(
      `This API requires CPSO role. Your current role is ${activeRole?.toUpperCase()}.`,
    );
  }
  // CSRF protection for unsafe methods
  const csrfFail = RoleMiddleware.verifyCsrf(request, authResult.session);
  if (csrfFail) return csrfFail;

  const db = getDb();
  const method = request.method;
  const session = authResult.session;

  // Parse path to get endpoint
  const apiPath = path.replace('/api/cpso/', '');

  try {
    // GET endpoints
    if (method === 'GET') {
      if (apiPath === 'pending-count') {
        const result = (await db
          .query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'pending_cpso'")
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
            'Content-Disposition': 'attachment; filename="cpso-approved-requests.csv"',
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
            console.log('Using CAC Certificate from session for CPSO:', {
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

              console.log('CAC Certificate detected via headers for CPSO:', {
                subject: clientCertSubject,
                issuer: clientCertIssuer,
                serial: clientCertSerial,
              });
            } else {
              // No client certificate provided
              hasCACCert = false;
              certInfo = null;
              console.log('No CAC certificate found in session or headers for CPSO');
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
          console.error('Error getting CAC info for CPSO:', error);
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

        // Apply CAC signature and approve request (CPSO approval to DTA)
        const signatureResult = await CACSignatureManager.applyApproverSignature(
          parseInt(requestId, 10),
          session.userId,
          session.email,
          signatureData,
          ipAddress,
          'CPSO', // CPSO role for final approval
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
          `CPSO approved request #${requestId} with CAC signature`,
          ipAddress,
          { requestId },
        );

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Request approved with CAC signature and forwarded to DTA',
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

        // Update request status to approved (final approval), but only if it
        // is currently pending_cpso. Verify the row count to detect races.
        const result = await db
          .prepare(`
          UPDATE aft_requests
          SET status = 'approved',
              approver_email = ?,
              approver_id = (SELECT id FROM users WHERE email = ?),
              updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT,
              approval_notes = ?,
              rejection_reason = NULL
          WHERE id = ? AND status = 'pending_cpso'
        `)
          .run(session.email, session.email, notes || null, requestId);

        if (result.changes === 0) {
          const current = (await db
            .query('SELECT status FROM aft_requests WHERE id = ?')
            .get(requestId)) as DbRow;
          const errorMessage = current
            ? `This request is in "${current.status}" status and cannot be approved by CPSO.`
            : 'Request not found.';
          return new Response(JSON.stringify({ error: errorMessage }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Add to history
        await db
          .prepare(`
          INSERT INTO aft_request_history (request_id, action, user_email, notes, created_at)
          VALUES (?, 'CPSO_APPROVED', ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
        `)
          .run(requestId, session.email, notes || 'Request approved by CPSO - Final approval');

        // Log the action
        await auditLog(
          session.userId,
          'REQUEST_APPROVED',
          `CPSO approved request #${requestId}`,
          ipAddress,
          { requestId, notes: notes || null },
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

        const result = await db
          .prepare(`
          UPDATE aft_requests
          SET status = 'rejected',
              approver_email = ?,
              approver_id = (SELECT id FROM users WHERE email = ?),
              updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT,
              rejection_reason = ?,
              approval_notes = ?
          WHERE id = ? AND status = 'pending_cpso'
        `)
          .run(session.email, session.email, reason, notes || null, requestId);

        if (result.changes === 0) {
          const current = (await db
            .query('SELECT status FROM aft_requests WHERE id = ?')
            .get(requestId)) as DbRow;
          const errorMessage = current
            ? `This request is in "${current.status}" status and cannot be rejected by CPSO.`
            : 'Request not found.';
          return new Response(JSON.stringify({ error: errorMessage }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Add to history
        await db
          .prepare(`
          INSERT INTO aft_request_history (request_id, action, user_email, notes, created_at)
          VALUES (?, 'CPSO_REJECTED', ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
        `)
          .run(requestId, session.email, `Reason: ${reason}. ${notes || ''}`);

        // Log the action
        await auditLog(
          session.userId,
          'REQUEST_REJECTED',
          `CPSO rejected request #${requestId}: ${reason}`,
          ipAddress,
          { requestId, reason, notes: notes || null },
        );

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Generate reports
      if (apiPath === 'reports/generate') {
        const { type }: { type: 'monthly' | 'quarterly' | 'annual' } = body;

        // r.updated_at is stored as unixepoch (seconds), so use EXTRACT(EPOCH FROM NOW())::BIGINT
        // arithmetic instead of comparing against date() text.
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

        // CPSO reports show requests this CPSO acted on. We don't have
        // dedicated cpso_email/cpso_reviewed_at columns; the CPSO records its
        // approval through the shared approver_email column when status moved
        // out of pending_cpso, and the action timestamp lives in updated_at
        // (and in aft_request_history for audit). Filter on those.
        const reportData = (await db
          .query(`
          SELECT
            r.*,
            u.first_name || ' ' || u.last_name as requestor_name,
            u.email as requestor_email
          FROM aft_requests r
          LEFT JOIN users u ON r.requestor_id = u.id
          WHERE r.approver_email = ?
            AND r.status IN ('approved', 'rejected', 'pending_dta', 'active_transfer', 'pending_sme_signature', 'pending_media_custodian', 'completed', 'disposed')
            ${dateFilter}
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
    console.error('CPSO API error:', error);
    await auditLog(session.userId, 'CPSO_API_ERROR', `API error on ${path}: ${error}`, ipAddress, {
      error: String(error),
    });

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
  const reportTitle = `CPSO ${type.charAt(0).toUpperCase() + type.slice(1)} Report`;
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
            <p><strong>CPSO:</strong> ${escapeHtml(approverEmail)}</p>
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
