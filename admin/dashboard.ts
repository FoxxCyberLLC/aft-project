// Admin Dashboard - Main admin landing page
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { AdminNavigation, type AdminUser } from "./admin-nav";
import { getDb } from "../lib/database-bun";
import { UsersIcon, ShieldIcon, FileTextIcon, SettingsIcon, TrendingUpIcon, ActivityIcon, BellIcon, CheckCircleIcon } from "../components/icons";

export class AdminDashboard {
  static async render(user: AdminUser): Promise<string> {
    const db = getDb();
    
    // Get system statistics
    const userCount = await db.query("SELECT COUNT(*) as count FROM users WHERE is_active = TRUE").get() as any;
    const requestCount = await db.query("SELECT COUNT(*) as count FROM aft_requests").get() as any;
    const recentLogins = await db.query(`
      SELECT COUNT(*) as count FROM security_audit_log 
      WHERE action = 'LOGIN_SUCCESS' AND timestamp > (EXTRACT(EPOCH FROM NOW())::BIGINT - 86400)
    `).get() as any;

    // Build admin cards
    const userManagementCard = Templates.adminCard({
      title: `${UsersIcon({ size: 20 })} User Management`,
      description: 'Manage user accounts, roles, and permissions',
      primaryAction: { label: 'Manage Users', onClick: 'window.location.href=\'/admin/users\'' },
      secondaryAction: { label: 'Add User', onClick: 'window.location.href=\'/admin/users\'' },
      status: { label: 'Active Users', value: userCount?.count?.toString() || '0', status: 'operational' }
    });

    const securityCard = Templates.adminCard({
      title: `${ShieldIcon({ size: 20 })} Security Monitoring`,
      description: 'View security audit logs and system security status',
      primaryAction: { label: 'View Audit Log', onClick: 'window.location.href=\'/admin/security/audit\'' },
      secondaryAction: { label: 'Security Settings', onClick: 'window.location.href=\'/admin/security/settings\'' },
      status: { label: 'Threat Level', value: 'LOW', status: 'operational' }
    });

    const requestCard = Templates.adminCard({
      title: `${FileTextIcon({ size: 20 })} Request Management`,
      description: 'View and manage all AFT requests across the system',
      primaryAction: { label: 'All Requests', onClick: 'window.location.href=\'/admin/requests\'' },
      secondaryAction: { label: 'Analytics', onClick: 'window.location.href=\'/admin/reports\'' },
      status: { label: 'Total Requests', value: requestCount?.count?.toString() || '0', status: 'operational' }
    });

    const systemCard = Templates.adminCard({
      title: `${SettingsIcon({ size: 20 })} System Settings`,
      description: 'Configure system parameters and maintenance',
      primaryAction: { label: 'Settings', onClick: 'window.location.href=\'/admin/system\'' },
      secondaryAction: { label: 'Maintenance', onClick: 'window.location.href=\'/admin/system\'' },
      status: { label: 'System Status', value: 'OPERATIONAL', status: 'operational' }
    });

    // Build statistics card
    const statsCard = AdminNavigation.renderQuickStats([
      { label: 'Active Users', value: userCount?.count || 0, status: 'operational' },
      { label: 'Total Requests', value: requestCount?.count || 0, status: 'operational' },
      { label: 'Today\'s Logins', value: recentLogins?.count || 0, status: 'operational' },
      { label: 'System Status', value: 'OPERATIONAL', status: 'operational' }
    ]);

    const content = AdminNavigation.renderLayout(
      'Dashboard',
      'System Administration & Security Management',
      user,
      '/admin',
      `
        <div class="space-y-8">
          ${ComponentBuilder.sectionHeader({
            title: 'System Administration',
            description: 'Manage users, security, requests, and system settings'
          })}
          
          ${ComponentBuilder.grid({
            cols: 2,
            gap: 'lg',
            responsive: true,
            children: [userManagementCard, securityCard, requestCard, systemCard].join('')
          })}
          
          <div>
            <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6 flex items-center gap-2">
              ${TrendingUpIcon({ size: 24 })}
              System Overview
            </h3>
            ${statsCard}
          </div>
          
          <div>
            <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6 flex items-center gap-2">
              ${ActivityIcon({ size: 24 })}
              Recent Activity
            </h3>
            <div id="recent-activity" class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
              <div class="text-center py-4">
                <div class="animate-spin w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full mx-auto mb-2"></div>
                <p class="text-sm text-[var(--muted-foreground)]">Loading recent activity...</p>
              </div>
            </div>
          </div>
        </div>
      `
    );

    return content;
  }

  static getScript(): string {
    return `
      // Load recent activity on page load
      document.addEventListener('DOMContentLoaded', function() {
        loadRecentActivity();
      });

      function loadRecentActivity() {
        fetch('/api/security/audit')
          .then(response => response.json())
          .then(logs => {
            displayRecentActivity(logs.slice(0, 10)); // Show last 10 items
          })
          .catch(error => {
            document.getElementById('recent-activity').innerHTML = 
              '<div class="text-center py-4 text-[var(--destructive)]">Error loading recent activity</div>';
          });
      }

      function displayRecentActivity(logs) {
        const activityHtml = logs.map(log => {
          const date = new Date(log.timestamp * 1000);
          const statusClass = log.action.includes('SUCCESS') ? 'text-[var(--success)]' :
                             log.action.includes('FAILED') ? 'text-[var(--destructive)]' :
                             'text-[var(--warning)]';
          const statusText = log.action.includes('SUCCESS') ? 'SUCCESS' : 
                            log.action.includes('FAILED') ? 'FAILED' : 'INFO';
          const statusIcon = log.action.includes('SUCCESS') ? 
                            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' :
                            log.action.includes('FAILED') ? 
                            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' :
                            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
          
          return '<div class="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)] transition-colors px-4 -mx-4 rounded-lg">' +
                   '<div class="flex-1">' +
                     '<div class="flex items-center gap-3">' +
                       '<span class="flex items-center gap-2 ' + statusClass + '">' +
                         statusIcon +
                       '</span>' +
                       '<span class="text-sm font-mono text-[var(--muted-foreground)]">' +
                         date.toLocaleTimeString() +
                       '</span>' +
                       '<span class="text-sm font-medium">' + log.action + '</span>' +
                     '</div>' +
                     '<p class="text-sm text-[var(--muted-foreground)] mt-1 ml-8">' + log.description + '</p>' +
                   '</div>' +
                   '<span class="text-xs font-medium ' + statusClass + ' uppercase px-2 py-1 rounded-md bg-[var(--muted)]">' +
                     statusText +
                   '</span>' +
                 '</div>';
        }).join('');

        document.getElementById('recent-activity').innerHTML = 
          '<h4 class="font-semibold mb-4 flex items-center gap-2">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
            'Recent System Events' +
          '</h4>' +
          '<div class="space-y-0">' +
            activityHtml +
          '</div>' +
          '<div class="mt-4 text-center">' +
            '<a href="/admin/security/audit" class="text-sm text-[var(--primary)] hover:underline inline-flex items-center gap-1">' +
              'View Full Audit Log' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
            '</a>' +
          '</div>';
      }
    `;
  }
}