// Role-based middleware for request authorization

import { UserRole, type UserRoleType } from '../lib/database-bun';
import { type SecureSession, validateSession } from '../lib/security';

// Check if user is authenticated and has selected a role
export async function requireAuth(
  request: Request,
  ipAddress: string,
): Promise<SecureSession | null> {
  const cookies = request.headers.get('cookie');
  if (!cookies) return null;

  const sessionMatch = cookies.match(/session=([^;]+)/);
  if (!sessionMatch?.[1]) return null;

  const userAgent = request.headers.get('user-agent') || 'unknown';

  return await validateSession(sessionMatch[1], ipAddress, userAgent);
}

// Check if user has selected an active role
export async function requireRoleSelection(
  request: Request,
  ipAddress: string,
): Promise<SecureSession | null> {
  const session = await requireAuth(request, ipAddress);

  if (!session) return null;

  // If user hasn't selected a role, they need to go to role selection
  if (!session.roleSelected || !session.activeRole) {
    return null;
  }

  return session;
}

// Check if user has a specific role
export async function requireRole(
  request: Request,
  requiredRole: UserRoleType,
  ipAddress: string,
): Promise<SecureSession | null> {
  const session = await requireRoleSelection(request, ipAddress);

  if (!session) return null;

  // Check if user's active role matches required role
  if (session.activeRole !== requiredRole) {
    return null;
  }

  return session;
}

// Check if user has any of the specified roles
export async function requireAnyRole(
  request: Request,
  requiredRoles: UserRoleType[],
  ipAddress: string,
): Promise<SecureSession | null> {
  const session = await requireRoleSelection(request, ipAddress);

  if (!session) return null;

  // Check if user's active role is in the list of required roles
  if (!requiredRoles.includes(session.activeRole as UserRoleType)) {
    return null;
  }

  return session;
}

// Check if user has admin role
export async function requireAdmin(
  request: Request,
  ipAddress: string,
): Promise<SecureSession | null> {
  return await requireRole(request, UserRole.ADMIN, ipAddress);
}

// Middleware response helpers
// Redirect to login if not authenticated
function redirectToLogin(): Response {
  return Response.redirect('/login', 302);
}

// Redirect to role selection if authenticated but no role selected
function redirectToRoleSelection(): Response {
  return Response.redirect('/select-role', 302);
}

// Return access denied response
function accessDenied(message: string = 'Access denied'): Response {
  return new Response(
    `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Denied</title>
  <link rel="stylesheet" href="/globals.css">
</head>
<body>
  <div class="min-h-screen bg-[var(--muted)] flex items-center justify-center p-4">
      <div class="bg-[var(--card)] rounded-lg p-8 max-w-md w-full text-center border border-[var(--border)] shadow-lg">
          <div class="text-6xl mb-4">🚫</div>
          <h1 class="text-2xl font-bold text-[var(--destructive)] mb-4">Access Denied</h1>
          <p class="text-[var(--muted-foreground)] mb-6">${message}</p>
          <div class="flex gap-4 justify-center">
              <a href="/dashboard" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90 transition-opacity">
                  Go to Dashboard
              </a>
              <a href="/select-role" class="px-4 py-2 bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-md hover:opacity-90 transition-opacity">
                  Change Role
              </a>
          </div>
      </div>
  </div>
</body>
</html>`,
    {
      status: 403,
      headers: { 'Content-Type': 'text/html' },
    },
  );
}

// Get role-specific dashboard URL
function getRoleDashboardUrl(role: UserRoleType): string {
  // DAO is intentionally absent: DAOs sign the AFT form on the
  // unclassified side and never log in. If a user somehow holds the
  // DAO role they fall through to the default below.
  const roleUrls: Partial<Record<UserRoleType, string>> = {
    [UserRole.ADMIN]: '/admin',
    [UserRole.REQUESTOR]: '/requestor',
    [UserRole.APPROVER]: '/approver',
    [UserRole.CPSO]: '/approver', // CPSO uses approver interface
    [UserRole.DTA]: '/dashboard/dta',
    [UserRole.SME]: '/dashboard/sme',
    [UserRole.MEDIA_CUSTODIAN]: '/media-custodian',
  };

  return roleUrls[role] || '/dashboard';
}

// Check authentication only (no specific role required)
async function checkAuth(
  request: Request,
  ipAddress: string,
): Promise<{ session: SecureSession; response?: Response }> {
  return checkAuthAndRole(request, ipAddress);
}

// Verify a CSRF token for any unsafe HTTP method.
// Returns null on success, or a Response describing the failure.
// Safe (idempotent) methods are exempt.
function verifyCsrf(request: Request, session: SecureSession): Response | null {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return null;
  }
  const supplied = request.headers.get('x-csrf-token') || request.headers.get('csrf-token') || '';
  if (!supplied || supplied !== session.csrfToken) {
    return new Response(JSON.stringify({ error: 'Invalid or missing CSRF token' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

// Comprehensive auth check with proper redirects
async function checkAuthAndRole(
  request: Request,
  ipAddress: string,
  requiredRole?: UserRoleType,
): Promise<{ session: SecureSession; response?: Response }> {
  // First check basic authentication
  const session = await requireAuth(request, ipAddress);

  if (!session) {
    return { session: null as unknown as SecureSession, response: redirectToLogin() };
  }

  // Check if role is selected
  if (!session.roleSelected || !session.activeRole) {
    return { session, response: redirectToRoleSelection() };
  }

  // Check specific role requirement
  if (requiredRole && session.activeRole !== requiredRole) {
    const message = `This page requires ${requiredRole.toUpperCase()} role. Your current role is ${session.activeRole?.toUpperCase()}.`;
    return { session, response: accessDenied(message) };
  }

  // All checks passed
  return { session };
}

export const RoleMiddleware = {
  redirectToLogin,
  redirectToRoleSelection,
  accessDenied,
  getRoleDashboardUrl,
  checkAuth,
  verifyCsrf,
  checkAuthAndRole,
};
