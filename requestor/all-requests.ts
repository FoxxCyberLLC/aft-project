// Requestor All Requests Page (shows all users' requests) - matches Admin Requests format
import { ComponentBuilder } from "../components/ui/server-components";
import { RequestorNavigation, type RequestorUser } from "./requestor-nav";
import { getDb } from "../lib/database-bun";
import { RequestTrackingService } from "../lib/request-tracking";
import { CheckIcon } from "../components/icons";
import { AFT_STATUS_LABELS } from "../lib/database-bun";

export class RequestorAllRequests {
  static async render(user: RequestorUser, viewMode: 'table' | 'timeline' = 'table'): Promise<string> {
    const db = getDb();

    // Stats (optional but matches format)
    const totalRequests = await db.query("SELECT COUNT(*) as count FROM aft_requests").get() as any;
    const pendingRequests = await db.query("SELECT COUNT(*) as count FROM aft_requests WHERE status NOT IN ('completed', 'rejected', 'cancelled')").get() as any;

    // Get requests with timeline data (same helper used by admin page)
    const requestsWithTimeline = RequestTrackingService.getRequestsWithTimeline({ limit: 50 });

    const tableData = requestsWithTimeline.map((request: any) => ({
      id: request.id,
      request_number: request.request_number,
      requestor_name: request.requestor_name,
      status: request.status,
      transfer_type: request.transfer_type || 'Unknown',
      classification: request.classification || 'Unknown',
      created_at: request.created_at,
      timeline_progress: request.timeline_progress,
      current_step: request.current_step,
      total_steps: request.total_steps,
      is_terminal: request.is_terminal
    }));

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
        key: 'requestor_name',
        label: 'Requestor',
        render: (value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${row.requestor_name}</div>
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
        key: 'classification',
        label: 'Classification',
        render: (value: any, row: any) => `
          <div class="text-xs px-2 py-1 rounded-full bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20 font-medium text-center">
            ${row.classification}
          </div>
        `
      },
      {
        key: 'status',
        label: 'Status & Progress',
        render: (value: any, row: any) => {
          const statusVariant: { [key: string]: 'default' | 'info' | 'success' | 'error' | 'warning' } = {
            'draft': 'default',
            'submitted': 'info',
            'pending_dao': 'warning',
            'pending_approver': 'warning',
            'pending_cpso': 'warning',
            'approved': 'success',
            'rejected': 'error',
            'pending_dta': 'info',
            'active_transfer': 'info',
            'pending_sme_signature': 'warning',
            'pending_sme': 'warning',
            'pending_media_custodian': 'warning',
            'completed': 'success',
            'disposed': 'success',
            'cancelled': 'default'
          };
          const variant = statusVariant[row.status] || 'default';
          return `
            <div class="space-y-2">
              ${ComponentBuilder.timelineStatusBadge(
                row.status,
                variant,
                true,
                { current: row.current_step, total: row.total_steps }
              )}
              <div class="w-full bg-[var(--muted)] rounded-full h-1.5">
                <div class="bg-[var(--primary)] h-1.5 rounded-full transition-all duration-300" style="width: ${row.timeline_progress}%"></div>
              </div>
              <div class="text-xs text-[var(--muted-foreground)] font-mono">
                ${row.timeline_progress}% Complete
              </div>
            </div>
          `;
        }
      },
      {
        key: 'created_at',
        label: 'Created',
        render: (value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${new Date(row.created_at * 1000).toLocaleDateString()}</div>
        `
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (value: any, row: any) => ComponentBuilder.tableCellActions([
          { label: 'View', onClick: `viewRequest(${row.id})`, variant: 'secondary' },
          { label: 'Timeline', onClick: `viewTimeline(${row.id})`, variant: 'secondary' }
        ])
      }
    ];

    const table = ComponentBuilder.table({
      columns,
      rows: tableData,
      emptyMessage: 'No AFT requests found'
    });

    const search = ComponentBuilder.tableSearch({
      placeholder: 'Search requests...',
      onSearch: 'filterRequests'
    });

    const filters = ComponentBuilder.tableFilters({
      filters: [
        {
          key: 'status',
          label: 'All Status',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'submitted', label: 'Submitted' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' }
          ],
          onChange: 'filterByStatus'
        },
        {
          key: 'type',
          label: 'All Types',
          options: [
            { value: 'high-to-low', label: 'High to Low' },
            { value: 'low-to-high', label: 'Low to High' },
            { value: 'peer-to-peer', label: 'Peer to Peer' }
          ],
          onChange: 'filterByType'
        }
      ]
    });

    const viewToggle = ComponentBuilder.viewToggle(viewMode);
    const actions = ComponentBuilder.tableActions({
      primary: {
        label: '+ New Request',
        onClick: 'createRequest()'
      },
      secondary: [
        { label: 'Export All', onClick: 'exportRequests()' },
        { label: 'Import', onClick: 'importRequests()' }
      ]
    });

    const timelineContent = viewMode === 'timeline' ? this.renderTimelineView(tableData) : '';

    const tableContainer = ComponentBuilder.tableContainer({
      title: 'AFT Requests',
      description: 'Manage and track all Assured File Transfer requests with live status timeline',
      search,
      filters,
      actions: `
        <div class="flex items-center justify-between">
          <div class="flex gap-2">
            ${actions}
          </div>
          ${viewToggle}
        </div>
      `,
      table: viewMode === 'table' ? table : timelineContent
    });

    const content = `
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
            <div class="text-2xl font-bold text-[var(--primary)]">${totalRequests?.count || 0}</div>
            <div class="text-sm text-[var(--muted-foreground)]">Total Requests</div>
          </div>
          <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
            <div class="text-2xl font-bold text-[var(--warning)]">${pendingRequests?.count || 0}</div>
            <div class="text-sm text-[var(--muted-foreground)]">Pending Review</div>
          </div>
          <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
            <div class="text-2xl font-bold text-[var(--success)]">${Math.round(((totalRequests?.count || 1) - (pendingRequests?.count || 0)) / (totalRequests?.count || 1) * 100)}%</div>
            <div class="text-sm text-[var(--muted-foreground)]">Completion Rate</div>
          </div>
          <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
            <div class="text-2xl font-bold text-[var(--info)]">${tableData.filter((r: any) => r.created_at > (Date.now() - 86400000) / 1000).length}</div>
            <div class="text-sm text-[var(--muted-foreground)]">Today's Requests</div>
          </div>
        </div>

        ${tableContainer}
      </div>
    `;

    return RequestorNavigation.renderLayout(
      'All Requests',
      'View all AFT requests across users',
      user,
      '/requestor/all-requests',
      content
    );
  }

  private static renderTimelineView(tableData: any[]): string {
    return `
      <div class="space-y-4">
        ${tableData.map(request => {
          const timelineData = RequestTrackingService.getRequestTimeline(request.id);
          if (!timelineData) return '';

          return `
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md transition-shadow">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-4">
                  <div>
                    <h3 class="text-base font-semibold text-[var(--foreground)]">${request.request_number}</h3>
                    <p class="text-xs text-[var(--muted-foreground)]">${request.requestor_name} • ${request.transfer_type} • ${request.classification}</p>
                  </div>
                  ${ComponentBuilder.timelineStatusBadge(
                    request.status,
                    request.is_terminal ? 'success' : 'info',
                    true,
                    { current: request.current_step, total: request.total_steps }
                  )}
                </div>
                <div class="flex gap-1">
                  <button onclick="viewRequest(${request.id})" class="action-btn secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">View</button>
                </div>
              </div>

              ${ComponentBuilder.statusProgress({
                currentStatus: request.status,
                allStatuses: timelineData.timeline_steps.map((step: any) => step.id),
                statusLabels: AFT_STATUS_LABELS
              })}
            </div>
          `;
        }).filter(Boolean).join('')}
      </div>
    `;
  }

  static getScript(): string {
    return `
      const ICON_COMPLETED = \`${CheckIcon({ size: 12 }).replace(/`/g, '\\`')}\`;
      const ICON_CURRENT = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="6" cy="6" r="4"/></svg>';
      const ICON_PENDING = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="4"/></svg>';

      let currentView = 'table';
      
      function createRequest() {
        window.location.href = '/requestor/new-request';
      }
      
      function viewRequest(requestId) {
        alert('Request details view not available from All Requests for Requestors. ID: ' + requestId);
      }
      
      function viewTimeline(requestId) {
        fetch(\`/api/requests/\${requestId}/timeline\`)
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              showTimelineModal(data.request, data.timeline);
            } else {
              alert('Failed to load timeline data: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error fetching timeline:', error);
            alert('Failed to load timeline data. Please try again.');
          });
      }
      
      function showTimelineModal(request, timelineData) {
        const modalBackdrop = document.createElement('div');
        modalBackdrop.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modalBackdrop.onclick = (e) => {
          if (e.target === modalBackdrop) {
            document.body.removeChild(modalBackdrop);
          }
        };
        
        const modalContent = document.createElement('div');
        modalContent.className = 'bg-[var(--background)] rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden';
        
        const timelineHtml = \`
          <div class="p-6">
            <div class="flex items-center justify-between mb-6">
              <div>
                <h2 class="text-2xl font-bold text-[var(--foreground)]">Request Timeline</h2>
                <p class="text-[var(--muted-foreground)]">Request #\${request.request_number}</p>
              </div>
              <button onclick="this.closest('.fixed').remove()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-2xl font-bold">&times;</button>
            </div>
            
            <div class="mb-6 p-4 bg-[var(--muted)] rounded-lg">
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span class="font-medium text-[var(--muted-foreground)]">Requestor:</span>
                  <div class="text-[var(--foreground)]">\${request.requestor_name}</div>
                </div>
                <div>
                  <span class="font-medium text-[var(--muted-foreground)]">Status:</span>
                  <div class="text-[var(--foreground)]">\${request.status.replace('_', ' ').toUpperCase()}</div>
                </div>
                <div>
                  <span class="font-medium text-[var(--muted-foreground)]">Transfer Type:</span>
                  <div class="text-[var(--foreground)]">\${request.transfer_type || 'Unknown'}</div>
                </div>
                <div>
                  <span class="font-medium text-[var(--muted-foreground)]">Created:</span>
                  <div class="text-[var(--foreground)]">\${new Date(request.created_at * 1000).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
            
            <div class="max-h-[60vh] overflow-y-auto">
              <div class="space-y-4">
                \${timelineData.timeline_steps.map((step, index) => \`
                  <div class="flex items-start space-x-4 pb-4 \${index < timelineData.timeline_steps.length - 1 ? 'border-b border-[var(--border)]' : ''}">\n
                    <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium \${
                      step.status === 'completed' ? 'bg-[var(--success)] text-white' :
                      step.status === 'current' ? 'bg-[var(--primary)] text-white' :
                      'bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }">\n
                      \${step.status === 'completed' ? ICON_COMPLETED : step.status === 'current' ? ICON_CURRENT : ICON_PENDING}
                    </div>
                    <div class="flex-1 min-w-0">\n
                      <div class=\"flex items-center justify-between\">\n
                        <h4 class=\"text-sm font-medium text-[var(--foreground)]\">\${step.title}</h4>
                        \${step.timestamp ? \`<time class=\\\"text-xs text-[var(--muted-foreground)]\\\">\${new Date(step.timestamp * 1000).toLocaleString()}</time>\` : ''}
                      </div>
                      \${step.description ? \`<p class=\\\"text-sm text-[var(--muted-foreground)] mt-1\\\">\${step.description}</p>\` : ''}
                      \${step.assignedTo ? \`<p class=\\\"text-xs text-[var(--muted-foreground)] mt-1\\\">Assigned to: \${step.assignedTo}</p>\` : ''}
                      \${step.notes ? \`<p class=\\\"text-xs text-[var(--muted-foreground)] mt-2 p-2 bg-[var(--muted)] rounded\\\">\${step.notes}</p>\` : ''}
                    </div>
                  </div>
                \`).join('')}
              </div>
            </div>
          </div>
        \`;
        
        modalContent.innerHTML = timelineHtml;
        modalBackdrop.appendChild(modalContent);
        document.body.appendChild(modalBackdrop);
      }
      
      function switchView(viewType) {
        if (currentView === viewType) return;
        
        currentView = viewType;
        const url = new URL(window.location);
        url.searchParams.set('view', viewType);
        window.location.href = url.toString();
      }
      
      function exportRequests() {
        alert('Export functionality not yet implemented.');
      }
      
      function importRequests() {
        alert('Import functionality not yet implemented.');
      }
      
      function filterRequests(searchTerm) {
        const rows = document.querySelectorAll('tbody tr');
        const term = searchTerm.toLowerCase();
        
        rows.forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(term) ? '' : 'none';
        });
      }
      
      function filterByStatus(status) {
        const rows = document.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
          if (!status) {
            row.style.display = '';
          } else {
            const statusCell = row.querySelector('td:nth-child(5)');
            if (statusCell) {
              const statusText = statusCell.textContent.toLowerCase();
              row.style.display = statusText.includes(status.toLowerCase()) ? '' : 'none';
            }
          }
        });
      }
      
      function filterByType(type) {
        const rows = document.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
          if (!type) {
            row.style.display = '';
          } else {
            const typeCell = row.querySelector('td:nth-child(3)');
            if (typeCell) {
              const typeText = typeCell.textContent.toLowerCase();
              row.style.display = typeText.includes(type.toLowerCase()) ? '' : 'none';
            }
          }
        });
      }
    `;
  }
}
