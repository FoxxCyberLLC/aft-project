// Approved Requests Page - Shows all requests that have been approved

import { CalendarIcon, CheckCircleIcon } from '../components/icons';
import { ComponentBuilder } from '../components/ui/server-components';
import { getDb, type DbRow } from '../lib/database-bun';
import { ApproverNavigation, type ApproverUser } from './approver-nav';

async function render(user: ApproverUser, _userId: number): Promise<string> {
  const db = getDb();

  // Get all requests approved by this approver (regardless of current status)
  const approvedRequests = (await db
    .query(`
    SELECT
      r.*,
      u.email as requestor_email,
      u.first_name || ' ' || u.last_name as requestor_name,
      a.email as approver_email,
      a.first_name || ' ' || a.last_name as approver_name
    FROM aft_requests r
    LEFT JOIN users u ON r.requestor_id = u.id
    LEFT JOIN users a ON r.approver_id = a.id
    WHERE r.approver_email = ? AND r.status NOT IN ('draft', 'submitted', 'pending_approver', 'rejected')
    ORDER BY r.updated_at DESC
  `)
    .all(user.email)) as Array<{
    id: number;
    request_number: string;
    requestor_name: string;
    requestor_email: string;
    source_system: string | null;
    destination_system: string | null;
    classification: string | null;
    updated_at: number;
    status: string;
  }>;

  // Calculate statistics
  const todayCount = approvedRequests.filter((r) => {
    const updatedDate = new Date((r.updated_at as number) * 1000);
    const today = new Date();
    return updatedDate.toDateString() === today.toDateString();
  }).length;

  const weekCount = approvedRequests.filter((r) => {
    const updatedDate = new Date((r.updated_at as number) * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return updatedDate >= weekAgo;
  }).length;

  const tableData = approvedRequests.map((request) => ({
    id: request.id,
    request_number: request.request_number,
    requestor_name: request.requestor_name,
    requestor_email: request.requestor_email,
    source_system: request.source_system,
    destination_system: request.destination_system,
    classification: request.classification,
    updated_at: request.updated_at,
    status: request.status,
  }));

  const columns = [
    { key: 'request_number', label: 'Request ID' },
    { key: 'requestor_name', label: 'Requestor' },
    {
      key: 'systems',
      label: 'Systems',
      render: (_value: unknown, row: DbRow) => `${row.source_system} → ${row.destination_system}`,
    },
    {
      key: 'updated_at',
      label: 'Approved Date',
      render: (_value: unknown, row: DbRow) => new Date((row.updated_at as number) * 1000).toLocaleDateString(),
    },
    {
      key: 'status',
      label: 'Current Status',
      render: (_value: unknown, row: DbRow) => {
        const statusLabels = {
          pending_cpso: 'Pending CPSO',
          pending_dta: 'Pending DTA',
          active_transfer: 'Active Transfer',
          pending_sme_signature: 'Pending SME',
          completed: 'Completed',
          cancelled: 'Cancelled',
          approved: 'Approved',
        };
        const statusVariants = {
          pending_cpso: 'warning',
          pending_dta: 'warning',
          active_transfer: 'info',
          pending_sme_signature: 'warning',
          completed: 'success',
          cancelled: 'error',
          approved: 'success',
        } as const;
        const label = statusLabels[row.status as keyof typeof statusLabels] || row.status;
        const variant = statusVariants[row.status as keyof typeof statusVariants] || 'default';
        return ComponentBuilder.statusBadge(label, variant);
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_value: unknown, row: DbRow) =>
        ComponentBuilder.tableCellActions([
          { label: 'View Details', onClick: `viewRequest(${row.id})`, variant: 'secondary' },
        ]),
    },
  ];

  const table = ComponentBuilder.table({
    columns,
    rows: tableData,
    emptyMessage: 'No approved requests found.',
  });

  const tableContainer = ComponentBuilder.tableContainer({
    title: 'Approved Requests',
    description: 'A log of all requests you have approved.',
    table,
  });

  const content = `
    <div class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-[var(--muted-foreground)]">Total Approved</p>
                <p class="text-2xl font-bold text-[var(--foreground)]">${approvedRequests.length}</p>
              </div>
              <div class="text-[var(--success)]">${CheckCircleIcon({ size: 32 })}</div>
            </div>
          </div>
          <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-[var(--muted-foreground)]">Today</p>
                <p class="text-2xl font-bold text-[var(--foreground)]">${todayCount}</p>
              </div>
              <div class="text-[var(--primary)]">${CalendarIcon({ size: 32 })}</div>
            </div>
          </div>
          <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-[var(--muted-foreground)]">This Week</p>
                <p class="text-2xl font-bold text-[var(--foreground)]">${weekCount}</p>
              </div>
              <div class="text-[var(--primary)]">${CalendarIcon({ size: 32 })}</div>
            </div>
          </div>
      </div>
      ${tableContainer}
    </div>
  `;

  return ApproverNavigation.renderLayout(
    'Approved Requests',
    'View all approved AFT requests',
    user,
    '/approver/approved',
    content,
  );
}

function getScript(): string {
  return `
    function viewRequest(requestId) {
      window.location.href = '/approver/review/' + requestId;
    }
  `;
}

export const ApprovedRequestsPage = {
  render,
  getScript,
};
