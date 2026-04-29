// Media Custodian Dashboard - Main media custodian landing page
import { ComponentBuilder, Templates } from '../components/ui/server-components';
import { getDb, type DbRow } from '../lib/database-bun';
import { MediaCustodianNavigation, type MediaCustodianUser } from './media-custodian-nav';

async function render(user: MediaCustodianUser, _userId: number): Promise<string> {
  const db = getDb();

  // Get media custodian's statistics
  const allRequests = (await db.query('SELECT COUNT(*) as count FROM aft_requests').get()) as DbRow;
  const pendingRequests = (await db
    .query(`
    SELECT COUNT(*) as count FROM aft_requests 
    WHERE status IN ('submitted', 'pending_dao', 'pending_approver', 'pending_cpso')
  `)
    .get()) as DbRow;
  const recentRequests = (await db
    .query(`
    SELECT * FROM aft_requests 
    ORDER BY created_at DESC 
    LIMIT 5
  `)
    .all()) as DbRow[];

  // Build action cards
  const allRequestsCard = Templates.adminCard({
    title: 'All Requests',
    description: 'View and manage all AFT requests in the system',
    primaryAction: {
      label: 'View All',
      onClick: "window.location.href='/media-custodian/requests'",
    },
    secondaryAction: { label: 'Filter', onClick: 'filterAllRequests()' },
    status: {
      label: 'Total Requests',
      value: Number(allRequests?.count).toString() || '0',
      status: 'operational',
    },
  });

  const inventoryCard = Templates.adminCard({
    title: 'Media Inventory',
    description: 'Track and manage media devices and storage',
    primaryAction: {
      label: 'View Inventory',
      onClick: "window.location.href='/media-custodian/inventory'",
    },
    secondaryAction: { label: 'Add Media', onClick: 'addNewMedia()' },
    status: { label: 'Active Media', value: 'Available', status: 'operational' },
  });

  const pendingCard = Templates.adminCard({
    title: 'Pending Actions',
    description: 'Requests requiring media custodian attention',
    primaryAction: { label: 'View Pending', onClick: 'viewPendingRequests()' },
    secondaryAction: { label: 'Process Queue', onClick: 'processQueue()' },
    status: {
      label: 'Pending',
      value: Number(pendingRequests?.count).toString() || '0',
      status: Number(pendingRequests?.count) > 0 ? 'warning' : 'operational',
    },
  });

  const reportsCard = Templates.adminCard({
    title: 'Reports & Analytics',
    description: 'Generate reports and view system analytics',
    primaryAction: {
      label: 'View Reports',
      onClick: "window.location.href='/media-custodian/reports'",
    },
    secondaryAction: { label: 'Export Data', onClick: 'exportData()' },
    status: { label: 'Reports', value: 'Available', status: 'operational' },
  });

  // Build recent requests table
  const recentRequestsTable = buildRecentRequestsTable(recentRequests);

  // Build statistics card
  const statsCard = MediaCustodianNavigation.renderQuickStats([
    { label: 'Total Requests', value: Number(allRequests?.count) || 0, status: 'operational' },
    {
      label: 'Pending Actions',
      value: Number(pendingRequests?.count) || 0,
      status: Number(pendingRequests?.count) > 0 ? 'warning' : 'operational',
    },
    {
      label: 'This Month',
      value: getThisMonthCount(recentRequests),
      status: 'operational',
    },
    {
      label: 'Processing Rate',
      value: getProcessingRate(allRequests?.count || 0, pendingRequests?.count || 0),
      status: 'operational',
    },
  ]);

  const content = `
      <div class="space-y-8">
        ${ComponentBuilder.sectionHeader({
          title: 'Media Management',
          description: 'Oversee and manage all Assured File Transfer operations',
        })}
        
        ${ComponentBuilder.grid({
          cols: 2,
          gap: 'lg',
          responsive: true,
          children: [allRequestsCard, inventoryCard, pendingCard, reportsCard].join(''),
        })}
        
        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">System Statistics</h3>
          ${statsCard}
        </div>
        
        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Recent Requests</h3>
          ${recentRequestsTable}
        </div>
      </div>
  `;

  return MediaCustodianNavigation.renderLayout(
    'Dashboard',
    'Media Custodian Control Center',
    user,
    '/media-custodian',
    content,
  );
}

