// SME Dashboard - Main SME landing page
import { ComponentBuilder, Templates } from '../components/ui/server-components';
import { getDb, type DbRow } from '../lib/database-bun';
import { SMENavigation, type SMEUser } from './sme-nav';

async function render(user: SMEUser, _userId: number): Promise<string> {
  const db = getDb();

  const pendingSignatures = (await db
    .query(`
    SELECT COUNT(*) as count FROM aft_requests 
    WHERE status = 'pending_sme_signature'
  `)
    .get()) as DbRow;

  const signedHistory = (await db
    .query(`
    SELECT COUNT(*) as count FROM aft_request_history
    WHERE user_email = ? AND action = 'sme_signed'
  `)
    .get(user.email)) as DbRow;

  const recentActivity = (await db
    .query(`
    SELECT * FROM aft_requests
    WHERE status = 'pending_sme_signature' OR (status = 'completed' AND id IN (SELECT request_id FROM aft_request_history WHERE user_email = ? AND action = 'sme_signed'))
    ORDER BY updated_at DESC
    LIMIT 5
  `)
    .all(user.email)) as DbRow[];

  const pendingCard = Templates.adminCard({
    title: 'Pending Signatures',
    description: 'Requests waiting for your Two-Person Integrity signature.',
    primaryAction: { label: 'Review Pending', onClick: "window.location.href='/sme'" },
    status: {
      label: 'Pending',
      value: Number(pendingSignatures?.count).toString() || '0',
      status: pendingSignatures?.count > 0 ? 'warning' : 'operational',
    },
  });

  const historyCard = Templates.adminCard({
    title: 'Signature History',
    description: 'View a log of all requests you have signed.',
    primaryAction: { label: 'View History', onClick: "window.location.href='/sme/history'" },
    status: {
      label: 'Signed',
      value: Number(signedHistory?.count).toString() || '0',
      status: 'operational',
    },
  });

  const recentActivityTable = buildRecentActivityTable(recentActivity);

  const content = `
    <div class="space-y-8">
      ${ComponentBuilder.sectionHeader({
        title: 'SME Signature Portal',
        description: 'Provide Two-Person Integrity for completed data transfers.',
      })}
      
      ${ComponentBuilder.grid({
        cols: 2,
        gap: 'lg',
        responsive: true,
        children: [pendingCard, historyCard].join(''),
      })}
      
      <div>
        <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Recent Activity</h3>
        ${recentActivityTable}
      </div>
    </div>
  `;

  return SMENavigation.renderLayout('Dashboard', 'SME Signature Portal', user, '/sme', content);
}

function buildRecentActivityTable(requests: any[]): string {
  if (requests.length === 0) {
    return `<div class="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
              <div class="text-4xl mb-4">✍️</div>
              <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No Recent Activity</h3>
              <p class="text-[var(--muted-foreground)] mb-4">There are no pending signatures or recent actions.</p>
            </div>`;
  }

  const tableData = requests.map((request) => ({
    id: request.id,
    request_number: request.request_number,
    status: request.status,
    updated_at: request.updated_at,
  }));

  const columns = [
    {
      key: 'request_number',
      label: 'Request',
      render: (_value: unknown, row: DbRow) => `<div>
                                          <div class="font-medium text-[var(--foreground)] text-sm">${row.request_number}</div>
                                          <div class="text-xs text-[var(--muted-foreground)]">ID: ${row.id}</div>
                                        </div>`,
    },
    {
      key: 'status',
      label: 'Status',
      render: (_value: unknown, row: DbRow) => {
        const statusVariant = {
          pending_sme_signature: 'warning',
          completed: 'success',
        } as const;
        const variant = statusVariant[row.status as keyof typeof statusVariant] || 'default';
        return ComponentBuilder.statusBadge(row.status.replace(/_/g, ' ').toUpperCase(), variant);
      },
    },
    {
      key: 'updated_at',
      label: 'Last Updated',
      render: (_value: unknown, row: DbRow) =>
        `<div class="text-xs text-[var(--foreground)]">${new Date((row.updated_at as number) * 1000).toLocaleDateString()}</div>`,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_value: unknown, row: DbRow) => {
        if (row.status === 'pending_sme_signature') {
          return ComponentBuilder.button({
            children: 'Sign',
            onClick: `window.location.href='/sme/sign/${row.id}'`,
            variant: 'primary',
            size: 'sm',
          });
        }
        return ComponentBuilder.button({
          children: 'View',
          onClick: `window.location.href='/sme/history/${row.id}'`,
          variant: 'secondary',
          size: 'sm',
        });
      },
    },
  ];

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

