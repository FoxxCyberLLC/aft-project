// Admin Requests Management Interface
import { ComponentBuilder } from '../components/ui/server-components';
import { AFT_STATUS_LABELS, getDb, type DbRow } from '../lib/database-bun';
import { RequestTrackingService } from '../lib/request-tracking';
import { AdminNavigation, type AdminUser } from './admin-nav';

async function renderRequestsPage(
  user: AdminUser,
  viewMode: 'table' | 'timeline' = 'table',
): Promise<string> {
  const db = getDb();

  // Get request statistics
  const totalRequests = (await db.query('SELECT COUNT(*) as count FROM aft_requests').get()) as DbRow;
  const pendingRequests = (await db
    .query(
      "SELECT COUNT(*) as count FROM aft_requests WHERE status NOT IN ('completed', 'rejected', 'cancelled')",
    )
    .get()) as DbRow;

  // Get requests with timeline data
  const requestsWithTimeline = await RequestTrackingService.getRequestsWithTimeline({
    limit: 50,
  });

  // Transform requests data for table
  const tableData = requestsWithTimeline.map((request) => ({
    id: request.id as string | number,
    request_number: request.request_number,
    requestor_name: request.requestor_name,
    status: request.status,
    transfer_type: request.transfer_type || 'Unknown',
    classification: request.classification || 'Unknown',
    created_at: request.created_at,
    timeline_progress: request.timeline_progress,
    current_step: request.current_step,
    total_steps: request.total_steps,
    is_terminal: request.is_terminal,
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
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">${row.requestor_name}</div>
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
      key: 'classification',
      label: 'Classification',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-xs px-2 py-1 rounded-full bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20 font-medium text-center">
          ${row.classification}
        </div>
      `,
    },
    {
      key: 'status',
      label: 'Status & Progress',
      render: (_value: unknown, row: DbRow) => {
        const statusVariant: {
          [key: string]: 'default' | 'info' | 'success' | 'error' | 'warning';
        } = {
          draft: 'default',
          submitted: 'info',
          pending_dao: 'warning',
          pending_approver: 'warning',
          pending_cpso: 'warning',
          approved: 'success',
          rejected: 'error',
          pending_dta: 'info',
          active_transfer: 'info',
          pending_sme_signature: 'warning',
          pending_sme: 'warning',
          pending_media_custodian: 'warning',
          completed: 'success',
          disposed: 'success',
          cancelled: 'default',
        };

        const variant = statusVariant[row.status as string] || 'default';
        const _statusLabel =
          AFT_STATUS_LABELS[row.status as keyof typeof AFT_STATUS_LABELS] || row.status;

        return `
          <div class="space-y-2">
            ${ComponentBuilder.timelineStatusBadge(row.status as string, variant, true, {
              current: Number(row.current_step),
              total: Number(row.total_steps),
            })}
            <div class="w-full bg-[var(--muted)] rounded-full h-1.5">
              <div class="bg-[var(--primary)] h-1.5 rounded-full transition-all duration-300" 
                   style="width: ${row.timeline_progress}%"></div>
            </div>
            <div class="text-xs text-[var(--muted-foreground)] font-mono">
              ${row.timeline_progress}% Complete
            </div>
          </div>
        `;
      },
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">${new Date((row.created_at as number) * 1000).toLocaleDateString()}</div>
      `,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_value: unknown, row: DbRow) => {
        const actions: {
          label: string;
          onClick: string;
          variant: 'secondary' | 'destructive';
        }[] = [
          { label: 'View', onClick: `viewRequest(${row.id})`, variant: 'secondary' },
          { label: 'Timeline', onClick: `viewTimeline(${row.id})`, variant: 'secondary' },
          { label: 'Edit', onClick: `editRequest(${row.id})`, variant: 'secondary' },
        ];

        if (row.status !== 'completed') {
          actions.push({
            label: 'Delete',
            onClick: `deleteRequest(${row.id})`,
            variant: 'destructive',
          });
        }

        return ComponentBuilder.tableCellActions(actions);
      },
    },
  ];

  // Create table
  const table = ComponentBuilder.table({
    columns,
    rows: tableData,
    emptyMessage: 'No AFT requests found',
  });

  // Create search component
  const search = ComponentBuilder.tableSearch({
    placeholder: 'Search requests...',
    onSearch: 'filterRequests',
  });

  // Create filters
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
          { value: 'cancelled', label: 'Cancelled' },
        ],
        onChange: 'filterByStatus',
      },
      {
        key: 'type',
        label: 'All Types',
        options: [
          { value: 'high-to-low', label: 'High to Low' },
          { value: 'low-to-high', label: 'Low to High' },
          { value: 'peer-to-peer', label: 'Peer to Peer' },
        ],
        onChange: 'filterByType',
      },
    ],
  });

  // Create table actions with view toggle
  const viewToggle = ComponentBuilder.viewToggle(viewMode);
  const actions = ComponentBuilder.tableActions({
    primary: {
      label: '+ New Request',
      onClick: 'createRequest()',
    },
    secondary: [
      { label: 'Export All', onClick: 'exportRequests()' },
      { label: 'Import', onClick: 'importRequests()' },
    ],
  });

  // Create timeline view content
  const timelineContent = viewMode === 'timeline' ? await renderTimelineView(tableData) : '';

  // Create table container with view toggle
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
    table: viewMode === 'table' ? table : timelineContent,
  });

  const content = `
    <div class="space-y-6">
      <!-- Stats Cards -->
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
          <div class="text-2xl font-bold text-[var(--success)]">${Math.round(((Number(totalRequests?.count || 1) - Number(pendingRequests?.count || 0)) / Number(totalRequests?.count || 1)) * 100)}%</div>
          <div class="text-sm text-[var(--muted-foreground)]">Completion Rate</div>
        </div>
        <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
          <div class="text-2xl font-bold text-[var(--info)]">${tableData.filter((r) => r.created_at > (Date.now() - 86400000) / 1000).length}</div>
          <div class="text-sm text-[var(--muted-foreground)]">Today's Requests</div>
        </div>
      </div>

      ${tableContainer}
    </div>
  `;

  return AdminNavigation.renderLayout(
    'Request Management',
    'Manage AFT requests and approvals',
    user,
    '/admin/requests',
    content,
  );
}