function buildRecentRequestsTable(requests: any[]): string {
  if (requests.length === 0) {
    return `
      <div class="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
        <div class="text-4xl mb-4">📋</div>
        <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No Requests</h3>
        <p class="text-[var(--muted-foreground)] mb-4">No AFT requests have been submitted yet.</p>
      </div>
    `;
  }

  // Transform requests data for table
  const tableData = requests.map((request) => ({
    id: request.id,
    request_number: request.request_number,
    status: request.status,
    transfer_type: request.transfer_type || 'Unknown',
    requestor_email: request.requestor_email || 'Unknown',
    created_at: request.created_at,
    updated_at: request.updated_at,
  }));

  // Define table columns
  const columns = [
    {
      key: 'request_number',
      label: 'Request Number',
      render: (_value: unknown, row: DbRow) => `
        <div>
          <div class="font-medium text-[var(--foreground)]">${row.request_number}</div>
          <div class="text-sm text-[var(--muted-foreground)]">ID: ${row.id}</div>
        </div>
      `,
    },
    {
      key: 'requestor_email',
      label: 'Requestor',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">${row.requestor_email}</div>
      `,
    },
    {
      key: 'transfer_type',
      label: 'Type',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">${row.transfer_type}</div>
      `,
    },
    {
      key: 'status',
      label: 'Status',
      render: (_value: unknown, row: DbRow) => {
        const statusVariant = {
          draft: 'default',
          submitted: 'info',
          pending_dao: 'warning',
          pending_approver: 'warning',
          pending_cpso: 'warning',
          approved: 'success',
          rejected: 'error',
          completed: 'success',
          cancelled: 'default',
        } as const;

        const variant = statusVariant[row.status as keyof typeof statusVariant] || 'default';

        return ComponentBuilder.statusBadge(String(row.status).replace('_', ' ').toUpperCase(), variant);
      },
    },
    {
      key: 'created_at',
      label: 'Submitted',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">${new Date((row.created_at as number) * 1000).toLocaleDateString()}</div>
      `,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_value: unknown, row: DbRow) =>
        ComponentBuilder.tableCellActions([
          { label: 'View', onClick: `viewRequest(${row.id})`, variant: 'secondary' },
          { label: 'Process', onClick: `processRequest(${row.id})`, variant: 'primary' },
        ]),
    },
  ];

  // Create table
  const table = ComponentBuilder.table({
    columns,
    rows: tableData,
    emptyMessage: 'No recent requests found',
    compact: true,
  });

  return ComponentBuilder.tableContainer({
    table,
    className: 'bg-[var(--card)] rounded-lg border border-[var(--border)]',
  });
}

function getThisMonthCount(requests: any[]): number {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  return requests.filter((request) => {
    const requestDate = new Date(request.created_at * 1000);
    return requestDate.getMonth() === thisMonth && requestDate.getFullYear() === thisYear;
  }).length;
}

function getProcessingRate(total: number, pending: number): string {
  if (total === 0) return '0%';
  const processed = total - pending;
  const rate = Math.round((processed / total) * 100);
  return `${rate}%`;
}

function getScript(): string {
  return `
    function filterAllRequests() {
      window.location.href = '/media-custodian/requests?filter=all';
    }
    
    function viewPendingRequests() {
      window.location.href = '/media-custodian/requests?filter=pending';
    }
    
    function addNewMedia() {
      alert('Add New Media functionality will be implemented in the inventory management system.');
    }
    
    function processQueue() {
      alert('Processing queue... This will batch process pending requests.');
    }
    
    function exportData() {
      alert('Export functionality will generate reports in CSV/PDF format.');
    }
    
    function viewRequest(requestId) {
      window.location.href = '/media-custodian/requests/' + requestId;
    }
    
    function processRequest(requestId) {
      window.location.href = '/media-custodian/requests/' + requestId + '/process';
    }
  `;
}

export const MediaCustodianDashboard = {
  render,
  getScript,
};
