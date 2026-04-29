// CPSO Routes Handler

import { CPSOAllRequests } from '../../cpso/all-requests';
import { CPSOApprovedRequestsPage } from '../../cpso/approved';
import { CPSODashboard } from '../../cpso/dashboard';
import { PendingCPSOReviewsPage } from '../../cpso/pending';
import { CPSOReportsPage } from '../../cpso/reports';
import { RequestReviewPage } from '../../cpso/request-review';
import { type DbRow, getDb, UserRole } from '../../lib/database-bun';
import { RoleMiddleware } from '../../middleware/role-middleware';
import { createHtmlPage } from '../utils';

export async function handleCPSORoutes(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response> {
  console.log('CPSO route handler called for path:', path);

  // Check authentication and CPSO role
  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress);
  if (authResult.response) return authResult.response;

  // Check if user has CPSO role
  const userRole = authResult.session.activeRole || authResult.session.primaryRole;
  if (userRole !== UserRole.CPSO) {
    return RoleMiddleware.accessDenied(
      `This page requires CPSO role. Your current role is ${userRole?.toUpperCase()}.`,
    );
  }

  // Get user details from database
  const db = getDb();
  const userDetails = (await db
    .query('SELECT first_name, last_name FROM users WHERE id = ?')
    .get(authResult.session.userId)) as DbRow;

  const user = {
    id: authResult.session.userId,
    email: authResult.session.email,
    firstName: userDetails?.first_name || 'Unknown',
    lastName: userDetails?.last_name || 'User',
    role: authResult.session.activeRole || authResult.session.primaryRole,
  };

  try {
    let htmlContent = '';
    let scriptContent = '';
    let title = 'AFT - CPSO Portal';

    // Route handling
    if (path === '/cpso' || path === '/cpso/') {
      htmlContent = await CPSODashboard.render(user, authResult.session.userId);
      scriptContent = CPSODashboard.getScript();
      title = 'AFT - CPSO Dashboard';
    } else if (path === '/cpso/pending') {
      htmlContent = await PendingCPSOReviewsPage.render(user, authResult.session.userId);
      scriptContent = PendingCPSOReviewsPage.getScript();
      title = 'AFT - Pending CPSO Reviews';
    } else if (path === '/cpso/approved') {
      htmlContent = await CPSOApprovedRequestsPage.render(user, authResult.session.userId);
      scriptContent = CPSOApprovedRequestsPage.getScript();
      title = 'AFT - Approved Requests';
    } else if (path === '/cpso/all-requests') {
      const url = new URL(request.url);
      const viewMode = (url.searchParams.get('view') as 'table' | 'timeline') || 'table';
      htmlContent = await CPSOAllRequests.render(user, viewMode);
      scriptContent = CPSOAllRequests.getScript();
      title = 'AFT - All Requests';
    } else if (path === '/cpso/reports') {
      htmlContent = await CPSOReportsPage.render(user);
      scriptContent = CPSOReportsPage.getScript();
      title = 'AFT - CPSO Reports';
    } else if (path.startsWith('/cpso/request/') || path.startsWith('/cpso/review/')) {
      const requestId = path.split('/')[3];
      if (requestId) {
        htmlContent = await RequestReviewPage.render(user, requestId);
        scriptContent = RequestReviewPage.getScript();
        title = `AFT - Review Request #${requestId}`;
      } else {
        return new Response('Request ID missing', { status: 400 });
      }
    } else {
      return new Response('Page not found', { status: 404 });
    }

    return new Response(createHtmlPage(title, htmlContent, scriptContent), {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('CPSO route error for path:', path);
    console.error('Error details:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
