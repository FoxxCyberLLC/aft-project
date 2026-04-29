// Media Custodian Requests Management Interface

import { ShieldIcon } from '../components/icons';
import { ComponentBuilder } from '../components/ui/server-components';
import { getDb } from '../lib/database-bun';
import { RequestTrackingService } from '../lib/request-tracking';
import { MediaCustodianNavigation, type MediaCustodianUser } from './media-custodian-nav';

async function renderRequestsPage(
  user: MediaCustodianUser,
  _userId: number,
  _viewMode: 'table' | 'timeline' = 'table',
): Promise<string> {
  const db = getDb();

  // Get request statistics for all requests (media custodian sees all)
  const totalRequests = (await db.query('SELECT COUNT(*) as count FROM aft_requests').get()) as any;
  const pendingRequests = (await db
    .query(
      "SELECT COUNT(*) as count FROM aft_requests WHERE status NOT IN ('completed', 'rejected', 'cancelled')",
    )
    .get()) as any;

  // Get all requests with timeline data
  const requestsWithTimeline = await RequestTrackingService.getRequestsWithTimeline({
    limit: 100,
  });

  // Transform requests data for table
  const tableData = requestsWithTimeline.map((request: any) => ({
    id: request.id,
    request_number: request.request_number,
    requestor_name: request.requestor_name,
    requestor_email: request.requestor_email,
    status: request.status,
    transfer_type: request.transfer_type || 'Unknown',
    classification: request.classification || 'Unknown',
    created_at: request.created_at,
    updated_at: request.updated_at,
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
      key: 'requestor_info',
      label: 'Requestor',
      render: (_value: any, row: any) => `
        <div>
          <div class="font-medium text-[var(--foreground)]">${row.requestor_name || 'Unknown'}</div>
          <div class="text-sm text-[var(--muted-foreground)]">${row.requestor_email || 'No email'}</div>
        </div>
      `,
    },
    {
      key: 'updated_at',
      label: 'Last Updated',
      render: (_value: any, row: any) => `
        <div class="text-sm text-[var(--foreground)]">${new Date(row.updated_at * 1000).toLocaleDateString()}</div>
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

        return `
          <div class="space-y-2">
            ${ComponentBuilder.timelineStatusBadge(row.status, variant, true, {
              current: row.current_step,
              total: row.total_steps,
            })}
            <div class="w-full bg-[var(--muted)] rounded-full h-1.5">
              <div class="bg-[var(--primary)] h-1.5 rounded-full transition-all duration-300" style="width: ${row.timeline_progress}%"></div>
            </div>
          </div>
        `;
      },
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
          { label: 'View', onClick: `viewRequest(${row.id})`, variant: 'secondary' },
          { label: 'Timeline', onClick: `viewTimeline(${row.id})`, variant: 'secondary' },
        ];

        // Add process action for pending requests
        if (
          [
            'submitted',
            'pending_dao',
            'pending_approver',
            'pending_cpso',
            'pending_media_custodian',
          ].includes(row.status)
        ) {
          actions.push({
            label: 'Process',
            onClick: `processRequest(${row.id})`,
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
    emptyMessage: 'No requests found',
    compact: false,
  });

  // Build statistics cards
  const statsCards = buildStatsCards(
    totalRequests?.count || 0,
    pendingRequests?.count || 0,
    tableData,
  );

  const tableContainer = ComponentBuilder.tableContainer({
    title: 'All Requests',
    description: 'Monitor and process all Assured File Transfer requests.',
    table,
  });

  const content = `
      <div class="space-y-6">
        ${statsCards}
        ${tableContainer}
      </div>
  `;

  return MediaCustodianNavigation.renderLayout(
    'All Requests',
    'Manage and oversee all AFT requests',
    user,
    '/media-custodian/requests',
    content,
  );
}

function buildStatsCards(total: number, pending: number, requests: any[]): string {
  const approved = requests.filter((r) => r.status === 'approved').length;
  const _rejected = requests.filter((r) => r.status === 'rejected').length;
  const completed = requests.filter((r) => r.status === 'completed').length;

  return ComponentBuilder.grid({
    cols: 4,
    gap: 'md',
    responsive: true,
    children: [
      ComponentBuilder.statusCard({
        title: 'Total Requests',
        items: [{ label: 'All Time', value: total.toString(), status: 'operational' }],
      }),
      ComponentBuilder.statusCard({
        title: 'Pending Review',
        items: [
          {
            label: 'Awaiting Action',
            value: pending.toString(),
            status: pending > 0 ? 'warning' : 'operational',
          },
        ],
      }),
      ComponentBuilder.statusCard({
        title: 'Approved',
        items: [{ label: 'Ready for Transfer', value: approved.toString(), status: 'operational' }],
      }),
      ComponentBuilder.statusCard({
        title: 'Completed',
        items: [
          { label: 'Successfully Processed', value: completed.toString(), status: 'operational' },
        ],
      }),
    ].join(''),
  });
}

async function renderRequestProcessPage(
  user: MediaCustodianUser,
  requestId: number,
): Promise<string> {
  const db = getDb();

  // Get request details with all related information
  const request = (await db
    .query(`
    SELECT r.*, 
           u.email as requestor_email, 
           u.first_name || ' ' || u.last_name as requestor_name,
           md.serial_number as drive_serial,
           md.media_control_number as drive_mcn,
           md.type as drive_type,
           md.model as drive_model
    FROM aft_requests r
    LEFT JOIN users u ON r.requestor_id = u.id
    LEFT JOIN media_drives md ON r.selected_drive_id = md.id
    WHERE r.id = ?
  `)
    .get(requestId)) as any;

  if (!request) {
    return `
      ${MediaCustodianNavigation.renderPageHeader('Request Not Found', 'The requested AFT request could not be found', user, '/media-custodian/requests')}
      <div class="max-w-4xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
        <div class="text-center">
          <h2 class="text-2xl font-bold text-[var(--foreground)] mb-4">Request Not Found</h2>
          <p class="text-[var(--muted-foreground)] mb-6">The request you're looking for doesn't exist or you don't have permission to view it.</p>
          <button onclick="window.location.href='/media-custodian/requests'" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md">
            Back to Requests
          </button>
        </div>
      </div>
    `;
  }

  // Check if request is in the right state for processing
  if (!['pending_media_custodian', 'completed'].includes(request.status)) {
    return `
      ${MediaCustodianNavigation.renderPageHeader('Cannot Process Request', 'Request is not ready for media custodian processing', user, '/media-custodian/requests')}
      <div class="max-w-4xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
        <div class="text-center">
          <h2 class="text-2xl font-bold text-[var(--foreground)] mb-4">Request Not Ready</h2>
          <p class="text-[var(--muted-foreground)] mb-6">This request is currently in "${request.status}" status and cannot be processed by media custodian at this time.</p>
          <button onclick="window.location.href='/media-custodian/requests/${requestId}'" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md">
            View Request Details
          </button>
        </div>
      </div>
    `;
  }

  // Parse files list and additional systems
  let files = [];
  let additionalSystems = [];
  if (request.files_list) {
    try {
      files = JSON.parse(request.files_list);
    } catch {
      files = [];
    }
  }
  if (request.additional_systems) {
    try {
      additionalSystems = JSON.parse(request.additional_systems);
    } catch {
      additionalSystems = [];
    }
  }

  // Build the disposition form
  const dispositionForm = buildDispositionForm(request, files, additionalSystems, user);

  return `
    ${MediaCustodianNavigation.renderPageHeader(`Process Request ${request.request_number}`, 'Complete media disposition for AFT request', user, '/media-custodian/requests')}
    
    <div class="max-w-6xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
      <div class="space-y-6">
        ${MediaCustodianNavigation.renderBreadcrumb(`/media-custodian/requests/${requestId}/process`)}
        
        ${dispositionForm}
      </div>
    </div>
  `;
}

async function renderRequestDetail(user: MediaCustodianUser, requestId: number): Promise<string> {
  const db = getDb();

  // Get request details with drive information
  const request = (await db
    .query(`
    SELECT r.*, 
           u.email as requestor_email, 
           u.first_name || ' ' || u.last_name as requestor_name,
           md.id as drive_id,
           md.serial_number as drive_serial,
           md.media_control_number as drive_mcn,
           md.type as drive_type,
           md.model as drive_model,
           md.status as drive_status,
           md.issued_to_user_id as drive_issued_to_user_id
    FROM aft_requests r
    LEFT JOIN users u ON r.requestor_id = u.id
    LEFT JOIN media_drives md ON r.selected_drive_id = md.id
    WHERE r.id = ?
  `)
    .get(requestId)) as any;

  if (!request) {
    return `
      ${MediaCustodianNavigation.renderPageHeader('Request Not Found', 'The requested AFT request could not be found', user, '/media-custodian/requests')}
      <div class="max-w-4xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
        <div class="text-center">
          <h2 class="text-2xl font-bold text-[var(--foreground)] mb-4">Request Not Found</h2>
          <p class="text-[var(--muted-foreground)] mb-6">The request you're looking for doesn't exist or you don't have permission to view it.</p>
          <button onclick="window.location.href='/media-custodian/requests'" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md">
            Back to Requests
          </button>
        </div>
      </div>
    `;
  }

  // Parse files list
  let files = [];
  if (request.files_list) {
    try {
      files = JSON.parse(request.files_list);
    } catch {
      files = [];
    }
  }

  // Get timeline data
  const timeline = await RequestTrackingService.getRequestTimeline(requestId);

  // Get request history with comments
  const history = (await db
    .query(`
    SELECT * FROM aft_request_history 
    WHERE request_id = ? 
    ORDER BY created_at DESC
  `)
    .all(requestId)) as any[];

  // Build request details view
  const requestDetails = buildRequestDetailsView(request, files);
  const timelineView = buildTimelineView(timeline?.timeline_steps || []);
  const historyView = buildHistoryView(history);

  return `
    ${MediaCustodianNavigation.renderPageHeader(`Request ${request.request_number}`, 'View and manage AFT request details', user, '/media-custodian/requests')}
    
    <div class="max-w-6xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
      <div class="space-y-6">
        ${MediaCustodianNavigation.renderBreadcrumb(`/media-custodian/requests/${requestId}`)}
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 space-y-6">
            ${requestDetails}
            ${historyView}
          </div>
          <div>
            ${timelineView}
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildDispositionForm(
  request: any,
  files: any[],
  additionalSystems: any[],
  user: MediaCustodianUser,
): string {
  return `
    <form id="disposition-form" class="space-y-6">
      <!-- Request Summary Card -->
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
        <h2 class="text-xl font-bold text-[var(--foreground)] mb-4">Request Summary</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label class="text-sm font-medium text-[var(--foreground)]">Request Number</label>
            <p class="text-sm text-[var(--muted-foreground)]">${request.request_number}</p>
          </div>
          <div>
            <label class="text-sm font-medium text-[var(--foreground)]">Requestor</label>
            <p class="text-sm text-[var(--muted-foreground)]">${request.requestor_name || request.requestor_email}</p>
          </div>
          <div>
            <label class="text-sm font-medium text-[var(--foreground)]">Transfer Type</label>
            <p class="text-sm text-[var(--muted-foreground)]">${request.transfer_type || 'Not specified'}</p>
          </div>
          <div>
            <label class="text-sm font-medium text-[var(--foreground)]">Classification</label>
            <p class="text-sm text-[var(--muted-foreground)]">${request.classification || 'Not specified'}</p>
          </div>
          <div>
            <label class="text-sm font-medium text-[var(--foreground)]">Source System</label>
            <p class="text-sm text-[var(--muted-foreground)]">${request.source_system || 'Not specified'}</p>
          </div>
          <div>
            <label class="text-sm font-medium text-[var(--foreground)]">Destination System</label>
            <p class="text-sm text-[var(--muted-foreground)]">${request.dest_system || 'Not specified'}</p>
          </div>
        </div>
        
        ${
          additionalSystems.length > 0
            ? `
          <div class="mt-4">
            <label class="text-sm font-medium text-[var(--foreground)]">Additional Systems</label>
            <div class="mt-2 space-y-2">
              ${additionalSystems
                .map(
                  (system) => `
                <div class="p-3 bg-[var(--muted)] rounded-md">
                  <div class="grid grid-cols-2 gap-2 text-sm">
                    <div><strong>Name:</strong> ${system.name}</div>
                    <div><strong>Classification:</strong> ${system.classification}</div>
                    <div><strong>Location:</strong> ${system.location}</div>
                    <div><strong>Contact:</strong> ${system.contact}</div>
                  </div>
                </div>
              `,
                )
                .join('')}
            </div>
          </div>
        `
            : ''
        }
      </div>

      <!-- Media Information Card -->
      ${
        request.drive_serial
          ? `
        <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
          <h2 class="text-xl font-bold text-[var(--foreground)] mb-4">Media Information</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium text-[var(--foreground)]">Drive Type</label>
              <p class="text-sm text-[var(--muted-foreground)]">${request.drive_type}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-[var(--foreground)]">Model</label>
              <p class="text-sm text-[var(--muted-foreground)]">${request.drive_model}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-[var(--foreground)]">Serial Number</label>
              <p class="text-sm text-[var(--muted-foreground)]">${request.drive_serial}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-[var(--foreground)]">Media Control Number</label>
              <p class="text-sm text-[var(--muted-foreground)]">${request.drive_mcn || 'Not assigned'}</p>
            </div>
          </div>
        </div>
      `
          : ''
      }

      <!-- Files Summary -->
      ${
        files.length > 0
          ? `
        <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
          <h2 class="text-xl font-bold text-[var(--foreground)] mb-4">Files Transferred (${files.length})</h2>
          <div class="space-y-2 max-h-40 overflow-y-auto">
            ${files
              .map(
                (file) => `
              <div class="flex justify-between items-center p-2 bg-[var(--muted)] rounded text-sm">
                <span class="font-medium">${file.name}</span>
                <div class="text-right">
                  <div class="text-[var(--muted-foreground)]">${file.type}</div>
                  <div class="text-xs text-[var(--muted-foreground)]">${file.classification}</div>
                </div>
              </div>
            `,
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      <!-- Section V: Media Disposition Form -->
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
        <h2 class="text-xl font-bold text-[var(--foreground)] mb-4">Section V: Media Disposition – Media Custodian</h2>
        <p class="text-sm text-[var(--muted-foreground)] mb-6">The data transfer media has been verified as:</p>
        
        <div class="space-y-6">
          <!-- Optical Media Destroyed -->
          <div class="border border-[var(--border)] rounded-lg p-4">
            <label class="text-sm font-medium text-[var(--foreground)] mb-3 block">Optical Media Destroyed:</label>
            <div class="flex space-x-6">
              <label class="flex items-center">
                <input type="radio" name="optical_destroyed" value="yes" class="mr-2">
                <span class="text-sm">Yes</span>
              </label>
              <label class="flex items-center">
                <input type="radio" name="optical_destroyed" value="no" class="mr-2">
                <span class="text-sm">No</span>
              </label>
              <label class="flex items-center">
                <input type="radio" name="optical_destroyed" value="na" class="mr-2" checked>
                <span class="text-sm">N/A</span>
              </label>
            </div>
          </div>

          <!-- Optical Media Retained -->
          <div class="border border-[var(--border)] rounded-lg p-4">
            <label class="text-sm font-medium text-[var(--foreground)] mb-3 block">Optical Media Retained:</label>
            <div class="flex space-x-6">
              <label class="flex items-center">
                <input type="radio" name="optical_retained" value="yes" class="mr-2">
                <span class="text-sm">Yes</span>
              </label>
              <label class="flex items-center">
                <input type="radio" name="optical_retained" value="no" class="mr-2">
                <span class="text-sm">No</span>
              </label>
              <label class="flex items-center">
                <input type="radio" name="optical_retained" value="na" class="mr-2" checked>
                <span class="text-sm">N/A</span>
              </label>
            </div>
          </div>

          <!-- SSD Media Sanitized -->
          <div class="border border-[var(--border)] rounded-lg p-4">
            <label class="text-sm font-medium text-[var(--foreground)] mb-3 block">SSD Media Sanitized:</label>
            <div class="flex space-x-6">
              <label class="flex items-center">
                <input type="radio" name="ssd_sanitized" value="yes" class="mr-2">
                <span class="text-sm">Yes</span>
              </label>
              <label class="flex items-center">
                <input type="radio" name="ssd_sanitized" value="no" class="mr-2">
                <span class="text-sm">No</span>
              </label>
              <label class="flex items-center">
                <input type="radio" name="ssd_sanitized" value="na" class="mr-2" checked>
                <span class="text-sm">N/A</span>
              </label>
            </div>
          </div>

          <!-- Additional Notes -->
          <div>
            <label class="text-sm font-medium text-[var(--foreground)] mb-2 block">Additional Notes:</label>
            <textarea 
              id="disposition_notes" 
              name="disposition_notes" 
              rows="3" 
              class="w-full p-3 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)]"
              placeholder="Enter any additional notes about the media disposition..."
            ></textarea>
          </div>

          <!-- Signature Section -->
          <div class="border-t border-[var(--border)] pt-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="text-sm font-medium text-[var(--foreground)] mb-2 block">Name:</label>
                <input 
                  type="text" 
                  id="custodian_name"
                  name="custodian_name"
                  value="${user.email.split('@')[0]}"
                  class="w-full p-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)]"
                  required
                >
              </div>
              <div>
                <label class="text-sm font-medium text-[var(--foreground)] mb-2 block">Date:</label>
                <input 
                  type="date" 
                  id="disposition_date"
                  name="disposition_date"
                  value="${new Date().toISOString().split('T')[0]}"
                  class="w-full p-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)]"
                  required
                >
              </div>
              <div>
                <label class="text-sm font-medium text-[var(--foreground)] mb-2 block">Digital Signature:</label>
                <div id="cac-signature-status" class="bg-[var(--info)]/10 border border-[var(--info)]/20 rounded-lg p-4">
                  <p class="text-sm text-[var(--info)] font-medium mb-2">CAC Digital Signature</p>
                  <p class="text-xs text-[var(--muted-foreground)]">
                    Checking for CAC certificate...
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-between items-center">
        <button 
          type="button" 
          onclick="window.location.href='/media-custodian/requests/${request.id}'"
          class="px-6 py-2 text-sm border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
        >
          Back to Request
        </button>
        
        <div class="flex space-x-3">
          <button
            type="button"
            onclick="completeDispositionWithCAC(${request.id})"
            id="complete-disposition-btn"
            class="px-6 py-2 text-sm bg-[var(--success)] text-white rounded-md hover:opacity-90 transition-opacity"
            disabled
          >
            ${ShieldIcon({ size: 16 })} Complete Disposition with CAC
          </button>
          ${
            request.drive_serial
              ? `
            <button
              type="button"
              onclick="completeAndReturnDriveWithCAC(${request.id})"
              id="complete-return-btn"
              class="px-6 py-2 text-sm bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90 transition-opacity"
              disabled
            >
              ${ShieldIcon({ size: 16 })} Complete & Return Drive with CAC
            </button>
          `
              : ''
          }
        </div>
      </div>
    </form>
  `;
}

function buildRequestDetailsView(request: any, files: any[]): string {
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

  const variant = statusVariant[request.status as keyof typeof statusVariant] || 'default';

  return `
    <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6 space-y-6">
      <div class="flex justify-between items-start">
        <div>
          <h2 class="text-2xl font-bold text-[var(--foreground)]">${request.request_number}</h2>
          <p class="text-[var(--muted-foreground)]">Submitted by ${request.requestor_name || request.requestor_email}</p>
        </div>
        ${ComponentBuilder.statusBadge(request.status.replace('_', ' ').toUpperCase(), variant)}
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 class="font-semibold text-[var(--foreground)] mb-3">Transfer Details</h3>
          <dl class="space-y-2 text-sm">
            <div><dt class="font-medium">Media Type:</dt><dd>${request.media_type || 'Not specified'}</dd></div>
            <div><dt class="font-medium">Transfer Type:</dt><dd>${request.transfer_type || 'Not specified'}</dd></div>
            <div><dt class="font-medium">Classification:</dt><dd>${request.classification || 'Not specified'}</dd></div>
            <div><dt class="font-medium">Media Disposition:</dt><dd>${request.media_disposition || 'Not specified'}</dd></div>
          </dl>
        </div>

        <div>
          <h3 class="font-semibold text-[var(--foreground)] mb-3">System Information</h3>
          <dl class="space-y-2 text-sm">
            <div><dt class="font-medium">Source System:</dt><dd>${request.source_system || 'Not specified'}</dd></div>
            <div><dt class="font-medium">Source Classification:</dt><dd>${request.source_classification || 'Not specified'}</dd></div>
            <div><dt class="font-medium">Destination System:</dt><dd>${request.dest_system || 'Not specified'}</dd></div>
            <div><dt class="font-medium">Destination Classification:</dt><dd>${request.destination_classification || 'Not specified'}</dd></div>
          </dl>
        </div>
      </div>

      <div>
        <h3 class="font-semibold text-[var(--foreground)] mb-3">Justification</h3>
        <p class="text-sm text-[var(--muted-foreground)] bg-[var(--muted)] p-3 rounded-md">
          ${request.transfer_purpose || 'No justification provided'}
        </p>
      </div>

      ${
        request.drive_id
          ? `
        <div>
          <h3 class="font-semibold text-[var(--foreground)] mb-3">Assigned Drive</h3>
          <div class="bg-[var(--muted)] p-4 rounded-md">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div><dt class="font-medium">Serial Number:</dt><dd>${request.drive_serial}</dd></div>
              <div><dt class="font-medium">MCN:</dt><dd>${request.drive_mcn || 'Not assigned'}</dd></div>
              <div><dt class="font-medium">Type:</dt><dd>${request.drive_type}</dd></div>
              <div><dt class="font-medium">Model:</dt><dd>${request.drive_model}</dd></div>
              <div><dt class="font-medium">Status:</dt><dd>${request.drive_status}</dd></div>
              <div><dt class="font-medium">Issued to DTA:</dt><dd>${request.drive_issued_to_user_id ? 'Yes' : 'No'}</dd></div>
            </div>
          </div>
        </div>
      `
          : ''
      }

      ${
        files.length > 0
          ? `
        <div>
          <h3 class="font-semibold text-[var(--foreground)] mb-3">Files (${files.length})</h3>
          <div class="space-y-2">
            ${files
              .map(
                (file) => `
              <div class="flex justify-between items-center p-2 bg-[var(--muted)] rounded text-sm">
                <span class="font-medium">${file.name}</span>
                <span class="text-[var(--muted-foreground)]">${file.type} - ${file.classification}</span>
              </div>
            `,
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      <div class="flex justify-between items-center pt-4 border-t border-[var(--border)]">
        <div class="text-sm text-[var(--muted-foreground)]">
          Created: ${new Date(request.created_at * 1000).toLocaleString()}
          <br>
          Updated: ${new Date(request.updated_at * 1000).toLocaleString()}
        </div>
        <div class="flex space-x-2">
          <button onclick="window.location.href='/media-custodian/requests'" class="px-4 py-2 text-sm border border-[var(--border)] rounded-md hover:bg-[var(--muted)]">
            Back to Requests
          </button>
          ${
            request.drive_id && ['completed', 'disposed'].includes(request.status)
              ? `
            <button 
              onclick="returnDriveToInventory(${request.drive_id}, '${request.drive_serial}', ${request.id})"
              class="px-4 py-2 text-sm bg-[var(--warning)] text-white rounded-md hover:opacity-90 transition-opacity"
              title="Return drive to available inventory"
            >
              Return Drive
            </button>
          `
              : ''
          }
        </div>
      </div>
    </div>
  `;
}

function buildHistoryView(history: any[]): string {
  if (!history || history.length === 0) {
    return '';
  }

  return `
    <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
      <h3 class="font-semibold text-[var(--foreground)] mb-4">Request History</h3>
      <div class="space-y-3">
        ${history
          .map(
            (entry) => `
          <div class="flex items-start gap-3 pb-3 border-b border-[var(--border)] last:border-0">
            <div class="w-2 h-2 rounded-full bg-[var(--primary)] mt-2"></div>
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-medium text-[var(--foreground)]">${entry.action}</span>
                <span class="text-xs text-[var(--muted-foreground)]">${new Date(entry.created_at * 1000).toLocaleString()}</span>
              </div>
              ${entry.notes ? `<p class="text-sm text-[var(--muted-foreground)]">${entry.notes}</p>` : ''}
              <p class="text-xs text-[var(--muted-foreground)]">by ${entry.user_email}</p>
            </div>
          </div>
        `,
          )
          .join('')}
      </div>
    </div>
  `;
}

function buildTimelineView(timeline: any[]): string {
  return `
    <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
      <h3 class="font-semibold text-[var(--foreground)] mb-4">Request Timeline</h3>
      <div class="space-y-4">
        ${timeline
          .map(
            (event, _index) => `
          <div class="flex items-start space-x-3">
            <div class="flex-shrink-0 w-3 h-3 rounded-full ${event.status === 'completed' ? 'bg-[var(--success)]' : event.status === 'current' ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'} mt-1"></div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-[var(--foreground)]">${event.title || 'Unknown Step'}</p>
              <p class="text-xs text-[var(--muted-foreground)]">${event.description || 'No description'}</p>
              ${
                event.timestamp
                  ? `
                <p class="text-xs text-[var(--muted-foreground)] mt-1">
                  ${new Date(event.timestamp * 1000).toLocaleString()}
                </p>
              `
                  : ''
              }
            </div>
          </div>
        `,
          )
          .join('')}
      </div>
    </div>
  `;
}

function getScript(): string {
  return `
    let cacCertificateInfo = null;

    // Check for CAC certificate on page load
    document.addEventListener('DOMContentLoaded', function() {
      checkCACCertificate();
    });

    function checkCACCertificate() {
      const statusElement = document.getElementById('cac-signature-status');
      const dispositionBtn = document.getElementById('complete-disposition-btn');
      const returnBtn = document.getElementById('complete-return-btn');

      if (!statusElement) return; // Not on disposition page

      // Check for client certificate
      fetch('/media-custodian/api/cac-info')
        .then(response => response.json())
        .then(data => {
          if (data.hasClientCert && data.certificate) {
            cacCertificateInfo = data.certificate;

            // Update status to show CAC is available
            statusElement.className = 'bg-[var(--success)]/10 border border-[var(--success)]/20 rounded-lg p-4';
            statusElement.innerHTML = \`
              <p class="text-sm text-[var(--success)] font-medium mb-2 flex items-center gap-2">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                </svg>
                CAC Certificate Available
              </p>
              <p class="text-xs text-[var(--muted-foreground)]">
                Ready to sign with: \${data.certificate.subject}
              </p>
            \`;

            // Enable buttons
            if (dispositionBtn) {
              dispositionBtn.disabled = false;
              dispositionBtn.className = dispositionBtn.className.replace('opacity-50', '');
            }
            if (returnBtn) {
              returnBtn.disabled = false;
              returnBtn.className = returnBtn.className.replace('opacity-50', '');
            }

            console.log('CAC certificate available for media custodian:', {
              subject: data.certificate.subject,
              issuer: data.certificate.issuer,
              serial: data.certificate.serialNumber
            });
          } else {
            cacCertificateInfo = null;

            // Update status to show CAC is not available
            statusElement.className = 'bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 rounded-lg p-4';
            statusElement.innerHTML = \`
              <p class="text-sm text-[var(--destructive)] font-medium mb-2">CAC Certificate Not Available</p>
              <p class="text-xs text-[var(--muted-foreground)]">
                No CAC certificate found. Please ensure you're logged in with CAC authentication.
              </p>
            \`;

            console.log('No CAC certificate available for media custodian');
          }
        })
        .catch(error => {
          console.error('Error checking CAC certificate:', error);
          cacCertificateInfo = null;

          if (statusElement) {
            statusElement.className = 'bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 rounded-lg p-4';
            statusElement.innerHTML = \`
              <p class="text-sm text-[var(--destructive)] font-medium mb-2">CAC Check Failed</p>
              <p class="text-xs text-[var(--muted-foreground)]">
                Unable to check CAC status. Please refresh and try again.
              </p>
            \`;
          }
        });
    }

    function toggleViewMode(mode) {
      const tableBtn = document.getElementById('table-view-btn');
      const timelineBtn = document.getElementById('timeline-view-btn');
      
      if (mode === 'table') {
        tableBtn.className = 'px-3 py-2 text-sm font-medium rounded-md transition-colors bg-[var(--primary)] text-[var(--primary-foreground)]';
        timelineBtn.className = 'px-3 py-2 text-sm font-medium rounded-md transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]';
      } else {
        timelineBtn.className = 'px-3 py-2 text-sm font-medium rounded-md transition-colors bg-[var(--primary)] text-[var(--primary-foreground)]';
        tableBtn.className = 'px-3 py-2 text-sm font-medium rounded-md transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]';
      }
      
      // TODO: Implement actual view switching
      console.log('Switching to', mode, 'view');
    }
    
    function applyFilters() {
      const status = document.getElementById('status-filter').value;
      const classification = document.getElementById('classification-filter').value;
      const search = document.getElementById('search-input').value;
      
      console.log('Applying filters:', { status, classification, search });
      // TODO: Implement actual filtering
    }
    
    function clearFilters() {
      document.getElementById('status-filter').value = '';
      document.getElementById('classification-filter').value = '';
      document.getElementById('search-input').value = '';
      applyFilters();
    }
    
    function viewRequest(requestId) {
      window.location.href = '/media-custodian/requests/' + requestId;
    }
    
    function processRequest(requestId) {
      window.location.href = '/media-custodian/requests/' + requestId + '/process';
    }
    
    async function completeDispositionWithCAC(requestId) {
      if (!cacCertificateInfo) {
        alert('No CAC certificate available. Please ensure you are logged in with CAC authentication and refresh the page.');
        return;
      }

      const form = document.getElementById('disposition-form');
      const formData = new FormData(form);

      // Validate required fields
      const custodianName = formData.get('custodian_name');
      const dispositionDate = formData.get('disposition_date');

      if (!custodianName || !dispositionDate) {
        alert('Please fill in all required fields (Name, Date)');
        return;
      }

      if (!confirm('Are you sure you want to complete the disposition with CAC digital signature?')) {
        return;
      }
      
      // Generate CAC signature data
      const signatureData = {
        signature: \`CAC_SIGNATURE_\${requestId}_\${Date.now()}\`,
        certificate: {
          thumbprint: cacCertificateInfo.thumbprint || \`CAC_\${requestId}_\${Date.now()}\`,
          subject: cacCertificateInfo.subject,
          issuer: cacCertificateInfo.issuer,
          validFrom: cacCertificateInfo.validFrom,
          validTo: cacCertificateInfo.validTo,
          serialNumber: cacCertificateInfo.serialNumber,
          pemData: cacCertificateInfo.pemData
        },
        timestamp: new Date().toISOString(),
        algorithm: 'SHA256-RSA'
      };

      // Collect disposition data
      const dispositionData = {
        requestId: requestId,
        action: 'dispose',
        custodianName: custodianName,
        dispositionDate: dispositionDate,
        cacSignature: signatureData,
        opticalDestroyed: formData.get('optical_destroyed'),
        opticalRetained: formData.get('optical_retained'),
        ssdSanitized: formData.get('ssd_sanitized'),
        notes: formData.get('disposition_notes')
      };
      
      try {
        const response = await fetch('/media-custodian/api/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(dispositionData)
        });
        
        const result = await response.json();
        
        if (result.success) {
          alert('Media disposition completed successfully with CAC signature!');
          window.location.href = '/media-custodian/requests/' + requestId;
        } else {
          alert('Error: ' + (result.message || 'Failed to complete disposition'));
        }
      } catch (error) {
        console.error('Error completing disposition:', error);
        alert('An error occurred while completing the disposition. Please try again.');
      }
    }
    
    async function completeAndReturnDriveWithCAC(requestId) {
      if (!cacCertificateInfo) {
        alert('No CAC certificate available. Please ensure you are logged in with CAC authentication and refresh the page.');
        return;
      }

      const form = document.getElementById('disposition-form');
      const formData = new FormData(form);

      // Validate required fields
      const custodianName = formData.get('custodian_name');
      const dispositionDate = formData.get('disposition_date');

      if (!custodianName || !dispositionDate) {
        alert('Please fill in all required fields (Name, Date)');
        return;
      }

      if (!confirm('Are you sure you want to complete the disposition and return the drive with CAC digital signature?')) {
        return;
      }
      
      if (!confirm('This will complete the disposition and return the associated drive. Are you sure?')) {
        return;
      }
      
      // Generate CAC signature data
      const signatureData = {
        signature: \`CAC_SIGNATURE_\${requestId}_\${Date.now()}\`,
        certificate: {
          thumbprint: cacCertificateInfo.thumbprint || \`CAC_\${requestId}_\${Date.now()}\`,
          subject: cacCertificateInfo.subject,
          issuer: cacCertificateInfo.issuer,
          validFrom: cacCertificateInfo.validFrom,
          validTo: cacCertificateInfo.validTo,
          serialNumber: cacCertificateInfo.serialNumber,
          pemData: cacCertificateInfo.pemData
        },
        timestamp: new Date().toISOString(),
        algorithm: 'SHA256-RSA'
      };

      // Collect disposition data
      const dispositionData = {
        requestId: requestId,
        action: 'dispose_and_return_drive',
        custodianName: custodianName,
        dispositionDate: dispositionDate,
        cacSignature: signatureData,
        opticalDestroyed: formData.get('optical_destroyed'),
        opticalRetained: formData.get('optical_retained'),
        ssdSanitized: formData.get('ssd_sanitized'),
        notes: formData.get('disposition_notes')
      };
      
      try {
        const response = await fetch('/media-custodian/api/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(dispositionData)
        });
        
        const result = await response.json();
        
        if (result.success) {
          alert('Media disposition completed and drive returned successfully with CAC signature!');
          window.location.href = '/media-custodian/requests/' + requestId;
        } else {
          alert('Error: ' + (result.message || 'Failed to complete disposition and return drive'));
        }
      } catch (error) {
        console.error('Error completing disposition:', error);
        alert('An error occurred while completing the disposition. Please try again.');
      }
    }
    
    async function returnDriveToInventory(driveId, driveSerial, requestId) {
      if (!confirm(\`Are you sure you want to return drive \${driveSerial} to available inventory? This action cannot be undone.\`)) {
        return;
      }
      
      try {
        const response = await fetch('/media-custodian/api/return-drive', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            driveId: driveId,
            requestId: requestId,
            userId: 1 // TODO: Get from auth
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          alert(\`Drive \${driveSerial} has been successfully returned to inventory!\`);
          // Refresh the page to update the UI
          window.location.reload();
        } else {
          alert('Error: ' + (result.message || 'Failed to return drive to inventory'));
        }
      } catch (error) {
        console.error('Error returning drive:', error);
        alert('An error occurred while returning the drive. Please try again.');
      }
    }
    
    function viewTimeline(requestId) {
      // Show timeline modal - reuse from requestor implementation
      showTimelineModal(requestId);
    }
    
    async function showTimelineModal(requestId) {
      try {
        const response = await fetch('/api/requests/' + requestId + '/timeline');
        if (!response.ok) throw new Error('Failed to fetch timeline');
        
        const timeline = await response.json();
        
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = \`
          <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div class="p-6 border-b border-[var(--border)] flex justify-between items-center">
              <h3 class="text-lg font-semibold text-[var(--foreground)]">Request Timeline</h3>
              <button onclick="closest('.fixed').remove()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <div class="p-6">
              <div class="space-y-4">
                \${timeline.map(event => \`
                  <div class="flex items-start space-x-4">
                    <div class="flex-shrink-0 w-4 h-4 rounded-full \${event.completed ? 'bg-[var(--success)]' : 'bg-[var(--muted)]'} mt-1"></div>
                    <div class="flex-1">
                      <div class="flex items-center justify-between">
                        <h4 class="font-medium text-[var(--foreground)]">\${event.step_name}</h4>
                        \${event.completed ? '<span class="text-xs text-[var(--success)]">✓ Completed</span>' : '<span class="text-xs text-[var(--muted-foreground)]">Pending</span>'}
                      </div>
                      <p class="text-sm text-[var(--muted-foreground)] mt-1">\${event.description || 'No description available'}</p>
                      \${event.completed_at ? \`<p class="text-xs text-[var(--muted-foreground)] mt-2">\${new Date(event.completed_at * 1000).toLocaleString()}</p>\` : ''}
                    </div>
                  </div>
                \`).join('')}
              </div>
            </div>
          </div>
        \`;
        
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.remove();
        });
      } catch (error) {
        console.error('Error fetching timeline:', error);
        alert('Failed to load request timeline. Please try again.');
      }
    }
  `;
}

export const MediaCustodianRequests = {
  renderRequestsPage,
  renderRequestProcessPage,
  renderRequestDetail,
  getScript,
};