async function renderSignatureQueue(user: SMEUser, _userId: number): Promise<string> {
  const db = getDb();

  const pendingRequests = (await db
    .query(`
    SELECT r.*, u.email as requestor_email
    FROM aft_requests r
    LEFT JOIN users u ON r.requestor_id = u.id
    WHERE r.status = 'pending_sme_signature'
    ORDER BY r.updated_at ASC
  `)
    .all()) as DbRow[];

  const content = `
    <div class="space-y-8">
      ${ComponentBuilder.sectionHeader({
        title: 'Signature Queue',
        description: 'Requests awaiting your Two-Person Integrity signature.',
      })}
      
      ${buildSignatureQueueTable(pendingRequests)}
    </div>
  `;

  return SMENavigation.renderLayout(
    'Signature Queue',
    'Pending Two-Person Integrity Signatures',
    user,
    '/sme/signatures',
    content,
  );
}

function buildSignatureQueueTable(requests: any[]): string {
  if (requests.length === 0) {
    return `<div class="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
              <div class="text-4xl mb-4">✅</div>
              <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No Pending Signatures</h3>
              <p class="text-[var(--muted-foreground)] mb-4">All requests have been processed.</p>
            </div>`;
  }

  const tableData = requests.map((request) => ({
    id: request.id,
    request_number: request.request_number,
    requestor_email: request.requestor_email,
    updated_at: request.updated_at,
    dta_signature: request.dta_signature,
  }));

  const columns = [
    {
      key: 'request_number',
      label: 'Request',
      render: (_value: unknown, row: DbRow) => `<div>
                                          <div class="font-medium text-[var(--foreground)] text-sm">${row.request_number}</div>
                                          <div class="text-xs text-[var(--muted-foreground)]">ID: ${row.id}</div>
                                        </div>`,
    },
    {
      key: 'requestor_email',
      label: 'Requestor',
      render: (_value: unknown, row: DbRow) =>
        `<div class="text-sm text-[var(--foreground)]">${row.requestor_email || 'Unknown'}</div>`,
    },
    {
      key: 'dta_signature',
      label: 'DTA Status',
      render: (_value: unknown, row: DbRow) => {
        return row.dta_signature
          ? ComponentBuilder.statusBadge('DTA SIGNED', 'success')
          : ComponentBuilder.statusBadge('PENDING DTA', 'warning');
      },
    },
    {
      key: 'updated_at',
      label: 'Last Updated',
      render: (_value: unknown, row: DbRow) =>
        `<div class="text-xs text-[var(--foreground)]">${new Date((row.updated_at as number) * 1000).toLocaleDateString()}</div>`,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_value: unknown, row: DbRow) => {
        return ComponentBuilder.button({
          children: 'Review & Sign',
          onClick: `window.location.href='/sme/sign/${row.id}'`,
          variant: 'primary',
          size: 'sm',
        });
      },
    },
  ];

  const table = ComponentBuilder.table({
    columns,
    rows: tableData,
    emptyMessage: 'No pending signatures',
    compact: true,
  });

  return ComponentBuilder.tableContainer({
    table,
    className: 'bg-[var(--card)] rounded-lg border border-[var(--border)]',
  });
}

function getScript(): string {
  return ``; // No scripts needed for this dashboard yet
}

export const SMEDashboard = {
  render,
  renderSignatureQueue,
  getScript,
};
