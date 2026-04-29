// Admin Reports Interface
import { ComponentBuilder } from '../components/ui/server-components';
import { getDb } from '../lib/database-bun';
import { AdminNavigation, type AdminUser } from './admin-nav';

async function renderReportsPage(user: AdminUser): Promise<string> {
  const db = getDb();

  // Get report data
  const userStats = {
    total: (await db.query('SELECT COUNT(*) as count FROM users').get()) as any,
    active: (await db
      .query('SELECT COUNT(*) as count FROM users WHERE is_active = TRUE')
      .get()) as any,
    inactive: (await db
      .query('SELECT COUNT(*) as count FROM users WHERE is_active = FALSE')
      .get()) as any,
  };

  const requestStats = {
    total: (await db.query('SELECT COUNT(*) as count FROM aft_requests').get()) as any,
    pending: (await db
      .query(
        "SELECT COUNT(*) as count FROM aft_requests WHERE status NOT IN ('completed', 'rejected', 'cancelled')",
      )
      .get()) as any,
    completed: (await db
      .query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'completed'")
      .get()) as any,
  };

  const securityStats = {
    totalLogins: (await db
      .query("SELECT COUNT(*) as count FROM security_audit_log WHERE action = 'LOGIN_SUCCESS'")
      .get()) as any,
    failedLogins: (await db
      .query("SELECT COUNT(*) as count FROM security_audit_log WHERE action = 'LOGIN_FAILED'")
      .get()) as any,
    todayLogins: (await db
      .query(`
      SELECT COUNT(*) as count FROM security_audit_log 
      WHERE action = 'LOGIN_SUCCESS' AND timestamp > (EXTRACT(EPOCH FROM NOW())::BIGINT - 86400)
    `)
      .get()) as any,
  };

  const reportCards = [
    {
      title: 'User Activity Report',
      description: 'Comprehensive user statistics and activity analysis',
      stats: [
        { label: 'Total Users', value: userStats.total?.count || 0 },
        { label: 'Active Users', value: userStats.active?.count || 0 },
        { label: 'Inactive Users', value: userStats.inactive?.count || 0 },
      ],
      actions: ['Export CSV', 'View Details'],
    },
    {
      title: 'Request Analytics',
      description: 'AFT request processing and completion metrics',
      stats: [
        { label: 'Total Requests', value: requestStats.total?.count || 0 },
        { label: 'Pending', value: requestStats.pending?.count || 0 },
        { label: 'Completed', value: requestStats.completed?.count || 0 },
      ],
      actions: ['Export Report', 'Request Trends'],
    },
    {
      title: 'Security Dashboard',
      description: 'Login statistics and security event monitoring',
      stats: [
        { label: 'Total Logins', value: securityStats.totalLogins?.count || 0 },
        { label: 'Failed Attempts', value: securityStats.failedLogins?.count || 0 },
        { label: "Today's Logins", value: securityStats.todayLogins?.count || 0 },
      ],
      actions: ['Security Report', 'Audit Trail'],
    },
    {
      title: 'System Performance',
      description: 'System health and performance metrics',
      stats: [
        { label: 'Uptime', value: `${Math.floor(process.uptime() / 60)}m` },
        { label: 'Memory Usage', value: 'N/A' },
        { label: 'Active Sessions', value: 'N/A' },
      ],
      actions: ['Performance Report', 'Health Check'],
    },
  ];

  const reportCardsHtml = reportCards
    .map(
      (card) => `
    <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
      <h3 class="text-lg font-semibold text-[var(--foreground)] mb-2">${card.title}</h3>
      <p class="text-[var(--muted-foreground)] text-sm mb-4">${card.description}</p>
      
      <div class="grid grid-cols-3 gap-4 mb-4">
        ${card.stats
          .map(
            (stat) => `
          <div class="text-center">
            <div class="text-2xl font-bold text-[var(--primary)]">${stat.value}</div>
            <div class="text-xs text-[var(--muted-foreground)]">${stat.label}</div>
          </div>
        `,
          )
          .join('')}
      </div>
      
      <div class="flex gap-2">
        ${card.actions
          .map((action) =>
            ComponentBuilder.secondaryButton({
              children: action,
              onClick: `generateReport('${action.toLowerCase().replace(/\s/g, '_')}')`,
              size: 'sm',
            }),
          )
          .join('')}
      </div>
    </div>
  `,
    )
    .join('');

  const content = `
    <div class="space-y-8">
      <!-- Report Cards -->
      <div>
        <h2 class="text-xl font-semibold text-[var(--foreground)] mb-4">Report Categories</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          ${reportCardsHtml}
        </div>
      </div>

      <!-- Report History -->
      <div>
        <h2 class="text-xl font-semibold text-[var(--foreground)] mb-4">Recent Reports</h2>
        <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
          <div class="text-center py-8">
            <div class="text-4xl mb-4">📈</div>
            <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No Reports Generated</h3>
            <p class="text-[var(--muted-foreground)]">Generated reports will appear here for download and review.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  return AdminNavigation.renderLayout(
    'Reports & Analytics',
    'System reports and data analysis',
    user,
    '/admin/reports',
    content,
  );
}

function getScript(): string {
  return `
    function generateReport(type) {
      const reportTypes = {
        'export_csv': 'User data exported to CSV format',
        'view_details': 'Detailed user activity report',
        'export_report': 'Request analytics exported',
        'request_trends': 'Request trend analysis generated',
        'security_report': 'Security report compiled',
        'audit_trail': 'Audit trail exported',
        'performance_report': 'System performance report generated',
        'health_check': 'System health check completed'
      };
      
      const message = reportTypes[type] || 'Report generated';
      alert(message + '. Download functionality not yet implemented.');
    }
    
    function generateQuickReport(type) {
      const reports = {
        'daily': 'Daily Activity Summary',
        'weekly': 'Weekly User Report',
        'monthly': 'Monthly Security Audit',
        'requests': 'Request Processing Report',
        'system': 'System Health Report'
      };
      
      const reportName = reports[type] || 'Report';
      
      // Show loading state
      const button = event.target;
      const originalText = button.textContent;
      button.textContent = 'Generating...';
      button.disabled = true;
      
      // Simulate report generation
      setTimeout(() => {
        alert(reportName + ' generated successfully. Download functionality not yet implemented.');
        button.textContent = originalText;
        button.disabled = false;
      }, 2000);
    }
  `;
}

export const AdminReports = {
  renderReportsPage,
  getScript,
};
