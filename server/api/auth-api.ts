// Authentication API routes
import { getDb, getUserRoles, setUserPassword, verifyPassword } from '../../lib/database-bun';
import {
  auditLog,
  buildCsrfCookie,
  buildSessionCookie,
  checkRateLimit,
  createSecureSession,
  recordFailedAttempt,
  resetRateLimit,
  selectSessionRole,
  switchSessionRole,
  validatePasswordPolicy,
} from '../../lib/security';
import { RoleMiddleware } from '../../middleware/role-middleware';
import { checkAuth } from '../utils';

const db = getDb();

const GENERIC_LOGIN_ERROR = 'Invalid email or password';

export async function handleAuthAPI(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response | null> {
  const method = request.method;

  // Email validation API - intentionally requires authentication so it cannot
  // be used to enumerate accounts.
  if (path === '/api/check-email' && method === 'POST') {
    const auth = await checkAuth(request, ipAddress);
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const csrfFail = RoleMiddleware.verifyCsrf(request, auth);
    if (csrfFail) return csrfFail;

    try {
      const body = (await request.json()) as { email: string };
      const email = body.email;

      if (!email) {
        return new Response(JSON.stringify({ error: 'Email is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const user = await db
        .query('SELECT id FROM users WHERE email = ? AND is_active = TRUE')
        .get(email);

      return new Response(JSON.stringify({ exists: !!user }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (_error) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Login API
  if (path === '/api/login' && method === 'POST') {
    const body = (await request.json()) as { email: string; password: string };
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Extract CAC certificate info forwarded by the trusted reverse proxy.
    // index.ts strips these headers when the request did not come from a
    // trusted proxy or when nginx did not successfully verify the cert, so
    // their presence here is meaningful.
    const cacCertificate = {
      subject: request.headers.get('X-Client-Cert-Subject') || '',
      issuer: request.headers.get('X-Client-Cert-Issuer') || '',
      serialNumber: request.headers.get('X-Client-Cert-Serial') || '',
      thumbprint: request.headers.get('X-Client-Cert-Fingerprint') || '',
      validFrom: request.headers.get('X-Client-Cert-Not-Before') || '',
      validTo: request.headers.get('X-Client-Cert-Not-After') || '',
      pemData: request.headers.get('X-Client-Cert-PEM') || '',
    };
    const hasCAC = cacCertificate.subject && cacCertificate.issuer;

    // Check rate limiting
    const rateCheck = checkRateLimit(`${ipAddress}:${body.email}`);
    if (!rateCheck.allowed) {
      await auditLog(
        null,
        'LOGIN_RATE_LIMITED',
        `Rate limit exceeded for ${body.email}`,
        ipAddress,
      );

      const lockoutMinutes = Math.ceil((rateCheck.lockedUntil! - Date.now()) / 1000 / 60);
      return new Response(
        JSON.stringify({
          success: false,
          message: `Too many failed attempts. Try again in ${lockoutMinutes} minutes.`,
          lockedUntil: rateCheck.lockedUntil,
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const user = (await db
      .query('SELECT * FROM users WHERE email = ? AND is_active = TRUE')
      .get(body.email)) as any;

    if (!user) {
      recordFailedAttempt(`${ipAddress}:${body.email}`);
      await auditLog(
        null,
        'LOGIN_FAILED_NO_USER',
        `Failed login attempt for non-existent user ${body.email}`,
        ipAddress,
      );

      return new Response(
        JSON.stringify({
          success: false,
          message: GENERIC_LOGIN_ERROR,
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (await verifyPassword(body.password, user.password)) {
      // Success - reset rate limit and get user roles
      resetRateLimit(`${ipAddress}:${body.email}`);

      const userRoles = await getUserRoles(user.id);
      const availableRoles = userRoles.map((r) => r.role);

      const session = await createSecureSession(
        user.id,
        user.email,
        user.primary_role,
        availableRoles,
        ipAddress,
        userAgent,
        hasCAC ? cacCertificate : undefined,
      );

      await auditLog(user.id, 'LOGIN_SUCCESS', `Successful login for ${user.email}`, ipAddress);

      // Set both the session cookie (HttpOnly) and a CSRF cookie that is
      // readable by client JavaScript so it can echo the value back in the
      // X-CSRF-Token header. The actual session secret stays HttpOnly.
      const headers = new Headers({ 'Content-Type': 'application/json' });
      headers.append('Set-Cookie', buildSessionCookie(session.sessionId));
      headers.append('Set-Cookie', buildCsrfCookie(session.csrfToken));

      return new Response(
        JSON.stringify({
          success: true,
          needsRoleSelection: availableRoles.length > 1,
          csrfToken: session.csrfToken,
          passwordChangeRequired: !!user.must_change_password,
        }),
        { headers },
      );
    }

    // Failed login - incorrect password (same generic message as missing user)
    recordFailedAttempt(`${ipAddress}:${body.email}`);
    await auditLog(
      user.id,
      'LOGIN_FAILED_BAD_PASS',
      `Failed login attempt for ${body.email} (incorrect password)`,
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: false,
        message: GENERIC_LOGIN_ERROR,
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // Role selection API
  if (path === '/api/select-role' && method === 'POST') {
    const auth = await checkAuth(request, ipAddress);
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const csrfFail = RoleMiddleware.verifyCsrf(request, auth);
    if (csrfFail) return csrfFail;

    const body = (await request.json()) as { role: string };

    const success = await selectSessionRole(auth.sessionId, body.role, ipAddress);

    if (success) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid role selection',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  // Change own password
  if (path === '/api/change-password' && method === 'POST') {
    const auth = await checkAuth(request, ipAddress);
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const csrfFail = RoleMiddleware.verifyCsrf(request, auth);
    if (csrfFail) return csrfFail;

    const body = (await request.json()) as { currentPassword?: string; newPassword?: string };
    const currentPassword = body.currentPassword || '';
    const newPassword = body.newPassword || '';

    const user = (await db
      .query('SELECT id, password FROM users WHERE id = ? AND is_active = TRUE')
      .get(auth.userId)) as any;
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!(await verifyPassword(currentPassword, user.password))) {
      await auditLog(
        auth.userId,
        'PASSWORD_CHANGE_FAILED',
        'Current password incorrect',
        ipAddress,
      );
      return new Response(
        JSON.stringify({ success: false, message: 'Current password is incorrect' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const policy = validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Password does not meet policy',
          errors: policy.errors,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (newPassword === currentPassword) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'New password must differ from current password',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    await setUserPassword(auth.userId, newPassword);
    await auditLog(auth.userId, 'PASSWORD_CHANGED', 'User changed their password', ipAddress);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Role switch API
  if (path === '/api/switch-role' && method === 'POST') {
    const auth = await checkAuth(request, ipAddress);
    if (!auth?.roleSelected) {
      return new Response(JSON.stringify({ error: 'Not authenticated or no role selected' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const csrfFail = RoleMiddleware.verifyCsrf(request, auth);
    if (csrfFail) return csrfFail;

    const body = (await request.json()) as { role: string };

    const success = await switchSessionRole(auth.sessionId, body.role, ipAddress);

    if (success) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid role switch',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  return null;
}
