// Media Custodian Reports Interface
import { ComponentBuilder } from '../components/ui/server-components';
import { getDb, type DbRow } from '../lib/database-bun';
import { MediaCustodianNavigation, type MediaCustodianUser } from './media-custodian-nav';

async function renderReportsPage(user: MediaCustodianUser): Promise<string> {
  const db = getDb();

  // Get media custodian-specific report data
  const mediaStats = {
    totalRequests: (await db
      .query(
        "SELECT COUNT(*) as count FROM aft_requests WHERE status IN ('pending_media_custody', 'media_transfer_active', 'media_transfer_complete')",
      )
      .get()) as DbRow,
    pendingCustody: (await db
      .query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'pending_media_custody'")
      .get()) as DbRow,
    activeTransfers: (await db
      .query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'media_transfer_active'")
      .get()) as DbRow,
    completed: (await db
      .query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'media_transfer_complete'")
      .get()) as DbRow,
  };

  const driveStats = {
    totalDrives: (await db.query('SELECT COUNT(*) as count FROM media_drives').get()) as DbRow,
    availableDrives: (await db
      .query("SELECT COUNT(*) as count FROM media_drives WHERE status = 'available'")
      .get()) as DbRow,
    issuedDrives: (await db
      .query("SELECT COUNT(*) as count FROM media_drives WHERE status = 'issued'")
      .get()) as DbRow,
    disposedDrives: (await db
      .query("SELECT COUNT(*) as count FROM media_drives WHERE status = 'disposed'")
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
    cleanTransfers: (await db
      .query(`
      SELECT COUNT(*) as count FROM aft_requests 
      WHERE (origination_scan_performed = TRUE OR destination_scan_performed = TRUE)
      AND COALESCE(origination_threats_found, 0) = 0 
      AND COALESCE(destination_threats_found, 0) = 0
    `)
      .get()) as DbRow,
  };

  const reportCards = [
    {
      title: 'Media Transfer Statistics',
      description: 'Current media transfer and custody metrics',
      stats: [
        { label: 'Total Media Requests', value: mediaStats.totalRequests?.count || 0 },
        { label: 'Pending Custody', value: mediaStats.pendingCustody?.count || 0 },
        { label: 'Active Transfers', value: mediaStats.activeTransfers?.count || 0 },
      ],
      actions: ['Export Transfer Report', 'Media Timeline'],
    },
    {
      title: 'Drive Inventory',
      description: 'Physical media inventory and utilization tracking',
      stats: [
        { label: 'Total Drives', value: driveStats.totalDrives?.count || 0 },
        { label: 'Available', value: driveStats.availableDrives?.count || 0 },
        { label: 'Currently Issued', value: driveStats.issuedDrives?.count || 0 },
      ],
      actions: ['Inventory Report', 'Drive Lifecycle'],
    },
    {
      title: 'Security & Compliance',
      description: 'Anti-virus scans and threat detection for media transfers',
      stats: [
        { label: 'Threats Detected', value: securityStats.threatsDetected?.total_threats || 0 },
        { label: 'Scans Performed', value: securityStats.scansPerformed?.count || 0 },
        { label: 'Clean Transfers', value: securityStats.cleanTransfers?.count || 0 },
      ],
      actions: ['Security Report', 'Threat Analysis'],
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
      ${ComponentBuilder.sectionHeader({
        title: 'Reports & Analytics',
        description: 'Media custody, transfer tracking, and security reporting',
      })}

      <!-- Report Categories -->
      <div>
        <h2 class="text-xl font-semibold text-[var(--foreground)] mb-4">Report Categories</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

  return MediaCustodianNavigation.renderLayout(
    'Reports & Analytics',
    'Media custody and transfer reporting',
    user,
    '/media-custodian/reports',
    content,
  );
}

function getScript(): string {
  return `
    function generateReport(reportType) {
      console.log('Generating report:', reportType);
      alert('Report generation not yet implemented for: ' + reportType.replace(/_/g, ' '));
    }
    
  `;
}

export const MediaCustodianReports = {
  renderReportsPage,
  getScript,
};
