// Requestor Dashboard - Main requestor landing page
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { RequestorNavigation, type RequestorUser } from "./requestor-nav";
import { getDb, AFTStatus } from "../lib/database-bun";

export class RequestorDashboard {
  static async render(user: RequestorUser, userId: number): Promise<string> {
    const db = getDb();
    
    // Get requestor's statistics
    const myRequests = await db.query("SELECT COUNT(*) as count FROM aft_requests WHERE requestor_id = ?").get(userId) as any;
    const pendingRequests = await db.query(`
      SELECT COUNT(*) as count FROM aft_requests 
      WHERE requestor_id = ? AND status NOT IN ('completed', 'rejected', 'cancelled')
    `).get(userId) as any;
    const recentRequests = await db.query(`
      SELECT * FROM aft_requests 
      WHERE requestor_id = ?
      ORDER BY created_at DESC 
      LIMIT 5
    `).all(userId) as any[];

    // Build action cards
    const newRequestCard = Templates.adminCard({
      title: 'Submit New Request',
      description: 'Create a new Assured File Transfer request',
      primaryAction: { label: 'Start Request', onClick: 'window.location.href=\'/requestor/new-request\'' },
      status: { label: 'Ready', value: 'Available', status: 'operational' }
    });

    const myRequestsCard = Templates.adminCard({
      title: 'My Requests',
      description: 'View and manage your submitted requests',
      primaryAction: { label: 'View All', onClick: 'window.location.href=\'/requestor/requests\'' },
      secondaryAction: { label: 'Filter', onClick: 'filterMyRequests()' },
      status: { label: 'Total Requests', value: myRequests?.count?.toString() || '0', status: 'operational' }
    });

    // Build recent requests table
    const recentRequestsTable = this.buildRecentRequestsTable(recentRequests);

    // Build statistics card
    const statsCard = RequestorNavigation.renderQuickStats([
      { label: 'Total Requests', value: myRequests?.count || 0, status: 'operational' },
      { label: 'Pending Review', value: pendingRequests?.count || 0, status: pendingRequests?.count > 0 ? 'warning' : 'operational' },
      { label: 'This Month', value: this.getThisMonthCount(recentRequests), status: 'operational' },
      { label: 'Success Rate', value: this.getSuccessRate(myRequests?.count || 0, pendingRequests?.count || 0), status: 'operational' }
    ]);

    const content = `
      <div class="space-y-8">
        ${ComponentBuilder.sectionHeader({
          title: 'Request Management',
          description: 'Submit and track your Assured File Transfer requests'
        })}
        
        ${ComponentBuilder.grid({
          cols: 2,
          gap: 'lg',
          responsive: true,
          children: [newRequestCard, myRequestsCard].join('')
        })}
        
        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Your Statistics</h3>
          ${statsCard}
        </div>
        
        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Recent Requests</h3>
          ${recentRequestsTable}
        </div>
      </div>
    `;

    return RequestorNavigation.renderLayout(
      'Dashboard',
      'Assured File Transfer Request Portal',
      user,
      '/requestor',
      content
    );
  }

  private static buildRecentRequestsTable(requests: any[]): string {
    if (requests.length === 0) {
      return `
        <div class="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
          <div class="text-4xl mb-4">📋</div>
          <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No Requests Yet</h3>
          <p class="text-[var(--muted-foreground)] mb-4">You haven't submitted any AFT requests yet.</p>
          ${ComponentBuilder.primaryButton({
            children: 'Submit Your First Request',
            onClick: 'window.location.href=\'/requestor/new-request\'',
            size: 'md'
          })}
        </div>
      `;
    }

    // Transform requests data for table
    const tableData = requests.map(request => ({
      id: request.id,
      request_number: request.request_number,
      status: request.status,
      transfer_type: request.transfer_type || 'Unknown',
      created_at: request.created_at,
      updated_at: request.updated_at
    }));

    // Define table columns
    const columns = [
      {
        key: 'request_number',
        label: 'Request Number',
        render: (value: any, row: any) => `
          <div>
            <div class="font-medium text-[var(--foreground)]">${row.request_number}</div>
            <div class="text-sm text-[var(--muted-foreground)]">ID: ${row.id}</div>
          </div>
        `
      },
      {
        key: 'transfer_type',
        label: 'Type',
        render: (value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${row.transfer_type}</div>
        `
      },
      {
        key: 'status',
        label: 'Status',
        render: (value: any, row: any) => {
          const statusVariant = {
            'draft': 'default',
            'submitted': 'info',
            'pending_dao': 'warning',
            'pending_approver': 'warning',
            'pending_cpso': 'warning',
            'approved': 'success',
            'rejected': 'error',
            'completed': 'success',
            'cancelled': 'default'
          } as const;
          
          const variant = statusVariant[row.status as keyof typeof statusVariant] || 'default';
          
          return ComponentBuilder.statusBadge(
            row.status.replace('_', ' ').toUpperCase(), 
            variant
          );
        }
      },
      {
        key: 'created_at',
        label: 'Submitted',
        render: (value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${new Date(row.created_at * 1000).toLocaleDateString()}</div>
        `
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (value: any, row: any) => {
          const actions = [
            { label: 'View', onClick: `viewRequest(${row.id})`, variant: 'secondary' as const }
          ];

          // No editing allowed for any non-draft status

          return ComponentBuilder.tableCellActions(actions);
        }
      }
    ];

    // Create table
    const table = ComponentBuilder.table({
      columns,
      rows: tableData,
      emptyMessage: 'No recent requests found',
      compact: true
    });

    return ComponentBuilder.tableContainer({
      table,
      className: 'bg-[var(--card)] rounded-lg border border-[var(--border)]'
    });
  }

  private static getThisMonthCount(requests: any[]): number {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    return requests.filter(request => {
      const requestDate = new Date(request.created_at * 1000);
      return requestDate.getMonth() === thisMonth && requestDate.getFullYear() === thisYear;
    }).length;
  }

  private static getSuccessRate(total: number, pending: number): string {
    if (total === 0) return '0%';
    const completed = total - pending;
    const rate = Math.round((completed / total) * 100);
    return `${rate}%`;
  }

  static getScript(): string {
    return `
      function filterMyRequests() {
        window.location.href = '/requestor/requests?filter=all';
      }
      
      function viewPendingRequests() {
        window.location.href = '/requestor/requests?filter=pending';
      }
      
      function checkUpdates() {
        // Simulate checking for updates
        alert('Checking for request updates... No new updates at this time.');
      }
      
      function contactSupport() {
        alert('Support contact information:\\n\\nEmail: aft-support@domain.mil\\nPhone: (555) 123-4567\\n\\nSupport hours: Mon-Fri 8AM-5PM EST');
      }
      
      function viewRequest(requestId) {
        window.location.href = '/requestor/requests/' + requestId;
      }
      
      function editRequest(requestId) {
        window.location.href = '/requestor/requests/' + requestId + '/edit';
      }
    `;
  }
}