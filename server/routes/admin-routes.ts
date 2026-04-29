// Admin page routes

import { AdminDashboard } from '../../admin/dashboard';
import { AdminReports } from '../../admin/reports';
import { AdminRequests } from '../../admin/requests';
import { AdminSecurity } from '../../admin/security';
import { AdminSystem } from '../../admin/system';
import { AdminUsers } from '../../admin/users';
import { UserRole } from '../../lib/database-bun';
import { RoleMiddleware } from '../../middleware/role-middleware';
import { createHtmlPage } from '../utils';

// Admin Routes Handler
export async function handleAdminRoutes(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response> {
  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.ADMIN);
  if (authResult.response) return authResult.response;

  const user = {
    email: authResult.session.email,
    role: authResult.session.activeRole || authResult.session.primaryRole,
  };

  switch (path) {
    case '/admin': {
      const dashboardHtml = await AdminDashboard.render(user);
      return new Response(
        createHtmlPage('AFT - Admin Dashboard', dashboardHtml, AdminDashboard.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/admin/security':
    case '/admin/security/audit': {
      const auditHtml = await AdminSecurity.renderAuditLog(user);
      return new Response(
        createHtmlPage('AFT - Security Audit', auditHtml, AdminSecurity.getAuditLogScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/admin/security/settings': {
      const settingsHtml = await AdminSecurity.renderSecuritySettings(user);
      return new Response(
        createHtmlPage(
          'AFT - Security Settings',
          settingsHtml,
          AdminSecurity.getSecuritySettingsScript(),
        ),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/admin/users': {
      const usersHtml = await AdminUsers.renderUsersPage(user);
      return new Response(
        createHtmlPage('AFT - User Management', usersHtml, AdminUsers.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/admin/requests': {
      const adminRequestsUrl = new URL(request.url);
      const adminViewMode =
        (adminRequestsUrl.searchParams.get('view') as 'table' | 'timeline') || 'table';
      const requestsHtml = await AdminRequests.renderRequestsPage(user, adminViewMode);
      return new Response(
        createHtmlPage('AFT - Request Management', requestsHtml, AdminRequests.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/admin/system': {
      const systemHtml = await AdminSystem.renderSystemPage(user);
      return new Response(
        createHtmlPage('AFT - System Settings', systemHtml, AdminSystem.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/admin/reports': {
      const reportsHtml = await AdminReports.renderReportsPage(user);
      return new Response(
        createHtmlPage('AFT - Reports & Analytics', reportsHtml, AdminReports.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    default:
      return Response.redirect('/admin', 302);
  }
}
