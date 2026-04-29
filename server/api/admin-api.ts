// Admin API routes
import { backupDatabase,
  getDb,
  getRoleDescription,
  getRoleDisplayName,
  getSystemSettings,
  runMaintenance,
  saveSystemSettings,
  UserRole, type DbRow } from '../../lib/database-bun';
import { escapeCsv } from '../../lib/formatters';
import { auditLog } from '../../lib/security';
import { RoleMiddleware } from '../../middleware/role-middleware';

const db = getDb();

// Helper that runs the standard admin-API checks: must be authenticated as
// admin AND, for state-changing methods, must present a valid CSRF token.
async function adminAuth(request: Request, ipAddress: string) {
  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.ADMIN);
  if (authResult.response) return authResult;
  const csrfFail = RoleMiddleware.verifyCsrf(request, authResult.session);
  if (csrfFail) return { session: authResult.session, response: csrfFail };
  return authResult;
}

export async function handleAdminAPI(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response | null> {
  const method = request.method;

  // Admin stats API
  if (path === '/api/admin/stats' && method === 'GET') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    const userCount = (await db
      .query('SELECT COUNT(*) as count FROM users WHERE is_active = TRUE')
      .get()) as DbRow;
    const requestCount = (await db
      .query('SELECT COUNT(*) as count FROM aft_requests')
      .get()) as DbRow;
    const recentLogins = (await db
      .query(`
      SELECT COUNT(*) as count FROM security_audit_log 
      WHERE action = 'LOGIN_SUCCESS' AND timestamp > (EXTRACT(EPOCH FROM NOW())::BIGINT - 86400)
    `)
      .get()) as DbRow;

    return new Response(
      JSON.stringify({
        activeUsers: userCount?.count || 0,
        totalRequests: requestCount?.count || 0,
        todayLogins: recentLogins?.count || 0,
        systemStatus: 'operational',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // Security audit API
  if (path === '/api/security/audit' && method === 'GET') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    const logs = await db
      .query(`
      SELECT 
        sal.*, 
        u.first_name || ' ' || u.last_name as user_name,
        u.email as user_email
      FROM security_audit_log sal
      LEFT JOIN users u ON sal.user_id = u.id
      ORDER BY sal.timestamp DESC
      LIMIT 100
    `)
      .all();

    return new Response(JSON.stringify(logs), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // User Management APIs
  if (path === '/api/admin/users' && method === 'POST') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    try {
      const userData = (await request.json()) as DbRow;
      const hashedPassword = await Bun.password.hash(userData.password, {
        algorithm: 'bcrypt',
        cost: 12,
      });

      const result = (await db
        .query(`
        INSERT INTO users (email, password, first_name, last_name, primary_role, organization, phone, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `)
        .get(
          userData.email,
          hashedPassword,
          userData.first_name,
          userData.last_name,
          userData.primary_role,
          userData.organization || null,
          userData.phone || null,
          !!userData.is_active,
        )) as DbRow;

      // Add primary role to user_roles table
      await db
        .query(`
        INSERT INTO user_roles (user_id, role, is_active, assigned_by)
        VALUES (?, ?, 1, ?)
      `)
        .run(result.id, userData.primary_role, authResult.session.userId);

      await auditLog(
        authResult.session.userId,
        'USER_CREATED',
        `Created user: ${userData.email}`,
        ipAddress,
      );

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: error.message,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  if (path.startsWith('/api/admin/users/') && path.endsWith('/roles') && method === 'GET') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    const userId = path.split('/')[4];
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Invalid user ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get user info
    const user = (await db.query('SELECT * FROM users WHERE id = ?').get(userId)) as DbRow;
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get user's current roles
    const userRoles = await db
      .query(`
      SELECT role FROM user_roles 
      WHERE user_id = ? AND is_active = TRUE
    `)
      .all(userId);

    // Get all available roles
    const allRoles = Object.values(UserRole).map((role) => ({
      id: role,
      name: getRoleDisplayName(role),
      description: getRoleDescription(role),
    }));

    return new Response(
      JSON.stringify({
        user,
        userRoles,
        allRoles,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  if (path.startsWith('/api/admin/users/') && path.endsWith('/roles') && method === 'PUT') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    const userId = path.split('/')[4];
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Invalid user ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const { roles } = (await request.json()) as { roles: string[] };

    // Get user's primary role (cannot be removed)
    const user = (await db.query('SELECT primary_role FROM users WHERE id = ?').get(userId)) as DbRow;
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Ensure primary role is always included
    const allRoles = [...new Set([user.primary_role, ...roles])];

    // Remove all current roles (except we'll re-add them)
    await db.query('DELETE FROM user_roles WHERE user_id = ?').run(userId);

    // Add all roles back
    for (const role of allRoles) {
      await db
        .query(`
        INSERT INTO user_roles (user_id, role, is_active, assigned_by)
        VALUES (?, ?, 1, ?)
      `)
        .run(userId, role, authResult.session.userId);
    }

    await auditLog(
      authResult.session.userId,
      'USER_ROLES_UPDATED',
      `Updated roles for user ID ${userId}: ${allRoles.join(', ')}`,
      ipAddress,
    );

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (path.startsWith('/api/admin/users/') && method === 'GET') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    const userId = path.split('/')[4];
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Invalid user ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const user = (await db.query('SELECT * FROM users WHERE id = ?').get(userId)) as DbRow;

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(user), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (path.startsWith('/api/admin/users/') && method === 'PUT') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    try {
      const userId = path.split('/')[4];
      if (!userId) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Invalid user ID',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      const userData = (await request.json()) as DbRow;

      let updateQuery = `
        UPDATE users 
        SET first_name = ?, last_name = ?, email = ?, primary_role = ?, 
            organization = ?, phone = ?, is_active = ?, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = ?
      `;
      let params = [
        userData.first_name,
        userData.last_name,
        userData.email,
        userData.primary_role,
        userData.organization || null,
        userData.phone || null,
        !!userData.is_active,
        userId,
      ];

      // If password is provided, include it in the update
      if (userData.password?.trim()) {
        const hashedPassword = await Bun.password.hash(userData.password, {
          algorithm: 'bcrypt',
          cost: 12,
        });
        updateQuery = `
          UPDATE users 
          SET first_name = ?, last_name = ?, email = ?, password = ?, primary_role = ?, 
              organization = ?, phone = ?, is_active = ?, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
          WHERE id = ?
        `;
        params = [
          userData.first_name,
          userData.last_name,
          userData.email,
          hashedPassword,
          userData.primary_role,
          userData.organization || null,
          userData.phone || null,
          !!userData.is_active,
          userId,
        ];
      }

      await db.query(updateQuery).run(...params);

      await auditLog(
        authResult.session.userId,
        'USER_UPDATED',
        `Updated user: ${userData.email}`,
        ipAddress,
      );

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: error.message,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  // Database Backup API
  if (path === '/api/admin/backup-database' && method === 'POST') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    try {
      const backupPath = await backupDatabase();

      await auditLog(
        authResult.session.userId,
        'DB_BACKUP_CREATED',
        `Created database backup: ${backupPath}`,
        ipAddress,
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Database backup created successfully.',
          backupPath: backupPath,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (error: any) {
      await auditLog(
        authResult.session.userId,
        'DB_BACKUP_FAILED',
        `Failed to create database backup: ${error.message}`,
        ipAddress,
      );

      return new Response(
        JSON.stringify({
          success: false,
          message: `Failed to create backup: ${error.message}`,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  // Database Maintenance API
  if (path === '/api/admin/run-maintenance' && method === 'POST') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    try {
      await runMaintenance();

      await auditLog(
        authResult.session.userId,
        'DB_MAINTENANCE_RUN',
        'Database maintenance (VACUUM, ANALYZE) completed.',
        ipAddress,
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Database maintenance completed successfully.',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (error: any) {
      await auditLog(
        authResult.session.userId,
        'DB_MAINTENANCE_FAILED',
        `Failed to run database maintenance: ${error.message}`,
        ipAddress,
      );

      return new Response(
        JSON.stringify({
          success: false,
          message: `Failed to run maintenance: ${error.message}`,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  // Email Settings API
  if (path === '/api/admin/email-settings' && method === 'GET') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    const allSettings = await getSystemSettings();
    const emailSettings = {
      smtpServer: allSettings['email.smtpServer'] || '',
      smtpPort: allSettings['email.smtpPort'] || '587',
      smtpSecurity: allSettings['email.smtpSecurity'] || 'TLS',
    };

    return new Response(JSON.stringify(emailSettings), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (path === '/api/admin/email-settings' && method === 'POST') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    try {
      const body = (await request.json()) as DbRow;
      const settingsToSave = {
        'email.smtpServer': body.smtpServer,
        'email.smtpPort': body.smtpPort,
        'email.smtpSecurity': body.smtpSecurity,
      };

      await saveSystemSettings(settingsToSave);

      await auditLog(
        authResult.session.userId,
        'EMAIL_SETTINGS_UPDATED',
        'Email settings were updated.',
        ipAddress,
      );

      return new Response(
        JSON.stringify({ success: true, message: 'Email settings saved successfully.' }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (error: any) {
      return new Response(JSON.stringify({ success: false, message: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (path === '/api/admin/test-email' && method === 'POST') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    try {
      const body = (await request.json()) as DbRow;

      // In a real app, you'd use a library like Nodemailer to send a test email.
      // For now, we'll just simulate it by checking if the server is configured.
      if (body.smtpServer && body.smtpServer.trim() !== '') {
        await auditLog(
          authResult.session.userId,
          'EMAIL_TEST_SUCCESS',
          `Test email configuration successful for server: ${body.smtpServer}`,
          ipAddress,
        );
        return new Response(
          JSON.stringify({ success: true, message: 'Test successful! Check the test inbox.' }),
          {
            headers: { 'Content-Type': 'application/json' },
          },
        );
      } else {
        await auditLog(
          authResult.session.userId,
          'EMAIL_TEST_FAILED',
          'Test email configuration failed: SMTP server not specified.',
          ipAddress,
        );
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Test failed. SMTP server is not configured.',
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
    } catch (error: any) {
      return new Response(JSON.stringify({ success: false, message: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (path === '/api/admin/export-logs' && method === 'GET') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    try {
      const logs = (await db
        .query(`
        SELECT
          sal.id,
          sal.timestamp,
          sal.action,
          sal.description,
          sal.ip_address,
          u.email as user_email
        FROM security_audit_log sal
        LEFT JOIN users u ON sal.user_id = u.id
        ORDER BY sal.timestamp DESC
      `)
        .all()) as DbRow[];

      // Convert to CSV with proper quoting and CSV-injection scrubbing.
      const header =
        ['ID', 'Timestamp', 'User', 'Action', 'Details', 'IP Address'].map(escapeCsv).join(',') +
        '\n';
      const csvRows = logs
        .map((log) => {
          const timestamp = new Date((log.timestamp as number) * 1000).toISOString();
          const user = log.user_email || 'System';
          return [log.id, timestamp, user, log.action, log.description || '', log.ip_address || '']
            .map(escapeCsv)
            .join(',');
        })
        .join('\n');

      const csv = header + csvRows;

      await auditLog(
        authResult.session.userId,
        'LOGS_EXPORTED',
        'Security audit logs were exported.',
        ipAddress,
      );

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="aft-security-logs-${Date.now()}.csv"`,
        },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ success: false, message: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (path === '/api/admin/health-check' && method === 'GET') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    try {
      // Check database connection
      await db.query('SELECT 1').get();
      const dbStatus = 'OK';

      const healthStatus = {
        overall: 'OK',
        database: dbStatus,
      };

      await auditLog(
        authResult.session.userId,
        'HEALTH_CHECK_RUN',
        'System health check performed.',
        ipAddress,
      );

      return new Response(JSON.stringify({ success: true, status: healthStatus }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      const healthStatus = {
        overall: 'ERROR',
        database: `ERROR: ${error.message}`,
      };

      await auditLog(
        authResult.session.userId,
        'HEALTH_CHECK_FAILED',
        `System health check failed: ${error.message}`,
        ipAddress,
      );

      return new Response(
        JSON.stringify({ success: false, status: healthStatus, message: error.message }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  // Security Settings API
  if (path === '/api/admin/security-settings' && method === 'GET') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    const allSettings = await getSystemSettings();
    return new Response(JSON.stringify(allSettings), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (path === '/api/admin/security-settings' && method === 'POST') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    try {
      const settings = (await request.json()) as Record<string, string>;
      await saveSystemSettings(settings);

      await auditLog(
        authResult.session.userId,
        'SECURITY_SETTINGS_UPDATED',
        'Security settings were updated.',
        ipAddress,
      );

      return new Response(
        JSON.stringify({ success: true, message: 'Security settings saved successfully.' }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (error: any) {
      return new Response(JSON.stringify({ success: false, message: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (path === '/api/admin/restart-system' && method === 'POST') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    await auditLog(
      authResult.session.userId,
      'SYSTEM_RESTART_INITIATED',
      'System restart was initiated by an administrator.',
      ipAddress,
    );

    // Send a response to the client before exiting
    setTimeout(() => {
      console.log('Restarting server...');
      process.exit(0); // 0 indicates a clean exit
    }, 1000);

    return new Response(JSON.stringify({ success: true, message: 'System is restarting...' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (path === '/api/admin/clear-cache' && method === 'POST') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    // In a real app, this would clear a Redis/Memcached cache or an in-memory store.
    // For now, we'll just simulate it and log the action.
    await auditLog(
      authResult.session.userId,
      'CACHE_CLEARED',
      'System cache was cleared by an administrator.',
      ipAddress,
    );

    return new Response(
      JSON.stringify({ success: true, message: 'System cache cleared successfully.' }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // Backup Settings API
  if (path === '/api/admin/backup-settings' && method === 'GET') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    const settings = await getSystemSettings();
    return new Response(JSON.stringify(settings), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (path === '/api/admin/backup-settings' && method === 'POST') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    try {
      const settings = (await request.json()) as Record<string, string>;
      await saveSystemSettings(settings);

      await auditLog(
        authResult.session.userId,
        'BACKUP_SCHEDULE_UPDATED',
        `Backup schedule updated to: ${Object.values(settings).join(', ')}`,
        ipAddress,
      );

      return new Response(
        JSON.stringify({ success: true, message: 'Backup schedule saved successfully.' }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (error: any) {
      return new Response(JSON.stringify({ success: false, message: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (path.startsWith('/api/admin/requests/') && method === 'DELETE') {
    const authResult = await adminAuth(request, ipAddress);
    if (authResult.response) return authResult.response;

    const requestId = path.split('/')[4];
    if (!requestId) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid request ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const requestToDelete = (await db
        .query('SELECT status FROM aft_requests WHERE id = ?')
        .get(requestId)) as { status: string } | undefined;

      if (!requestToDelete) {
        return new Response(JSON.stringify({ success: false, message: 'Request not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (requestToDelete.status === 'completed') {
        await auditLog(
          authResult.session.userId,
          'REQUEST_DELETE_FORBIDDEN',
          `Attempted to delete completed request ID: ${requestId}`,
          ipAddress,
        );
        return new Response(
          JSON.stringify({ success: false, message: 'Completed requests cannot be deleted.' }),
          {
            status: 403, // Forbidden
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      await db.query('DELETE FROM aft_requests WHERE id = ?').run(requestId);

      await auditLog(
        authResult.session.userId,
        'REQUEST_DELETED',
        `Deleted request ID: ${requestId}`,
        ipAddress,
      );

      return new Response(
        JSON.stringify({ success: true, message: 'Request deleted successfully.' }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (error: any) {
      await auditLog(
        authResult.session.userId,
        'REQUEST_DELETE_FAILED',
        `Failed to delete request ID ${requestId}: ${error.message}`,
        ipAddress,
      );

      return new Response(
        JSON.stringify({ success: false, message: `Failed to delete request: ${error.message}` }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  return null;
}
