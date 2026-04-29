// Admin Requests Management Interface
import { ComponentBuilder } from '../components/ui/server-components';
import { AFT_STATUS_LABELS, getDb } from '../lib/database-bun';
import { RequestTrackingService } from '../lib/request-tracking';
import { DTANavigation, type DTAUser } from './dta-nav';

async function renderRequestsPage(
  user: DTAUser,
  viewMode: 'table' | 'timeline' = 'table',
  userId: number,
): Promise<string> {
  const db = getDb();

  // Get request statistics for assigned DTA
  const totalRequests = (await db
    .query('SELECT COUNT(*) as count FROM aft_requests WHERE dta_id = ?')
    .get(userId)) as any;
  const pendingRequests = (await db
    .query(
      "SELECT COUNT(*) as count FROM aft_requests WHERE status NOT IN ('completed', 'rejected', 'cancelled') AND dta_id = ?",
    )
    .get(userId)) as any;

  // Get requests with timeline data - filtered by DTA assignment
  const requestsWithTimeline = await RequestTrackingService.getRequestsWithTimeline({
    limit: 50,
    dta_id: userId,
  });

  // Transform requests data for table
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
    is_terminal: request.is_terminal,
  }));

  // Define table columns
  const columns = [
    {
      key: 'request_number',
      label: 'Request Number',
      render: (_value: any, row: any) => `
        <div>
          <div class="font-medium text-[var(--foreground)]">${row.request_number}</div>
          <div class="text-sm text-[var(--muted-foreground)]">ID: ${row.id}</div>
        </div>
      `,
    },
    {
      key: 'requestor_name',
      label: 'Requestor',
      render: (_value: any, row: any) => `
        <div class="text-sm text-[var(--foreground)]">${row.requestor_name}</div>
      `,
    },
    {
      key: 'transfer_type',
      label: 'Type',
      render: (_value: any, row: any) => `
        <div class="text-sm text-[var(--foreground)]">${row.transfer_type}</div>
      `,
    },
    {
      key: 'classification',
      label: 'Classification',
      render: (_value: any, row: any) => `
        <div class="text-xs px-2 py-1 rounded-full bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20 font-medium text-center">
          ${row.classification}
        </div>
      `,
    },
    {
      key: 'status',
      label: 'Status & Progress',
      render: (_value: any, row: any) => {
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

        const variant = statusVariant[row.status] || 'default';
        const _statusLabel =
          AFT_STATUS_LABELS[row.status as keyof typeof AFT_STATUS_LABELS] || row.status;

        return `
          <div class="space-y-2">
            ${ComponentBuilder.timelineStatusBadge(row.status, variant, true, {
              current: row.current_step,
              total: row.total_steps,
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
      render: (_value: any, row: any) => `
        <div class="text-sm text-[var(--foreground)]">${new Date(row.created_at * 1000).toLocaleDateString()}</div>
      `,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_value: any, row: any) => {
        const actions: Array<{
          label: string;
          onClick: string;
          variant: 'primary' | 'secondary' | 'destructive';
        }> = [
          {
            label: 'Review',
            onClick: `window.location.href='/dta/request/${row.id}'`,
            variant: 'secondary',
          },
          { label: 'Timeline', onClick: `viewTimeline(${row.id})`, variant: 'secondary' },
        ];

        // Add DTA-specific actions based on status
        if (row.status === 'pending_dta') {
          actions.push({
            label: 'Activate Transfer',
            onClick: `activateTransfer(${row.id})`,
            variant: 'primary',
          });
        } else if (row.status === 'active_transfer') {
          actions.push({
            label: 'Manage Transfer',
            onClick: `manageTransfer(${row.id})`,
            variant: 'primary',
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

  // Create table actions with view toggle (DTA doesn't create requests)
  const viewToggle = ComponentBuilder.viewToggle(viewMode);

  // Create timeline view content
  const timelineContent = viewMode === 'timeline' ? await renderTimelineView(tableData) : '';

  // Create table container with view toggle
  const tableContainer = ComponentBuilder.tableContainer({
    title: 'AFT Requests',
    description: 'Manage your assigned Assured File Transfer requests',
    search,
    filters,
    actions: `
      <div class="flex items-center justify-end">
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
          <div class="text-2xl font-bold text-[var(--success)]">${Math.round((((totalRequests?.count || 1) - (pendingRequests?.count || 0)) / (totalRequests?.count || 1)) * 100)}%</div>
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

  return DTANavigation.renderLayout(
    'Request Management',
    'Manage AFT requests and approvals',
    user,
    '/dta/requests',
    content,
  );
}

// Render timeline view for requests
async function renderTimelineView(tableData: any[]): Promise<string> {
  const timelines = await Promise.all(
    tableData.map((r) => RequestTrackingService.getRequestTimeline(r.id)),
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
                  request.status,
                  request.is_terminal ? 'success' : 'info',
                  true,
                  { current: request.current_step, total: request.total_steps },
                )}
                <div class="flex gap-1">
                  <button onclick="viewRequest(${request.id})" class="action-btn secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">View</button>
                  <button onclick="editRequest(${request.id})" class="action-btn secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Edit</button>
                </div>
              </div>
            </div>
            
            <div class="mb-4">
              ${ComponentBuilder.statusProgress({
                currentStatus: request.status,
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
    
    function viewDTARequest(requestId) {
      // Fetch request details and show DTA review modal
      fetch(\`/api/dta/requests/\${requestId}\`)
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            showDTARequestModal(data.request);
          } else {
            alert('Failed to load request details: ' + data.error);
          }
        })
        .catch(error => {
          console.error('Error fetching request:', error);
          alert('Failed to load request details. Please try again.');
        });
    }
    
    function activateTransfer(requestId) {
      if (confirm('Are you sure you want to activate this transfer? This will move the request to active transfer status and begin Section 4 procedures.')) {
        fetch(\`/api/dta/requests/\${requestId}/activate\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert('Transfer activated successfully! The request is now in active transfer status.');
            window.location.reload();
          } else {
            alert('Failed to activate transfer: ' + data.error);
          }
        })
        .catch(error => {
          console.error('Error activating transfer:', error);
          alert('Failed to activate transfer. Please try again.');
        });
      }
    }
    
    function manageTransfer(requestId) {
      // Navigate to active transfers page
      window.location.href = '/dta/active';
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
    
    function switchView(viewType) {
      if (currentView === viewType) return;
      
      currentView = viewType;
      const url = new URL(window.location);
      url.searchParams.set('view', viewType);
      window.location.href = url.toString();
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
    
    function showDTARequestModal(request) {
      const modalBackdrop = document.createElement('div');
      modalBackdrop.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modalBackdrop.onclick = (e) => {
        if (e.target === modalBackdrop) {
          document.body.removeChild(modalBackdrop);
        }
      };
      
      const modalContent = document.createElement('div');
      modalContent.className = 'bg-[var(--background)] rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto';
      
      modalContent.innerHTML = \`
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-2xl font-bold text-[var(--foreground)]">DTA Request Review</h2>
              <p class="text-[var(--muted-foreground)]">Request #\${request.request_number}</p>
            </div>
            <button onclick="closest('.fixed').remove()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-2xl font-bold">&times;</button>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div class="space-y-4">
              <div>
                <label class="text-sm font-medium text-[var(--muted-foreground)]">Requestor</label>
                <div class="text-[var(--foreground)]">\${request.requestor_name}</div>
              </div>
              <div>
                <label class="text-sm font-medium text-[var(--muted-foreground)]">Transfer Type</label>
                <div class="text-[var(--foreground)]">\${request.transfer_type || 'Unknown'}</div>
              </div>
              <div>
                <label class="text-sm font-medium text-[var(--muted-foreground)]">Classification</label>
                <div class="text-[var(--foreground)]">\${request.classification || 'Unknown'}</div>
              </div>
              <div>
                <label class="text-sm font-medium text-[var(--muted-foreground)]">Status</label>
                <div class="text-[var(--foreground)]">\${request.status.replace('_', ' ').toUpperCase()}</div>
              </div>
            </div>
            <div class="space-y-4">
              <div>
                <label class="text-sm font-medium text-[var(--muted-foreground)]">Created</label>
                <div class="text-[var(--foreground)]">\${new Date(request.created_at * 1000).toLocaleString()}</div>
              </div>
              <div>
                <label class="text-sm font-medium text-[var(--muted-foreground)]">File Count</label>
                <div class="text-[var(--foreground)]">\${request.file_count || 'Unknown'}</div>
              </div>
              <div>
                <label class="text-sm font-medium text-[var(--muted-foreground)]">Total Size</label>
                <div class="text-[var(--foreground)]">\${request.total_size || 'Unknown'}</div>
              </div>
              <div>
                <label class="text-sm font-medium text-[var(--muted-foreground)]">Justification</label>
                <div class="text-[var(--foreground)] text-sm">\${request.justification || 'No justification provided'}</div>
              </div>
            </div>
          </div>
          
          \${request.status === 'pending_dta' ? \`
            <div class="bg-[var(--muted)] p-4 rounded-lg mb-6">
              <h3 class="font-medium text-[var(--foreground)] mb-2">DTA Action Required</h3>
              <p class="text-sm text-[var(--muted-foreground)] mb-4">This request is ready for Data Transfer Administrator review and activation.</p>
              <button onclick="activateTransfer(\${request.id}); closest('.fixed').remove();" 
                      class="bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] px-4 py-2 rounded-md font-medium">
                Activate Transfer
              </button>
            </div>
          \` : request.status === 'active_transfer' ? \`
            <div class="bg-[var(--info)]/10 border border-[var(--info)]/20 p-4 rounded-lg mb-6">
              <h3 class="font-medium text-[var(--foreground)] mb-2">Active Transfer</h3>
              <p class="text-sm text-[var(--muted-foreground)] mb-4">This transfer is currently active. Section 4 procedures are in progress.</p>
              <button onclick="manageTransfer(\${request.id}); closest('.fixed').remove();" 
                      class="bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] px-4 py-2 rounded-md font-medium">
                Manage Transfer
              </button>
            </div>
          \` : ''}
          
          <div class="flex justify-end gap-2">
            <button onclick="closest('.fixed').remove()" 
                    class="px-4 py-2 border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--muted)]">
              Close
            </button>
          </div>
        </div>
      \`;
      
      modalBackdrop.appendChild(modalContent);
      document.body.appendChild(modalBackdrop);
    }
    
    function showTransferManagementModal(request, transferStatus) {
      const modalBackdrop = document.createElement('div');
      modalBackdrop.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modalBackdrop.onclick = (e) => {
        if (e.target === modalBackdrop) {
          document.body.removeChild(modalBackdrop);
        }
      };
      
      const modalContent = document.createElement('div');
      modalContent.className = 'bg-[var(--background)] rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto';
      
      modalContent.innerHTML = \`
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-2xl font-bold text-[var(--foreground)]">Transfer Management</h2>
              <p class="text-[var(--muted-foreground)]">Request #\${request.request_number} - Section 4 Procedures</p>
            </div>
            <button onclick="closest('.fixed').remove()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-2xl font-bold">&times;</button>
          </div>
          
          <div class="space-y-6">
            <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
              <h3 class="font-medium text-[var(--foreground)] mb-4">Section 4: Anti-Virus Scanning</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Origination Scan</label>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="\${transferStatus.origination_scan_performed ? 'text-[var(--success)]' : 'text-[var(--muted-foreground)]'}">
                      \${transferStatus.origination_scan_performed ? '✓ Completed' : '○ Pending'}
                    </span>
                    \${!transferStatus.origination_scan_performed ? \`
                      <button onclick="recordScan(\${request.id}, 'origination')" 
                              class="text-xs bg-[var(--primary)] text-[var(--primary-foreground)] px-2 py-1 rounded">
                        Record Scan
                      </button>
                    \` : ''}
                  </div>
                </div>
                <div>
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Destination Scan</label>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="\${transferStatus.destination_scan_performed ? 'text-[var(--success)]' : 'text-[var(--muted-foreground)]'}">
                      \${transferStatus.destination_scan_performed ? '✓ Completed' : '○ Pending'}
                    </span>
                    \${!transferStatus.destination_scan_performed ? \`
                      <button onclick="recordScan(\${request.id}, 'destination')" 
                              class="text-xs bg-[var(--primary)] text-[var(--primary-foreground)] px-2 py-1 rounded">
                        Record Scan
                      </button>
                    \` : ''}
                  </div>
                </div>
              </div>
            </div>
            
            <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
              <h3 class="font-medium text-[var(--foreground)] mb-4">Transfer Completion</h3>
              <div class="space-y-3">
                <div>
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Transfer Status</label>
                  <div class="text-[var(--foreground)]">\${transferStatus.transfer_completed ? 'Completed' : 'In Progress'}</div>
                </div>
                \${transferStatus.origination_scan_performed && transferStatus.destination_scan_performed && !transferStatus.transfer_completed ? \`
                  <button onclick="completeTransfer(\${request.id})" 
                          class="bg-[var(--success)] text-white px-4 py-2 rounded-md font-medium">
                    Mark Transfer Complete
                  </button>
                \` : ''}
              </div>
            </div>
            
            <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
              <h3 class="font-medium text-[var(--foreground)] mb-4">DTA Signature</h3>
              <div class="space-y-3">
                <div>
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">DTA Approval</label>
                  <div class="text-[var(--foreground)]">\${transferStatus.dta_signature ? 'Signed' : 'Pending'}</div>
                </div>
                \${transferStatus.transfer_completed && !transferStatus.dta_signature ? \`
                  <button onclick="signDTA(\${request.id})" 
                          class="bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-2 rounded-md font-medium">
                    Sign as DTA
                  </button>
                \` : ''}
              </div>
            </div>
          </div>
          
          <div class="flex justify-end gap-2 mt-6">
            <button onclick="closest('.fixed').remove()" 
                    class="px-4 py-2 border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--muted)]">
              Close
            </button>
          </div>
        </div>
      \`;
      
      modalBackdrop.appendChild(modalContent);
      document.body.appendChild(modalBackdrop);
    }
    
    function recordScan(requestId, scanType) {
      fetch(\`/api/dta/requests/\${requestId}/scan\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanType })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert(\`\${scanType.charAt(0).toUpperCase() + scanType.slice(1)} scan recorded successfully!\`);
          window.location.reload();
        } else {
          alert('Failed to record scan: ' + data.error);
        }
      })
      .catch(error => {
        console.error('Error recording scan:', error);
        alert('Failed to record scan. Please try again.');
      });
    }
    
    function completeTransfer(requestId) {
      if (confirm('Are you sure you want to mark this transfer as complete?')) {
        fetch(\`/api/dta/requests/\${requestId}/complete\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert('Transfer marked as complete successfully!');
            window.location.reload();
          } else {
            alert('Failed to complete transfer: ' + data.error);
          }
        })
        .catch(error => {
          console.error('Error completing transfer:', error);
          alert('Failed to complete transfer. Please try again.');
        });
      }
    }
    
    function signDTA(requestId) {
      if (confirm('Are you sure you want to sign this request as DTA? This will move the request to SME signature for TPI.')) {
        fetch(\`/api/dta/requests/\${requestId}/sign\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert('DTA signature recorded! The request will now proceed to SME signature for Two-Person Integrity.');
            window.location.reload();
          } else {
            alert('Failed to record DTA signature: ' + data.error);
          }
        })
        .catch(error => {
          console.error('Error recording DTA signature:', error);
          alert('Failed to record DTA signature. Please try again.');
        });
      }
    }
  `;
}

export const DtaRequests = {
  renderRequestsPage,
  getScript,
};
