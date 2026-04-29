// SME page routes
import { UserRole } from '../../lib/database-bun';
import { RoleMiddleware } from '../../middleware/role-middleware';
import { SMEAllRequests } from '../../sme/all-requests';
import { SMEDashboard } from '../../sme/dashboard';
import { SMERequestSignPage } from '../../sme/request-sign';
import { createHtmlPage } from '../utils';

// SME Routes Handler
export async function handleSMERoutes(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response> {
  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.SME);
  if (authResult.response) return authResult.response;

  const user = {
    email: authResult.session.email,
    role: authResult.session.activeRole || authResult.session.primaryRole,
  };
  const userId = authResult.session.userId;

  switch (path) {
    case '/sme':
    case '/sme/dashboard':
    case '/dashboard/sme': {
      const dashboardHtml = await SMEDashboard.render(user, userId);
      return new Response(
        createHtmlPage('AFT - SME Dashboard', dashboardHtml, SMEDashboard.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/sme/requests': {
      const url = new URL(request.url);
      const viewMode = (url.searchParams.get('view') as 'table' | 'timeline') || 'table';
      const requestsHtml = await SMEAllRequests.render(user, viewMode);
      return new Response(
        createHtmlPage('AFT - SME Requests', requestsHtml, SMEAllRequests.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/sme/signatures': {
      // Show pending signature requests
      const signatureQueueHtml = await SMEDashboard.renderSignatureQueue(user, userId);
      return new Response(
        createHtmlPage('AFT - Signature Queue', signatureQueueHtml, SMEDashboard.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    default:
      // Handle dynamic routes like /sme/sign/{id}
      if (path.startsWith('/sme/sign/')) {
        const requestId = path.split('/')[3];
        if (requestId) {
          const signHtml = await SMERequestSignPage.render(user, requestId);
          return new Response(
            createHtmlPage('AFT - Sign Request', signHtml, SMERequestSignPage.getScript()),
            {
              headers: { 'Content-Type': 'text/html' },
            },
          );
        }
      }

      // 404 fallback
      return new Response(
        createHtmlPage(
          'Page Not Found',
          `
          <div class="min-h-screen bg-[var(--background)] flex items-center justify-center">
            <div class="text-center">
              <h1 class="text-4xl font-bold text-[var(--foreground)] mb-4">404 - Page Not Found</h1>
              <p class="text-[var(--muted-foreground)] mb-6">The requested SME page could not be found.</p>
              <a href="/sme" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90">
                Return to SME Dashboard
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
