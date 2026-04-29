// DTA Dashboard - Main DTA landing page
import { ComponentBuilder, Templates } from '../components/ui/server-components';
import { getDb } from '../lib/database-bun';
import { DTANavigation, type DTAUser } from './dta-nav';

async function render(user: DTAUser, userId: number): Promise<string> {
  const db = getDb();

  // Get DTA statistics - filtered by assigned DTA
  const allRequests = (await db
    .query('SELECT COUNT(*) as count FROM aft_requests WHERE dta_id = ?')
    .get(userId)) as any;
  const dtaPendingRequests = (await db
    .query(`
    SELECT COUNT(*) as count FROM aft_requests 
    WHERE status = 'pending_dta' AND dta_id = ?
  `)
    .get(userId)) as any;
  const activeTransfers = (await db
    .query(`
    SELECT COUNT(*) as count FROM aft_requests 
    WHERE status = 'active_transfer' AND dta_id = ?
  `)
    .get(userId)) as any;
  const recentRequests = (await db
    .query(`
    SELECT * FROM aft_requests 
    WHERE status IN ('pending_dta', 'active_transfer', 'completed')
      AND dta_id = ?
    ORDER BY updated_at DESC 
    LIMIT 5
  `)
    .all(userId)) as any[];

  // Build action cards using Templates.adminCard
  const pendingRequestsCard = Templates.adminCard({
    title: 'Pending DTA Approval',
    description: 'Requests waiting for data transfer administrator review',
    primaryAction: {
      label: 'Review Pending',
      onClick: "window.location.href='/dta/requests?filter=pending_dta'",
    },
    status: {
      label: 'Pending',
      value: dtaPendingRequests?.count?.toString() || '0',
      status: dtaPendingRequests?.count > 0 ? 'warning' : 'operational',
    },
  });

  const activeTransfersCard = Templates.adminCard({
    title: 'Active Transfers',
    description: 'Currently processing data transfers',
    primaryAction: { label: 'Monitor Transfers', onClick: "window.location.href='/dta/active'" },
    status: {
      label: 'Active',
      value: activeTransfers?.count?.toString() || '0',
      status: activeTransfers?.count > 0 ? 'info' : 'operational',
    },
  });

  // Build recent requests table
  const recentRequestsTable = buildRecentRequestsTable(recentRequests);

  // Get anti-virus scan statistics for dashboard - only for assigned requests
  // Check if scan columns exist first
  let scanStats: any = { origination_scans: 0, destination_scans: 0, total_threats: 0 };

  try {
    // Check column existence via Postgres information_schema (the columns
    // are present after schema migrations have run, but we keep the guard
    // here for legacy databases that pre-date the migration).
    const columns = (await db
      .query(`
      SELECT column_name AS name
      FROM information_schema.columns
      WHERE table_name = 'aft_requests'
    `)
      .all()) as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);

    if (
      columnNames.includes('origination_scan_performed') &&
      columnNames.includes('destination_scan_performed') &&
      columnNames.includes('origination_threats_found') &&
      columnNames.includes('destination_threats_found')
    ) {
      scanStats = (await db
        .query(`
        SELECT 
          COUNT(CASE WHEN origination_scan_performed = TRUE THEN 1 END) as origination_scans,
          COUNT(CASE WHEN destination_scan_performed = TRUE THEN 1 END) as destination_scans,
          SUM(COALESCE(origination_threats_found, 0) + COALESCE(destination_threats_found, 0)) as total_threats
        FROM aft_requests
        WHERE status IN ('active_transfer', 'pending_sme_signature', 'completed', 'disposed')
          AND dta_id = ?
      `)
        .get(userId)) as any;
    }
  } catch (error) {
    console.warn('Could not query scan statistics, columns may not exist yet:', error);
  }

  const totalScans = (scanStats?.origination_scans || 0) + (scanStats?.destination_scans || 0);
  const threatsFound = scanStats?.total_threats || 0;

  // Build statistics card using DTANavigation.renderQuickStats
  const statsCard = DTANavigation.renderQuickStats([
    { label: 'My Assigned Requests', value: allRequests?.count || 0, status: 'operational' },
    {
      label: 'Pending My Action',
      value: dtaPendingRequests?.count || 0,
      status: dtaPendingRequests?.count > 0 ? 'warning' : 'operational',
    },
    {
      label: 'My Active Transfers',
      value: activeTransfers?.count || 0,
      status: activeTransfers?.count > 0 ? 'info' : 'operational',
    },
    {
      label: 'AV Scans',
      value: totalScans,
      status: threatsFound > 0 ? 'warning' : 'operational',
    },
  ]);

  const content = `
    <div class="space-y-8">
      ${ComponentBuilder.sectionHeader({
        title: 'Data Transfer Administration',
        description: 'Monitor and manage assured file transfers across the system',
      })}
      
      ${ComponentBuilder.grid({
        cols: 2,
        gap: 'lg',
        responsive: true,
        children: [pendingRequestsCard, activeTransfersCard].join(''),
      })}
      
      <div>
        <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">DTA Statistics</h3>
        ${statsCard}
      </div>
      
      <div>
        <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Recent Activity</h3>
        ${recentRequestsTable}
      </div>
    </div>
  `;

  return DTANavigation.renderLayout(
    'Dashboard',
    'Data Transfer Administrator Portal',
    user,
    '/dta',
    content,
  );
}

function buildRecentRequestsTable(requests: any[]): string {
  if (requests.length === 0) {
    return `
      <div class="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
        <div class="text-4xl mb-4">📊</div>
        <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No Recent Activity</h3>
        <p class="text-[var(--muted-foreground)] mb-4">No transfer requests to display at this time.</p>
      </div>
    `;
  }

  // Transform requests data for table
  const tableData = requests.map((request) => ({
    id: request.id,
    request_number: request.request_number,
    status: request.status,
    transfer_type: request.transfer_type || 'Unknown',
    created_at: request.created_at,
    updated_at: request.updated_at,
  }));

  // Define compact table columns
  const columns = [
    {
      key: 'request_number',
      label: 'Request',
      render: (_value: any, row: any) => `
        <div>
          <div class="font-medium text-[var(--foreground)] text-sm">${row.request_number}</div>
          <div class="text-xs text-[var(--muted-foreground)]">ID: ${row.id}</div>
        </div>
      `,
    },
    {
      key: 'status',
      label: 'Status',
      render: (_value: any, row: any) => {
        const statusVariant = {
          pending_dta: 'warning',
          active_transfer: 'info',
          completed: 'success',
          rejected: 'error',
        } as const;

        const variant = statusVariant[row.status as keyof typeof statusVariant] || 'default';

        return ComponentBuilder.statusBadge(row.status.replace('_', ' ').toUpperCase(), variant);
      },
    },
    {
      key: 'transfer_type',
      label: 'Type',
      render: (_value: any, row: any) => `
        <div class="text-sm text-[var(--foreground)]">${row.transfer_type}</div>
      `,
    },
    {
      key: 'updated_at',
      label: 'Updated',
      render: (_value: any, row: any) => `
        <div class="text-xs text-[var(--foreground)]">${new Date(row.updated_at * 1000).toLocaleDateString()}</div>
      `,
    },
  ];

  // Create compact table
  const table = ComponentBuilder.table({
    columns,
    rows: tableData,
    emptyMessage: 'No recent activity',
    compact: true,
  });

  return ComponentBuilder.tableContainer({
    table,
    className: 'bg-[var(--card)] rounded-lg border border-[var(--border)]',
  });
}

export const DTADashboard = {
  render,
};
