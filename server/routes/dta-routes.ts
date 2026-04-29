// DTA page routes

import { DTAActiveTransfers } from '../../dta/active';
import { DTADashboard } from '../../dta/dashboard';
import { DTADataManagement } from '../../dta/data';
import { DTAReports } from '../../dta/reports';
import { DTARequestReviewPage } from '../../dta/request-review';
import { DtaRequests } from '../../dta/requests';
import { DTATransferForm } from '../../dta/transfer-form';
import { UserRole } from '../../lib/database-bun';
import { RoleMiddleware } from '../../middleware/role-middleware';
import { createHtmlPage } from '../utils';

// DTA Routes Handler
export async function handleDTARoutes(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response> {
  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.DTA);
  if (authResult.response) return authResult.response;

  const user = {
    email: authResult.session.email,
    role: authResult.session.activeRole || authResult.session.primaryRole,
  };
  const userId = authResult.session.userId;

  // Parse query parameters for view mode
  const url = new URL(request.url);
  const viewMode = (url.searchParams.get('view') as 'table' | 'timeline') || 'table';

  switch (path) {
    case '/dta': {
      const dashboardHtml = await DTADashboard.render(user, userId);
      return new Response(createHtmlPage('AFT - DTA Dashboard', dashboardHtml), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    case '/dta/requests': {
      const requestsHtml = await DtaRequests.renderRequestsPage(user, viewMode, userId);
      return new Response(
        createHtmlPage('AFT - DTA Requests', requestsHtml, DtaRequests.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/dta/active': {
      const activeTransfersHtml = await DTAActiveTransfers.render(user, userId);
      return new Response(
        createHtmlPage(
          'AFT - Active Transfers',
          activeTransfersHtml,
          DTAActiveTransfers.getScript(),
        ),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/dta/data': {
      const dataManagementHtml = await DTADataManagement.render(user, userId);
      return new Response(
        createHtmlPage('AFT - Data Management', dataManagementHtml, DTADataManagement.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/dta/reports': {
      const reportsHtml = await DTAReports.renderReportsPage(user);
      return new Response(
        createHtmlPage('AFT - DTA Reports', reportsHtml, DTAReports.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/dta/monitor':
      return renderTransferMonitorPage(user);

    // Handle specific request views
    default:
      if (path.startsWith('/dta/request/') && path.split('/').length === 4) {
        const requestId = path.split('/')[3] ?? '';
        const reviewHtml = await DTARequestReviewPage.render(user, requestId, userId);
        return new Response(
          createHtmlPage('AFT - DTA Request Review', reviewHtml, DTARequestReviewPage.getScript()),
          {
            headers: { 'Content-Type': 'text/html' },
          },
        );
      } else if (path.startsWith('/dta/transfer/') && path.split('/').length === 4) {
        const requestId = path.split('/')[3] ?? '';
        const transferFormHtml = await DTATransferForm.render(user, requestId, userId);
        return new Response(
          createHtmlPage('AFT - DTA Transfer Form', transferFormHtml, DTATransferForm.getScript()),
          {
            headers: { 'Content-Type': 'text/html' },
          },
        );
      } else if (path.startsWith('/dta/monitor/') && path.split('/').length === 4) {
        const requestId = parseInt(path.split('/')[3] ?? '', 10);
        return renderTransferMonitorPage(user, requestId);
      } else {
        return new Response(
          createHtmlPage(
            'Page Not Found',
            `
            <div class="min-h-screen bg-[var(--background)] flex items-center justify-center">
              <div class="text-center">
                <h1 class="text-4xl font-bold text-[var(--foreground)] mb-4">404 - Page Not Found</h1>
                <p class="text-[var(--muted-foreground)] mb-6">The requested DTA page could not be found.</p>
                <a href="/dta" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90">
                  Return to DTA Dashboard
                </a>
              </div>
            </div>
          `,
          ),
          {
            status: 404,
            headers: { 'Content-Type': 'text/html' },
          },
        );
      }
  }
}

function _renderDataManagementPage(_user: any): Response {
  const content = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Data Management - AFT DTA Portal</title>
        <link rel="stylesheet" href="/globals.css">
    </head>
    <body class="bg-[var(--background)] text-[var(--foreground)]">
        <div class="min-h-screen flex items-center justify-center">
            <div class="max-w-2xl mx-auto text-center p-8">
                <div class="w-16 h-16 bg-[var(--primary)] rounded-lg flex items-center justify-center mx-auto mb-6">
                    <i class="fas fa-database text-2xl text-[var(--primary-foreground)]"></i>
                </div>
                <h1 class="text-3xl font-bold text-[var(--foreground)] mb-4">Data Management Center</h1>
                <p class="text-[var(--muted-foreground)] mb-8">
                    The Data Management Center provides comprehensive tools for managing transfer data, 
                    storage allocation, cleanup processes, and data lifecycle management.
                </p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
                        <h3 class="text-lg font-semibold text-[var(--foreground)] mb-3">Storage Overview</h3>
                        <div class="space-y-3">
                            <div class="flex justify-between">
                                <span class="text-sm text-[var(--muted-foreground)]">Total Capacity</span>
                                <span class="text-sm font-medium">10 TB</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-sm text-[var(--muted-foreground)]">Used Space</span>
                                <span class="text-sm font-medium">8.2 TB</span>
                            </div>
                            <div class="w-full bg-[var(--muted)] rounded-full h-2">
                                <div class="bg-[var(--warning)] h-2 rounded-full" style="width: 82%"></div>
                            </div>
                        </div>
                    </div>
                    <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
                        <h3 class="text-lg font-semibold text-[var(--foreground)] mb-3">Cleanup Status</h3>
                        <div class="space-y-3">
                            <div class="flex justify-between">
                                <span class="text-sm text-[var(--muted-foreground)]">Last Cleanup</span>
                                <span class="text-sm font-medium">2 hours ago</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-sm text-[var(--muted-foreground)]">Files Cleaned</span>
                                <span class="text-sm font-medium">247</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-sm text-[var(--muted-foreground)]">Space Freed</span>
                                <span class="text-sm font-medium">1.2 GB</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex gap-4 justify-center">
                    <a href="/dta" class="px-6 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90">
                        Back to Dashboard
                    </a>
                    <button onclick="alert('Data management interface coming soon!')" class="px-6 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-md hover:bg-[var(--muted)]">
                        Manage Data
                    </button>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;

  return new Response(content, {
    headers: { 'Content-Type': 'text/html' },
  });
}

function _renderReportsPage(_user: any): Response {
  const content = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reports - AFT DTA Portal</title>
        <link rel="stylesheet" href="/globals.css">
    </head>
    <body class="bg-[var(--background)] text-[var(--foreground)]">
        <div class="min-h-screen flex items-center justify-center">
            <div class="max-w-4xl mx-auto text-center p-8">
                <div class="w-16 h-16 bg-[var(--primary)] rounded-lg flex items-center justify-center mx-auto mb-6">
                    <i class="fas fa-chart-bar text-2xl text-[var(--primary-foreground)]"></i>
                </div>
                <h1 class="text-3xl font-bold text-[var(--foreground)] mb-4">Reports & Analytics</h1>
                <p class="text-[var(--muted-foreground)] mb-8">
                    Generate comprehensive reports on transfer performance, compliance, and system utilization.
                </p>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)] text-left">
                        <h3 class="text-lg font-semibold text-[var(--foreground)] mb-3">Performance Reports</h3>
                        <ul class="space-y-2 text-sm text-[var(--muted-foreground)]">
                            <li>• Transfer speed analysis</li>
                            <li>• Success rate metrics</li>
                            <li>• Processing time trends</li>
                            <li>• Bottleneck identification</li>
                        </ul>
                        <button onclick="alert('Performance reports coming soon!')" class="mt-4 w-full px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90 text-sm">
                            Generate Report
                        </button>
                    </div>
                    <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)] text-left">
                        <h3 class="text-lg font-semibold text-[var(--foreground)] mb-3">Compliance Reports</h3>
                        <ul class="space-y-2 text-sm text-[var(--muted-foreground)]">
                            <li>• Classification handling</li>
                            <li>• Security audit trails</li>
                            <li>• Policy compliance</li>
                            <li>• Access control logs</li>
                        </ul>
                        <button onclick="alert('Compliance reports coming soon!')" class="mt-4 w-full px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90 text-sm">
                            Generate Report
                        </button>
                    </div>
                    <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)] text-left">
                        <h3 class="text-lg font-semibold text-[var(--foreground)] mb-3">Utilization Reports</h3>
                        <ul class="space-y-2 text-sm text-[var(--muted-foreground)]">
                            <li>• Storage utilization</li>
                            <li>• System resource usage</li>
                            <li>• User activity patterns</li>
                            <li>• Capacity planning</li>
                        </ul>
                        <button onclick="alert('Utilization reports coming soon!')" class="mt-4 w-full px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90 text-sm">
                            Generate Report
                        </button>
                    </div>
                </div>
                <div class="flex gap-4 justify-center">
                    <a href="/dta" class="px-6 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90">
                        Back to Dashboard
                    </a>
                    <button onclick="alert('Report scheduler coming soon!')" class="px-6 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-md hover:bg-[var(--muted)]">
                        Schedule Reports
                    </button>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;

  return new Response(content, {
    headers: { 'Content-Type': 'text/html' },
  });
}

function renderTransferMonitorPage(_user: any, requestId?: number): Response {
  const title = requestId ? `Transfer Monitor - Request ${requestId}` : 'Transfer Monitor';
  const content = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - AFT DTA Portal</title>
        <link rel="stylesheet" href="/globals.css">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body class="bg-[var(--background)] text-[var(--foreground)]">
        <div class="min-h-screen flex items-center justify-center">
            <div class="max-w-6xl mx-auto p-8">
                <div class="text-center mb-8">
                    <div class="w-16 h-16 bg-[var(--primary)] rounded-lg flex items-center justify-center mx-auto mb-6">
                        <i class="fas fa-tachometer-alt text-2xl text-[var(--primary-foreground)]"></i>
                    </div>
                    <h1 class="text-3xl font-bold text-[var(--foreground)] mb-4">${title}</h1>
                    <p class="text-[var(--muted-foreground)]">
                        ${
                          requestId
                            ? `Real-time monitoring for transfer request ${requestId}`
                            : 'Real-time monitoring dashboard for all active transfers'
                        }
                    </p>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
                        <div class="text-2xl font-bold text-[var(--info)]">3</div>
                        <div class="text-sm text-[var(--muted-foreground)]">Active Transfers</div>
                    </div>
                    <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
                        <div class="text-2xl font-bold text-[var(--success)]">45.2 MB/s</div>
                        <div class="text-sm text-[var(--muted-foreground)]">Average Speed</div>
                    </div>
                    <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
                        <div class="text-2xl font-bold text-[var(--warning)]">2.1 TB</div>
                        <div class="text-sm text-[var(--muted-foreground)]">Data Queued</div>
                    </div>
                    <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
                        <div class="text-2xl font-bold text-[var(--primary)]">98.5%</div>
                        <div class="text-sm text-[var(--muted-foreground)]">Success Rate</div>
                    </div>
                </div>
                
                ${
                  requestId
                    ? `
                <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)] mb-8">
                    <h3 class="text-lg font-semibold text-[var(--foreground)] mb-4">Request ${requestId} Details</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <div class="text-sm text-[var(--muted-foreground)]">Progress</div>
                            <div class="text-2xl font-bold text-[var(--primary)] mb-2">67%</div>
                            <div class="w-full bg-[var(--muted)] rounded-full h-2">
                                <div class="bg-[var(--primary)] h-2 rounded-full" style="width: 67%"></div>
                            </div>
                        </div>
                        <div>
                            <div class="text-sm text-[var(--muted-foreground)]">Transfer Speed</div>
                            <div class="text-2xl font-bold text-[var(--info)]">52.1 MB/s</div>
                            <div class="text-sm text-[var(--muted-foreground)]">ETA: 14 minutes</div>
                        </div>
                        <div>
                            <div class="text-sm text-[var(--muted-foreground)]">Data Size</div>
                            <div class="text-2xl font-bold text-[var(--foreground)]">1.2 GB</div>
                            <div class="text-sm text-[var(--muted-foreground)]">Transferred: 804 MB</div>
                        </div>
                    </div>
                </div>
                `
                    : ''
                }
                
                <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)] mb-8">
                    <h3 class="text-lg font-semibold text-[var(--foreground)] mb-4">Transfer Performance</h3>
                    <div style="height: 300px; display: flex; align-items: center; justify-content: center; color: var(--muted-foreground);">
                        <div>
                            <i class="fas fa-chart-line text-4xl mb-4"></i>
                            <div>Real-time performance charts would be displayed here</div>
                        </div>
                    </div>
                </div>
                
                <div class="flex gap-4 justify-center">
                    <a href="/dta/requests" class="px-6 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90">
                        Back to Requests
                    </a>
                    <button onclick="alert('Real-time monitoring features coming soon!')" class="px-6 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-md hover:bg-[var(--muted)]">
                        Configure Alerts
                    </button>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;

  return new Response(content, {
    headers: { 'Content-Type': 'text/html' },
  });
}

function _renderRequestDetailsPage(_user: any, requestId: number): Response {
  const content = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Request ${requestId} - AFT DTA Portal</title>
        <link rel="stylesheet" href="/globals.css">
    </head>
    <body class="bg-[var(--background)] text-[var(--foreground)]">
        <div class="min-h-screen flex items-center justify-center">
            <div class="max-w-4xl mx-auto p-8">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold text-[var(--foreground)] mb-4">Request ${requestId} Details</h1>
                    <p class="text-[var(--muted-foreground)]">
                        Detailed view of AFT request ${requestId} with full timeline and transfer information
                    </p>
                </div>
                
                <div class="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)]">
                    <div class="text-center">
                        <div class="w-16 h-16 bg-[var(--info)] rounded-lg flex items-center justify-center mx-auto mb-6">
                            <i class="fas fa-file-alt text-2xl text-white"></i>
                        </div>
                        <h3 class="text-xl font-semibold text-[var(--foreground)] mb-4">Request Details View</h3>
                        <p class="text-[var(--muted-foreground)] mb-8">
                            This page would display comprehensive details about request ${requestId}, including:
                            <br><br>
                            • Request metadata and classification<br>
                            • Complete timeline with all status changes<br>
                            • File transfer details and progress<br>
                            • Security audit information<br>
                            • DTA actions and decisions
                        </p>
                        <div class="flex gap-4 justify-center">
                            <a href="/dta/requests" class="px-6 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90">
                                Back to Requests
                            </a>
                            <button onclick="alert('Request details interface coming soon!')" class="px-6 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-md hover:bg-[var(--muted)]">
                                View Timeline
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;

  return new Response(content, {
    headers: { 'Content-Type': 'text/html' },
  });
}
