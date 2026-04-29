// Authentication page routes
import { type DbRow, getDb, type UserRoleType } from '../../lib/database-bun';
import { buildClearAuthCookies, destroySession } from '../../lib/security';
import { LoginPage } from '../../login/login-page';
import { RoleMiddleware } from '../../middleware/role-middleware';
import { RoleSelectionPage } from '../../role-selection/role-selection-page';
import { checkAuth } from '../utils';

const db = getDb();

// Login Page Handler
export async function handleLoginPage(request: Request, ipAddress: string): Promise<Response> {
  const auth = await checkAuth(request, ipAddress);
  if (auth) {
    if (auth.roleSelected) {
      return Response.redirect(
        RoleMiddleware.getRoleDashboardUrl(auth.activeRole as UserRoleType),
        302,
      );
    } else {
      return Response.redirect('/select-role', 302);
    }
  }

  return new Response(LoginPage.render(), {
    headers: { 'Content-Type': 'text/html' },
  });
}

// Role Selection Page Handler
export async function handleRoleSelectionPage(
  request: Request,
  ipAddress: string,
): Promise<Response> {
  const auth = await checkAuth(request, ipAddress);
  if (!auth) {
    return Response.redirect('/login', 302);
  }

  if (auth.roleSelected) {
    return Response.redirect(
      RoleMiddleware.getRoleDashboardUrl(auth.activeRole as UserRoleType),
      302,
    );
  }

  // Get user details
  const user = (await db
    .query('SELECT first_name, last_name FROM users WHERE id = ?')
    .get(auth.userId)) as DbRow;
  const userName = user ? `${user.first_name} ${user.last_name}` : auth.email;

  // Map available roles to UserRole objects
  const availableRoles = auth.availableRoles.map((role) => ({
    role: role as UserRoleType,
    isPrimary: role === auth.primaryRole,
  }));

  return new Response(RoleSelectionPage.render(auth.email, userName, availableRoles), {
    headers: { 'Content-Type': 'text/html' },
  });
}

// Dashboard Routes Handler
export async function handleDashboardRoutes(
  request: Request,
  ipAddress: string,
): Promise<Response> {
  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress);
  if (authResult.response) return authResult.response;

  // Redirect to role-specific dashboard
  const activeRole = authResult.session.activeRole || authResult.session.primaryRole;
  return Response.redirect(RoleMiddleware.getRoleDashboardUrl(activeRole as UserRoleType), 302);
}

// Logout Handler
export async function handleLogout(request: Request): Promise<Response> {
  const cookies = request.headers.get('cookie');
  if (cookies) {
    const sessionMatch = cookies.match(/session=([^;]+)/);
    if (sessionMatch?.[1]) {
      await destroySession(sessionMatch[1], 'USER_LOGOUT');
    }
  }

  const headers = new Headers({ Location: '/login' });
  for (const c of buildClearAuthCookies()) headers.append('Set-Cookie', c);
  return new Response('', { status: 302, headers });
}
