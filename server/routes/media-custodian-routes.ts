// Media Custodian Routes - Handle all media custodian-related requests

import { UserRole, type DbRow } from '../../lib/database-bun';
import type { SecureSession } from '../../lib/security';
import { MediaCustodianDashboard } from '../../media-custodian/dashboard';
import { MediaCustodianInventory } from '../../media-custodian/inventory';
import { MediaCustodianReports } from '../../media-custodian/reports';
import { MediaCustodianRequests } from '../../media-custodian/requests';
import { RoleMiddleware } from '../../middleware/role-middleware';
import { MediaCustodianAPI } from '../api/media-custodian-api';
import { createHtmlPage } from '../utils';

// Export handler function for main server
export async function handleMediaCustodianRoutes(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response> {
  // Check authentication and MEDIA_CUSTODIAN role
  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress);
  if (authResult.response) return authResult.response;
  const activeRole = authResult.session.activeRole || authResult.session.primaryRole;
  if (activeRole !== UserRole.MEDIA_CUSTODIAN) {
    return RoleMiddleware.accessDenied(
      `This area requires MEDIA_CUSTODIAN role. Your current role is ${activeRole?.toUpperCase()}.`,
    );
  }

  const user = {
    id: authResult.session.userId,
    email: authResult.session.email,
    role: activeRole,
  };

  if (path === '/media-custodian' || path === '/media-custodian/') {
    return handleDashboard(request, user);
  } else if (path === '/media-custodian/requests') {
    return handleRequestsPage(request, user);
  } else if (path.match(/^\/media-custodian\/requests\/(\d+)$/)) {
    const requestId = path.split('/').pop()!;
    return handleRequestDetailPage(request, user, requestId);
  } else if (path.match(/^\/media-custodian\/requests\/(\d+)\/process$/)) {
    const requestId = path.split('/')[3] || '';
    return handleRequestProcessPage(request, user, requestId);
  } else if (path === '/media-custodian/inventory') {
    return handleInventory(request, user);
  } else if (path === '/media-custodian/reports') {
    return handleReportsPage(request, user);
  } else if (path.startsWith('/media-custodian/api/')) {
    const endpoint = path.replace('/media-custodian/api/', '');
    return handleAPI(request, user, endpoint, authResult.session);
  }

  return new Response('Not Found', { status: 404 });
}

