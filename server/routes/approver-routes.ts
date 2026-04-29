// Approver Routes Handler

import { ApproverAllRequests } from '../../approver/all-requests';
import { ApprovedRequestsPage } from '../../approver/approved';
import { ApproverDashboard } from '../../approver/dashboard';
import { PendingApprovalsPage } from '../../approver/pending';
import { ApproverReportsPage } from '../../approver/reports';
import { RequestReviewPage } from '../../approver/request-review';
import { UserRole } from '../../lib/database-bun';
import { RoleMiddleware } from '../../middleware/role-middleware';
import { createHtmlPage } from '../utils';

export async function handleApproverRoutes(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response> {
  console.log('Approver route handler called for path:', path);
  // Allow both APPROVER and CPSO roles to access these routes
  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress);
  if (authResult.response) return authResult.response;

  // Check if user has either APPROVER or CPSO role
  const userRole = authResult.session.activeRole || authResult.session.primaryRole;
  if (userRole !== UserRole.APPROVER && userRole !== UserRole.CPSO) {
    return RoleMiddleware.accessDenied(
      `This page requires APPROVER or CPSO role. Your current role is ${userRole?.toUpperCase()}.`,
    );
  }

  const user = {
    email: authResult.session.email,
    role: authResult.session.activeRole || authResult.session.primaryRole,
  };

  try {
    let htmlContent = '';
    let scriptContent = '';
    let title = 'AFT - Approver Portal';

    // Route handling
    if (path === '/approver' || path === '/approver/') {
      htmlContent = await ApproverDashboard.render(user, authResult.session.userId);
      scriptContent = ApproverDashboard.getScript();
      title = 'AFT - Approver Dashboard';
    } else if (path === '/approver/pending') {
      htmlContent = await PendingApprovalsPage.render(user, authResult.session.userId);
      scriptContent = PendingApprovalsPage.getScript();
      title = 'AFT - Pending Approvals';
    } else if (path === '/approver/approved') {
      htmlContent = await ApprovedRequestsPage.render(user, authResult.session.userId);
      scriptContent = ApprovedRequestsPage.getScript();
      title = 'AFT - Approved Requests';
    } else if (path === '/approver/reports') {
      htmlContent = await ApproverReportsPage.render(user);
      scriptContent = ApproverReportsPage.getScript();
      title = 'AFT - Approver Reports';
    } else if (path === '/approver/all-requests') {
      const url = new URL(request.url);
      const viewMode = (url.searchParams.get('view') as 'table' | 'timeline') || 'table';
      htmlContent = await ApproverAllRequests.render(user, viewMode);
      scriptContent = ApproverAllRequests.getScript();
      title = 'AFT - All Requests';
    } else if (path.startsWith('/approver/request/') || path.startsWith('/approver/review/')) {
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
    console.error('Approver route error for path:', path);
    console.error('Error details:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
