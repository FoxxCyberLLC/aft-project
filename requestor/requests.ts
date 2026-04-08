// Requestor Requests Management Page
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { RequestorNavigation, type RequestorUser } from "./requestor-nav";
import { getDb } from "../lib/database-bun";
import { AFT_STATUS_LABELS, AFTStatus } from "../lib/database-bun";
import { FileTextIcon, ClockIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, DownloadIcon, PlusIcon, ArrowRightIcon } from "../components/icons";

export class RequestorRequests {
  static async render(user: RequestorUser, viewMode: 'table' | 'timeline' = 'table', userId?: number): Promise<string> {
    const db = getDb();
    
    // Get user's requests
    const userRequests = await db.query(`
      SELECT r.*, u.email as approver_email
      FROM aft_requests r
      LEFT JOIN users u ON r.approver_id = u.id
      WHERE r.requestor_id = ?
      ORDER BY r.created_at DESC
    `).all(userId || 0) as any[];

    const tableData = userRequests.map((request: any) => ({
      id: request.id,
      request_number: request.request_number,
      status: request.status,
      transfer_type: request.transfer_type || 'Unknown',
      classification: request.classification || 'Unknown',
      created_at: request.created_at,
      source_system: request.source_system,
      dest_system: request.dest_system,
    }));

    const columns = [
        {
            key: 'request_number',
            label: 'Request #',
            render: (value: any, row: any) => `<div><div class="font-medium text-[var(--foreground)]">${row.request_number}</div><div class="text-sm text-[var(--muted-foreground)]">ID: ${row.id}</div></div>`
        },
        {
            key: 'systems',
            label: 'Systems',
            render: (value: any, row: any) => `
              <div>
                <p class="font-medium flex items-center gap-1">
                  <span>${row.source_system || 'N/A'}</span>
                  <span class="inline-block align-middle">${ArrowRightIcon({ size: 16 })}</span>
                  <span>${row.dest_system || 'N/A'}</span>
                </p>
              </div>
            `
        },
        {
            key: 'transfer_type',
            label: 'Type',
            render: (value: any, row: any) => `<div class="text-sm">${row.transfer_type}</div>`
        },
        {
            key: 'status',
            label: 'Status',
            render: (value: any, row: any) => ComponentBuilder.statusBadge(AFT_STATUS_LABELS[row.status as keyof typeof AFT_STATUS_LABELS] || row.status, this.getStatusVariant(row.status))
        },
        {
            key: 'created_at',
            label: 'Created',
            render: (value: any, row: any) => `<div class="text-sm">${new Date(row.created_at * 1000).toLocaleDateString()}</div>`
        },
        {
            key: 'actions',
            label: 'Actions',
            render: (value: any, row: any) => {
                const actions: { label: string; onClick: string; variant?: 'primary' | 'secondary' | 'destructive' }[] = [
                    { label: 'View', onClick: `viewRequest(${row.id})`, variant: 'secondary' }
                ];
                if (row.status === 'draft') {
                    actions.push({ label: 'Edit', onClick: `editRequest(${row.id})`, variant: 'primary' });
                }
                return ComponentBuilder.tableCellActions(actions);
            }
        }
    ];

    const table = ComponentBuilder.table({ columns, rows: tableData, emptyMessage: 'No requests found.' });

    const tableContainer = ComponentBuilder.tableContainer({
        title: 'My Requests',
        description: 'All your AFT requests are listed here. You can track their status and manage them.',
        table
    });

    const content = `
      <div class="space-y-6">
        ${tableContainer}
      </div>
    `;

    return RequestorNavigation.renderLayout(
      'My Requests',
      'View and manage your AFT requests',
      user,
      '/requestor/requests',
      content
    );
  }












  private static getStatusVariant(status: string): 'default' | 'info' | 'success' | 'error' | 'warning' {
    const variants: { [key: string]: 'default' | 'info' | 'success' | 'error' | 'warning' } = {
        draft: 'default',
        submitted: 'info',
        pending_dao: 'warning',
        pending_approver: 'warning',
        pending_cpso: 'warning',
        approved: 'success',
        rejected: 'error',
        completed: 'success',
        cancelled: 'default'
    };
    return variants[status] || 'default';
  }


  static getScript(): string {
    return `
      function viewRequest(id) {
        window.location.href = '/requestor/requests/' + id;
      }

      function editRequest(id) {
        window.location.href = '/requestor/requests/' + id + '/edit';
      }
    `;
  }
}