// Dashboard route
async function handleDashboard(_request: Request, user: any): Promise<Response> {
  try {
    const content = await MediaCustodianDashboard.render(user, user.id);
    const script = MediaCustodianDashboard.getScript();

    return new Response(createHtmlPage('AFT Media Custodian - Dashboard', content, script), {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('Error rendering media custodian dashboard:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// Inventory route
async function handleInventory(_request: Request, user: any): Promise<Response> {
  try {
    const content = await MediaCustodianInventory.render(user, user.id);
    const script = MediaCustodianInventory.getScript();

    return new Response(createHtmlPage('AFT Media Custodian - Media Inventory', content, script), {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('Error rendering media custodian inventory:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// All requests page
async function handleRequestsPage(request: Request, user: any): Promise<Response> {
  try {
    const url = new URL(request.url);
    const viewMode = (url.searchParams.get('view') as 'table' | 'timeline') || 'table';

    const content = await MediaCustodianRequests.renderRequestsPage(user, user.id, viewMode);
    const script = MediaCustodianRequests.getScript();

    return new Response(createHtmlPage('AFT Media Custodian - All Requests', content, script), {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('Error rendering media custodian requests page:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// Individual request detail page
async function handleRequestDetailPage(
  _request: Request,
  user: any,
  requestId: string,
): Promise<Response> {
  try {
    const id = parseInt(requestId, 10);
    if (Number.isNaN(id)) {
      return new Response('Invalid request ID', { status: 400 });
    }

    const content = await MediaCustodianRequests.renderRequestDetail(user, id);
    const script = MediaCustodianRequests.getScript();

    return new Response(createHtmlPage('AFT Media Custodian - Request Details', content, script), {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('Error rendering request detail page:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// Request disposition processing page
async function handleRequestProcessPage(
  _request: Request,
  user: any,
  requestId: string,
): Promise<Response> {
  try {
    const id = parseInt(requestId, 10);
    if (Number.isNaN(id)) {
      return new Response('Invalid request ID', { status: 400 });
    }

    const content = await MediaCustodianRequests.renderRequestProcessPage(user, id);
    const script = MediaCustodianRequests.getScript();

    return new Response(createHtmlPage('AFT Media Custodian - Process Request', content, script), {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('Error rendering request process page:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// Reports page
async function handleReportsPage(_request: Request, user: any): Promise<Response> {
  try {
    const content = await MediaCustodianReports.renderReportsPage(user);
    const script = MediaCustodianReports.getScript();

    return new Response(createHtmlPage('AFT Media Custodian - Reports', content, script), {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('Error rendering media custodian reports:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// API endpoints for media custodian operations
async function handleAPI(
  request: Request,
  user: any,
  endpoint: string,
  session?: SecureSession,
): Promise<Response> {
  try {
    const method = request.method;
    const url = new URL(request.url);

    switch (endpoint) {
      case 'requests':
        if (method === 'GET') {
          const query = Object.fromEntries(url.searchParams.entries());
          const requests = await MediaCustodianAPI.getAllRequests(query);
          return new Response(JSON.stringify(requests), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        break;

      case 'stats':
        if (method === 'GET') {
          const stats = await MediaCustodianAPI.getRequestStats();
          return new Response(JSON.stringify(stats), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        break;

      case 'process':
        if (method === 'POST') {
          const body = (await request.json()) as {
            requestId: number;
            action: string;
            notes?: string;
          };
          const result = await MediaCustodianAPI.processRequest(
            body.requestId,
            body.action,
            user.id,
            body.notes,
            body, // Pass the entire body as disposition data
          );
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        break;

      case 'inventory':
        if (method === 'GET') {
          const inventory = await MediaCustodianAPI.getMediaInventory();
          return new Response(JSON.stringify(inventory), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        break;

      case 'reports':
        if (method === 'POST') {
          const body = (await request.json()) as {
            type: string;
            params?: any;
          };
          const report = await MediaCustodianAPI.generateReport(body.type, body.params);
          return new Response(JSON.stringify(report), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        break;

      case 'drives':
        if (method === 'GET') {
          const drives = await MediaCustodianAPI.getAllMediaDrives();
          return new Response(JSON.stringify(drives), {
            headers: { 'Content-Type': 'application/json' },
          });
        } else if (method === 'POST') {
          const body = (await request.json()) as DbRow;
          const newDrive = await MediaCustodianAPI.createMediaDrive(body);
          return new Response(JSON.stringify({ success: true, drive: newDrive }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        break;

      case 'cac-info':
        if (method === 'GET') {
          try {
            // Check if we have CAC info stored in the session
            let hasCACCert = false;
            let certInfo = null;

            if (session?.cacCertificate) {
              // Use CAC from session
              hasCACCert = true;
              certInfo = session.cacCertificate;
              console.log('Using CAC Certificate from session for media custodian:', {
                subject: certInfo.subject,
                issuer: certInfo.issuer,
                serial: certInfo.serialNumber,
              });
            } else {
              // Check headers as fallback
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

                console.log('CAC Certificate detected via headers for media custodian:', {
                  subject: clientCertSubject,
                  issuer: clientCertIssuer,
                  serial: clientCertSerial,
                });
              } else {
                // No client certificate provided
                hasCACCert = false;
                certInfo = null;
                console.log('No CAC certificate found in session or headers for media custodian');
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
            console.error('Error getting CAC info for media custodian:', error);
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
        break;

      default:
        // Handle drive-specific endpoints like drives/:id, drives/:id/issue, drives/:id/return
        if (endpoint.startsWith('drives/')) {
          const pathParts = endpoint.split('/');
          if (pathParts.length >= 2 && pathParts[1]) {
            const driveId = parseInt(pathParts[1], 10);

            // Handle drives/:id (GET, DELETE, PUT)
            if (pathParts.length === 2) {
              if (method === 'GET') {
                const drive = await MediaCustodianAPI.getMediaDriveById(driveId);
                if (drive) {
                  return new Response(JSON.stringify(drive), {
                    headers: { 'Content-Type': 'application/json' },
                  });
                } else {
                  return new Response(JSON.stringify({ error: 'Drive not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' },
                  });
                }
              } else if (method === 'DELETE') {
                const success = await MediaCustodianAPI.deleteMediaDrive(driveId);
                return new Response(JSON.stringify({ success }), {
                  headers: { 'Content-Type': 'application/json' },
                });
              } else if (method === 'PUT') {
                const body = (await request.json()) as DbRow;
                const success = await MediaCustodianAPI.updateMediaDrive(driveId, body);
                return new Response(JSON.stringify({ success }), {
                  headers: { 'Content-Type': 'application/json' },
                });
              }
            }
            // Handle drives/:id/action (POST)
            else if (pathParts.length >= 3) {
              const action = pathParts[2];

              if (action === 'issue' && method === 'POST') {
                const body = (await request.json()) as {
                  userId?: string;
                  user_id?: string;
                  purpose: string;
                };
                const userId = parseInt((body.userId ?? body.user_id) as string, 10);
                const result = await MediaCustodianAPI.issueDrive(driveId, userId, body.purpose);
                return new Response(JSON.stringify(result), {
                  headers: { 'Content-Type': 'application/json' },
                });
              } else if (action === 'return' && method === 'POST') {
                const result = await MediaCustodianAPI.returnDrive(driveId);
                return new Response(JSON.stringify(result), {
                  headers: { 'Content-Type': 'application/json' },
                });
              }
            }
          }
        }

        return new Response('Not Found', { status: 404 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (error) {
    console.error('Media custodian API error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

export const MediaCustodianRoutes = {
  handleDashboard,
  handleInventory,
  handleRequestsPage,
  handleRequestDetailPage,
  handleRequestProcessPage,
  handleReportsPage,
  handleAPI,
};
