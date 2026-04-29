// Pending Approvals Page - Shows all requests awaiting approval

import { AlertCircleIcon } from '../components/icons';
import { ComponentBuilder } from '../components/ui/server-components';
import { getDb, type DbRow } from '../lib/database-bun';
import { ApproverNavigation, type ApproverUser } from './approver-nav';

async function render(user: ApproverUser, _userId: number): Promise<string> {
  const db = getDb();

  // Get requests pending approval by ISSM (approver role)
  const pendingRequests = (await db
    .query(`
    SELECT 
      r.*,
      u.email as requestor_email,
      u.first_name || ' ' || u.last_name as requestor_name
    FROM aft_requests r
    LEFT JOIN users u ON r.requestor_id = u.id
    WHERE r.status IN ('pending_approver', 'pending_approval', 'submitted')
    ORDER BY r.created_at DESC
  `)
    .all()) as DbRow[];

  // Transform requests data for table
  const tableData = pendingRequests.map((request: any) => ({
    id: request.id,
    request_number: request.request_number,
    requestor_name: request.requestor_name,
    transfer_type: request.transfer_type || 'Unknown',
    classification: request.classification || 'Unknown',
    created_at: request.created_at,
    priority: request.priority || 'normal',
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
      key: 'requestor_name',
      label: 'Requestor',
      render: (_value: unknown, row: DbRow) =>
        `<div class="text-sm text-[var(--foreground)]">${row.requestor_name}</div>`,
    },
    {
      key: 'transfer_type',
      label: 'Type',
      render: (_value: unknown, row: DbRow) =>
        `<div class="text-sm text-[var(--foreground)]">${row.transfer_type}</div>`,
    },
    {
      key: 'classification',
      label: 'Classification',
      render: (_value: unknown, row: DbRow) =>
        `<div class="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 font-medium text-center">${row.classification}</div>`,
    },
    {
      key: 'created_at',
      label: 'Submitted',
      render: (_value: unknown, row: DbRow) =>
        `<div class="text-sm text-[var(--foreground)]">${new Date((row.created_at as number) * 1000).toLocaleDateString()}</div>`,
    },
    {
      key: 'priority',
      label: 'Priority',
      render: (_value: unknown, row: DbRow) => {
        const isUrgent = row.priority === 'urgent';
        return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isUrgent ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'} ">
          ${isUrgent ? AlertCircleIcon({ size: 14 }) : ''}
          ${row.priority.toUpperCase()}
        </span>`;
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_value: unknown, row: DbRow) =>
        ComponentBuilder.tableCellActions([
          { label: 'Review', onClick: `reviewRequest(${row.id})`, variant: 'primary' },
          { label: 'View Details', onClick: `viewRequest(${row.id})`, variant: 'secondary' },
        ]),
    },
  ];

  const table = ComponentBuilder.table({
    columns,
    rows: tableData,
    emptyMessage: 'No pending requests found.',
  });

  const tableContainer = ComponentBuilder.tableContainer({
    title: 'Pending Approvals',
    description: 'Review and process AFT requests that require your approval.',
    table,
  });

  const content = `
    <div class="space-y-6">
      ${tableContainer}
    </div>
  `;

  return ApproverNavigation.renderLayout(
    'Pending Approvals',
    'Review and approve AFT requests',
    user,
    '/approver/pending',
    content,
  );
}

function getScript(): string {
  return `
    function reviewRequest(requestId) {
      window.location.href = '/approver/review/' + requestId;
    }
    
    function viewRequest(requestId) {
      // This could open a modal with more details, for now, it's same as review
      window.location.href = '/approver/review/' + requestId;
    }
  `;
}

export const PendingApprovalsPage = {
  render,
  getScript,
};
