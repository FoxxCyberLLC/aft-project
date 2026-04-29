// DTA Reports Interface
import { ComponentBuilder } from '../components/ui/server-components';
import { getDb, type DbRow } from '../lib/database-bun';
import { DTANavigation, type DTAUser } from './dta-nav';

async function renderReportsPage(user: DTAUser): Promise<string> {
  const db = getDb();

  // Get DTA-specific report data
  const transferStats = {
    total: (await db
      .query(
        "SELECT COUNT(*) as count FROM aft_requests WHERE status IN ('active_transfer', 'completed', 'disposed')",
      )
      .get()) as DbRow,
    active: (await db
      .query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'active_transfer'")
      .get()) as DbRow,
    completed: (await db
      .query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'completed'")
      .get()) as DbRow,
  };

  const performanceStats = {
    avgTransferTime: (await db
      .query(`
      SELECT AVG(actual_end_date - actual_start_date) as avg_time 
      FROM aft_requests 
      WHERE actual_start_date IS NOT NULL AND actual_end_date IS NOT NULL
    `)
      .get()) as DbRow,
    successRate: (await db
      .query(`
      SELECT 
        ROUND((COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*)), 1) as success_rate
      FROM aft_requests 
      WHERE status IN ('completed', 'rejected', 'cancelled')
    `)
      .get()) as DbRow,
  };

  const securityStats = {
    threatsDetected: (await db
      .query(`
      SELECT SUM(COALESCE(origination_threats_found, 0) + COALESCE(destination_threats_found, 0)) as total_threats
      FROM aft_requests
      WHERE origination_scan_performed = TRUE OR destination_scan_performed = TRUE
    `)
      .get()) as DbRow,
    scansPerformed: (await db
      .query(`
      SELECT COUNT(*) as count FROM aft_requests 
      WHERE origination_scan_performed = TRUE OR destination_scan_performed = TRUE
    `)
      .get()) as DbRow,
  };

  const reportCards = [
    {
      title: 'Transfer Performance',
      description: 'Analysis of transfer completion times and success rates',
      stats: [
        { label: 'Total Transfers', value: transferStats.total?.count || 0 },
        { label: 'Active Transfers', value: transferStats.active?.count || 0 },
        { label: 'Completed', value: transferStats.completed?.count || 0 },
      ],
      actions: ['Export Performance Report', 'Transfer Trends'],
    },
    {
      title: 'Security & Compliance',
      description: 'Anti-virus scans and threat detection statistics',
      stats: [
        { label: 'Threats Detected', value: securityStats.threatsDetected?.total_threats || 0 },
        { label: 'Scans Performed', value: securityStats.scansPerformed?.count || 0 },
        { label: 'Success Rate', value: `${performanceStats.successRate?.success_rate || 0}%` },
      ],
      actions: ['Security Report', 'Compliance Audit'],
    },
    {
      title: 'Media Management',
      description: 'Drive utilization and media lifecycle tracking',
      stats: [
        { label: 'Drives Issued', value: 'N/A' },
        { label: 'Storage Used', value: 'N/A' },
        { label: 'Media Disposed', value: 'N/A' },
      ],
      actions: ['Media Report', 'Utilization Analysis'],
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

  const quickReports = [
    { name: 'Daily Transfer Summary', type: 'daily_transfers', icon: '📊' },
    { name: 'Weekly Performance Report', type: 'weekly_performance', icon: '⚡' },
    { name: 'Security Scan Report', type: 'security_scans', icon: '🔒' },
    { name: 'Media Utilization Report', type: 'media_usage', icon: '💿' },
    { name: 'Compliance Audit Report', type: 'compliance', icon: '✅' },
  ];

  const quickReportsHtml = quickReports
    .map(
      (report) => `
    <div class="flex items-center justify-between p-4 bg-[var(--muted)] rounded-lg">
      <div class="flex items-center gap-3">
        <span class="text-2xl">${report.icon}</span>
        <div>
          <div class="font-medium text-[var(--foreground)]">${report.name}</div>
          <div class="text-sm text-[var(--muted-foreground)]">Generate and download report</div>
        </div>
      </div>
      ${ComponentBuilder.primaryButton({
        children: 'Generate',
        onClick: `generateQuickReport('${report.type}')`,
        size: 'sm',
      })}
    </div>
  `,
    )
    .join('');

  const content = `
    <div class="space-y-8">
      ${ComponentBuilder.sectionHeader({
        title: 'Reports & Analytics',
        description: 'Transfer performance, security, and compliance reporting',
      })}

      <!-- Report Categories -->
      <div>
        <h2 class="text-xl font-semibold text-[var(--foreground)] mb-4">Report Categories</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${reportCardsHtml}
        </div>
      </div>

      <!-- Quick Reports -->
      <div>
        <h2 class="text-xl font-semibold text-[var(--foreground)] mb-4">Quick Reports</h2>
        <div class="space-y-3">
          ${quickReportsHtml}
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

  return DTANavigation.renderLayout(
    'Reports & Analytics',
    'Transfer performance and compliance reporting',
    user,
    '/dta/reports',
    content,
  );
}

function getScript(): string {
  return `
    function generateReport(reportType) {
      console.log('Generating report:', reportType);
      alert('Report generation not yet implemented for: ' + reportType.replace(/_/g, ' '));
    }
    
    function generateQuickReport(reportType) {
      console.log('Generating quick report:', reportType);
      alert('Quick report generation not yet implemented for: ' + reportType.replace(/_/g, ' '));
    }
  `;
}

export const DTAReports = {
  renderReportsPage,
  getScript,
};