// Render timeline view for requests
async function renderTimelineView(tableData: DbRow[]): Promise<string> {
  const timelines = await Promise.all(
    tableData.map((r) => RequestTrackingService.getRequestTimeline(Number(r.id))),
  );
  return `
    <div class="space-y-6">
      ${tableData
        .map((request, i) => {
          const timelineData = timelines[i];
          if (!timelineData) return '';

          const timeline = ComponentBuilder.timeline({
            steps: timelineData.timeline_steps,
            orientation: 'vertical',
            showTimestamps: true,
            showDuration: true,
            compact: false,
          });

          return `
          <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 hover:shadow-md transition-shadow">
            <div class="flex items-start justify-between mb-4">
              <div>
                <h3 class="text-lg font-semibold text-[var(--foreground)]">${request.request_number}</h3>
                <p class="text-sm text-[var(--muted-foreground)]">Requestor: ${request.requestor_name}</p>
                <p class="text-xs text-[var(--muted-foreground)]">Type: ${request.transfer_type} | Classification: ${request.classification}</p>
              </div>
              <div class="flex items-center gap-2">
                ${ComponentBuilder.timelineStatusBadge(
                  request.status as string,
                  request.is_terminal ? 'success' : 'info',
                  true,
                  { current: Number(request.current_step), total: Number(request.total_steps) },
                )}
                <div class="flex gap-1">
                  <button onclick="viewRequest(${request.id})" class="action-btn secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">View</button>
                  <button onclick="editRequest(${request.id})" class="action-btn secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Edit</button>
                </div>
              </div>
            </div>
            
            <div class="mb-4">
              ${ComponentBuilder.statusProgress({
                currentStatus: request.status as string,
                allStatuses: timelineData.timeline_steps.map((step) => step.id),
                statusLabels: AFT_STATUS_LABELS,
              })}
            </div>
            
            <div class="border-t border-[var(--border)] pt-4">
              ${timeline}
            </div>
          </div>
        `;
        })
        .filter(Boolean)
        .join('')}
    </div>
  `;
}

