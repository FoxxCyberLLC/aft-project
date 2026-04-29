// SME API Endpoints

import { type CACSignatureData, CACSignatureManager } from '../../lib/cac-signature';
import { type DbRow, getDb, UserRole } from '../../lib/database-bun';
import { RequestTrackingService } from '../../lib/request-tracking';
import { auditLog, type SecureSession } from '../../lib/security';
import { RoleMiddleware } from '../../middleware/role-middleware';

export async function handleSMEAPI(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response | null> {
  if (!path.startsWith('/api/sme/')) {
    return null;
  }

  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.SME);
  if (authResult.response) return authResult.response;
  const csrfFail = RoleMiddleware.verifyCsrf(request, authResult.session);
  if (csrfFail) return csrfFail;

  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/');

  // Path: /api/sme/cac-info
  if (pathSegments[3] === 'cac-info' && request.method === 'GET') {
    return getCACInfo(authResult.session);
  }

  // Path: /api/sme/requests/:id
  if (pathSegments[3] === 'requests' && pathSegments.length >= 5) {
    const requestId = parseInt(pathSegments[4] || '', 10);
    if (Number.isNaN(requestId)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid request ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'GET') {
      return getRequestDetails(requestId);
    } else if (request.method === 'POST' && pathSegments[5] === 'sign') {
      if (!authResult.session.email || !authResult.session.userId) {
        return new Response(JSON.stringify({ success: false, error: 'User session invalid' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return signRequest(requestId, authResult.session.email, authResult.session.userId, request);
    } else if (request.method === 'POST' && pathSegments[5] === 'sign-cac') {
      if (!authResult.session.email || !authResult.session.userId) {
        return new Response(JSON.stringify({ success: false, error: 'User session invalid' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return signRequestWithCAC(
        requestId,
        authResult.session.email,
        authResult.session.userId,
        request,
        ipAddress,
      );
    }
  }

  return new Response(JSON.stringify({ success: false, error: 'SME API endpoint not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getRequestDetails(requestId: number): Promise<Response> {
  const db = getDb();
  const requestData = await db.query('SELECT * FROM aft_requests WHERE id = ?').get(requestId);

  if (!requestData) {
    return new Response(JSON.stringify({ success: false, error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true, request: requestData }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function signRequest(
  requestId: number,
  smeEmail: string,
  smeUserId: number,
  request: Request,
): Promise<Response> {
  const db = getDb();

  try {
    const body = (await request.json()) as { notes?: string };
    const { notes } = body;

    const requestData = (await db
      .query('SELECT * FROM aft_requests WHERE id = ?')
      .get(requestId)) as DbRow;

    if (!requestData) {
      return new Response(JSON.stringify({ success: false, error: 'Request not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (requestData.status !== 'pending_sme_signature') {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Request is not pending SME signature. Current status: ${requestData.status}`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    await db.withTransaction(async (tx) => {
      // Update request status to forward to media custodian
      await tx
        .query(`
        UPDATE aft_requests
        SET status = 'pending_media_custodian',
            sme_signature_date = EXTRACT(EPOCH FROM NOW())::BIGINT,
            updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = ?
      `)
        .run(requestId);

      // Add to request history
      await tx
        .query(`
        INSERT INTO aft_request_history (request_id, action, user_email, notes, created_at)
        VALUES (?, 'SME_SIGNED', ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
      `)
        .run(
          requestId,
          smeEmail,
          `SME signature provided. Two-Person Integrity check completed. ${notes || ''}`,
        );
    });

    await RequestTrackingService.addAuditEntry(
      requestId,
      smeUserId,
      'sme_signed',
      requestData.status,
      'pending_media_custodian',
      undefined,
      'SME signature provided, forwarded to Media Custodian for final processing.',
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Request signed successfully and forwarded to Media Custodian',
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Error signing request:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Database error while signing request.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

async function signRequestWithCAC(
  requestId: number,
  smeEmail: string,
  smeUserId: number,
  request: Request,
  ipAddress: string,
): Promise<Response> {
  const db = getDb();

  try {
    const body = (await request.json()) as {
      signature: string;
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
    };
    const { signature, certificate, timestamp, algorithm, notes } = body;

    const requestData = (await db
      .query('SELECT * FROM aft_requests WHERE id = ?')
      .get(requestId)) as DbRow;

    if (!requestData) {
      return new Response(JSON.stringify({ success: false, error: 'Request not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (requestData.status !== 'pending_sme_signature') {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Request is not pending SME signature. Current status: ${requestData.status}`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

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

    // Apply CAC signature for SME
    const signatureResult = await CACSignatureManager.applySMESignature(
      requestId,
      smeUserId,
      smeEmail,
      signatureData,
      ipAddress,
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

    // Audit log
    await auditLog(
      smeUserId,
      'SME_CAC_SIGNATURE',
      `CAC signature applied to request ${requestId} by SME`,
      ipAddress,
      {
        requestId,
        certificateThumbprint: certificate.thumbprint,
        certificateSubject: certificate.subject,
      },
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Request signed with CAC signature and forwarded to Media Custodian',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    console.error('Error signing request with CAC:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to apply CAC signature' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

// Get client certificate information for CAC authentication
function getCACInfo(session?: SecureSession): Response {
  try {
    // First check if we have CAC info stored in the session
    let hasCACCert = false;
    let certInfo = null;

    if (session?.cacCertificate) {
      // Use CAC from session
      hasCACCert = true;
      certInfo = session.cacCertificate;
      console.log('Using CAC Certificate from session for SME:', {
        subject: certInfo.subject,
        issuer: certInfo.issuer,
        serial: certInfo.serialNumber,
      });
    } else {
      // No client certificate provided
      hasCACCert = false;
      certInfo = null;
      console.log('No CAC certificate found in session for SME');
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
    console.error('Error getting CAC info for SME:', error);
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
