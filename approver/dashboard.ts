// Approver Dashboard - Main approver landing page
import { ComponentBuilder } from '../components/ui/server-components';
import { getDb, type DbRow } from '../lib/database-bun';
import { ApproverNavigation, type ApproverUser } from './approver-nav';

async function render(user: ApproverUser, _userId: number): Promise<string> {
  const db = getDb();

  // Approver-centric metrics
  const pendingCount = (await db
    .query(`
    SELECT COUNT(*) as count FROM aft_requests 
    WHERE status NOT IN ('approved','rejected','completed','cancelled','draft')
  `)
    .get()) as DbRow;

  const approved7d = (await db
    .query(`
    SELECT COUNT(*) as count FROM aft_requests 
    WHERE status = 'approved' AND updated_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - 7*24*60*60)
  `)
    .get()) as DbRow;

  const rejected7d = (await db
    .query(`
    SELECT COUNT(*) as count FROM aft_requests 
    WHERE status = 'rejected' AND updated_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - 7*24*60*60)
  `)
    .get()) as DbRow;

  // Pending queue
  const pendingQueue = (await db
    .query(`
    SELECT r.id, r.request_number, r.requestor_id, r.transfer_type, r.classification, r.status, r.created_at, r.updated_at,
           u.first_name || ' ' || u.last_name as requestor_name,
           u.email as requestor_email
    FROM aft_requests r
    LEFT JOIN users u ON r.requestor_id = u.id
    WHERE r.status NOT IN ('approved','rejected','completed','cancelled','draft')
    ORDER BY r.updated_at DESC
    LIMIT 25
  `)
    .all()) as DbRow[];

  // Recently approved
  const recentApproved = (await db
    .query(`
    SELECT r.id, r.request_number, r.transfer_type, r.classification, r.updated_at
    FROM aft_requests r
    WHERE r.status = 'approved'
    ORDER BY r.updated_at DESC
    LIMIT 10
  `)
    .all()) as DbRow[];

  // KPI stats
  const statsCard = ApproverNavigation.renderQuickStats([
    {
      label: 'Pending Queue',
      value: Number(pendingCount?.count) || 0,
      status: (Number(pendingCount?.count) || 0) > 0 ? 'warning' : 'operational',
    },
    { label: 'Approved (7d)', value: Number(approved7d?.count) || 0, status: 'operational' },
    { label: 'Rejected (7d)', value: Number(rejected7d?.count) || 0, status: 'operational' },
    { label: 'SLA Risk', value: getAgingRisk(pendingQueue), status: 'warning' },
  ]);

  const content = `
    <div class="space-y-8">
      ${ComponentBuilder.sectionHeader({
        title: 'Approver Dashboard',
        description: 'Review and manage AFT requests awaiting your decision',
      })}

      <div>
        <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Key Metrics</h3>
        ${statsCard}
      </div>

      <div>
        <h3 class="text-xl font-semibold text-[var(--foreground)] mb-4">Pending Queue</h3>
        ${buildPendingTable(pendingQueue)}
      </div>

      <div>
        <h3 class="text-xl font-semibold text-[var(--foreground)] mb-4">Recently Approved</h3>
        ${buildApprovedTable(recentApproved)}
      </div>
    </div>
  `;

  return ApproverNavigation.renderLayout(
    'Dashboard',
    'Approver Operations and Review',
    user,
    '/approver',
    content,
  );
}

function buildPendingTable(rows: DbRow[]): string {
  if (rows.length === 0) {
    return `
      <div class="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
        <div class="text-4xl mb-4">✅</div>
        <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No Pending Items</h3>
        <p class="text-[var(--muted-foreground)] mb-4">You're all caught up.</p>
      </div>
    `;
  }

  // Transform for table
  const tableData = rows.map((r) => ({
    id: r.id as string | number,
    request_number: r.request_number,
    requestor: r.requestor_name || r.requestor_email,
    status: r.status,
    transfer_type: String(r.transfer_type || 'Unknown'),
    classification: String(r.classification || 'UNCLASSIFIED'),
    created_at: r.created_at,
    age_days: Math.max(
      0,
      Math.floor((Date.now() / 1000 - Number(r.created_at || r.updated_at)) / (24 * 60 * 60)),
    ),
  }));

  // Define table columns
  const columns = [
    {
      key: 'request_number',
      label: 'Request Number',
      render: (_value: unknown, row: DbRow) => `
        <div>
          <div class="font-medium text-[var(--foreground)]">${row.request_number}</div>
          <div class="text-xs text-[var(--muted-foreground)]">ID: ${row.id}</div>
        </div>
      `,
    },
    {
      key: 'requestor',
      label: 'Requestor',
      render: (_: unknown, row: DbRow) =>
        `<div class="text-sm text-[var(--foreground)]">${row.requestor}</div>`,
    },
    {
      key: 'transfer_type',
      label: 'Type',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">${row.transfer_type}</div>
      `,
    },
    {
      key: 'classification',
      label: 'Class',
      render: (_: unknown, row: DbRow) =>
        `<div class="text-sm text-[var(--foreground)]">${row.classification}</div>`,
    },
    {
      key: 'age_days',
      label: 'Age (days)',
      render: (_: unknown, row: DbRow) =>
        `<div class="text-sm text-[var(--foreground)]">${row.age_days}</div>`,
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
      render: (_: unknown, row: DbRow) =>
        ComponentBuilder.tableCellActions([
          { label: 'Review', onClick: `reviewRequest(${row.id})`, variant: 'secondary' },
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

function buildApprovedTable(rows: DbRow[]): string {
  if (rows.length === 0) {
    return `<div class="text-sm text-[var(--muted-foreground)]">No approvals yet</div>`;
  }
  const list = rows
    .map(
      (r) => `
    <div class="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
      <div>
        <div class="font-medium">${r.request_number}</div>
        <div class="text-xs text-[var(--muted-foreground)]">${r.transfer_type || 'Unknown'} • ${r.classification || ''}</div>
      </div>
      <div class="text-xs text-[var(--muted-foreground)]">${new Date((r.updated_at as number) * 1000).toLocaleDateString()}</div>
    </div>
  `,
    )
    .join('');
  return `<div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4">${list}</div>`;
}

function getAgingRisk(rows: DbRow[]): string {
  if (!rows || rows.length === 0) return '0 at risk';
  const nowSec = Math.floor(Date.now() / 1000);
  const atRisk = rows.filter(
    (r) => nowSec - Number(r.updated_at || r.created_at) > 5 * 24 * 60 * 60,
  ).length; // >5 days
  return `${atRisk} at risk`;
}

function getScript(): string {
  return `
    function reviewRequest(requestId) {
      window.location.href = '/approver/request/' + requestId;
    }
  `;
}

export const ApproverDashboard = {
  render,
  getScript,
};