function getScript(): string {
  return `
    let currentView = 'table';
    
    function createRequest() {
      // Navigate to request creation page (to be implemented)
      alert('Request creation form not yet implemented. This would navigate to /requests/new');
    }
    
    function viewRequest(requestId) {
      // Navigate to request details page (to be implemented)
      alert('Request details view not yet implemented. This would show details for request ID: ' + requestId);
    }
    
    function viewTimeline(requestId) {
      // Get timeline data for the specific request
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
      // Create modal backdrop
      const modalBackdrop = document.createElement('div');
      modalBackdrop.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modalBackdrop.onclick = (e) => {
        if (e.target === modalBackdrop) {
          document.body.removeChild(modalBackdrop);
        }
      };
      
      // Create modal content
      const modalContent = document.createElement('div');
      modalContent.className = 'bg-[var(--background)] rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden';
      
      // Generate timeline HTML using existing components
      const timelineHtml = \`
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-2xl font-bold text-[var(--foreground)]">Request Timeline</h2>
              <p class="text-[var(--muted-foreground)]">Request #\${request.request_number}</p>
            </div>
            <button onclick="closest('.fixed').remove()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-2xl font-bold">&times;</button>
          </div>
          
          <div class="mb-6 p-4 bg-[var(--muted)] rounded-lg">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span class="font-medium text-[var(--muted-foreground)]">Requestor:</span>
                <div class="text-[var(--foreground)]">\${request.requestor_name}</div>
              </div>
              <div>
                <span class="font-medium text-[var(--muted-foreground)]">Status:</span>
                <div class="text-[var(--foreground)]">\${String(request.status).replace('_', ' ').toUpperCase()}</div>
              </div>
              <div>
                <span class="font-medium text-[var(--muted-foreground)]">Transfer Type:</span>
                <div class="text-[var(--foreground)]">\${request.transfer_type || 'Unknown'}</div>
              </div>
              <div>
                <span class="font-medium text-[var(--muted-foreground)]">Created:</span>
                <div class="text-[var(--foreground)]">\${new Date((request.created_at as number) * 1000).toLocaleDateString()}</div>
              </div>
            </div>
          </div>
          
          <div class="max-h-[60vh] overflow-y-auto">
            <div class="space-y-4">
              \${timelineData.timeline_steps.map((step, index) => \`
                <div class="flex items-start space-x-4 pb-4 \${index < timelineData.timeline_steps.length - 1 ? 'border-b border-[var(--border)]' : ''}">
                  <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium \${getStepStatusClasses(step.status)}">
                    \${getStepStatusIcon(step.status)}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                      <h4 class="text-sm font-medium text-[var(--foreground)]">\${step.title}</h4>
                      \${step.timestamp ? \`<time class="text-xs text-[var(--muted-foreground)]">\${formatTimestamp(step.timestamp)}</time>\` : ''}
                    </div>
                    \${step.description ? \`<p class="text-sm text-[var(--muted-foreground)] mt-1">\${step.description}</p>\` : ''}
                    \${step.assignedTo ? \`<p class="text-xs text-[var(--muted-foreground)] mt-1">Assigned to: \${step.assignedTo}</p>\` : ''}
                    \${step.notes ? \`<p class="text-xs text-[var(--muted-foreground)] mt-2 p-2 bg-[var(--muted)] rounded">\${step.notes}</p>\` : ''}
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
    
    function getStepStatusClasses(status) {
      const classes = {
        'completed': 'bg-[var(--success)] text-white',
        'current': 'bg-[var(--primary)] text-white',
        'pending': 'bg-[var(--muted)] text-[var(--muted-foreground)]',
        'skipped': 'bg-[var(--warning)] text-white',
        'error': 'bg-[var(--destructive)] text-white'
      };
      return classes[status] || classes.pending;
    }
    
    function getStepStatusIcon(status) {
      const icons = {
        'completed': '✓',
        'current': '●',
        'pending': '○',
        'skipped': '⊘',
        'error': '✗'
      };
      return icons[status] || icons.pending;
    }
    
    function formatTimestamp(timestamp) {
      const date = new Date(timestamp * 1000);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (diffDays === 1) {
        return 'Yesterday at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (diffDays < 7) {
        return \`\${diffDays} days ago\`;
      } else {
        return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }
    
    function editRequest(requestId) {
      // Navigate to request edit page (to be implemented)
      alert('Request editing not yet implemented. This would edit request ID: ' + requestId);
    }
    
    function deleteRequest(requestId) {
      if (confirm('Are you sure you want to permanently delete this request? This action cannot be undone.')) {
        fetch('/api/admin/requests/' + requestId, { method: 'DELETE' })
          .then(response => response.json())
          .then(result => {
            alert(result.message);
            if (result.success) {
              window.location.reload();
            }
          })
          .catch(error => {
            console.error('Failed to delete request:', error);
            alert('An unexpected error occurred while deleting the request.');
          });
      }
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

export const AdminRequests = {
  renderRequestsPage,
  getScript,
};
