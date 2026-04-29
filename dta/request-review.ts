// Request Review Page - Detailed view for approving/rejecting individual requests

import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  ServerIcon,
  ShieldIcon,
  UserIcon,
  XCircleIcon,
} from '../components/icons';
import { ComponentBuilder } from '../components/ui/server-components';
import { getDb, type DbRow } from '../lib/database-bun';
import { DTANavigation, type DTAUser } from './dta-nav';

async function render(user: DTAUser, requestId: string, userId: number): Promise<string> {
  const db = getDb();

  // Get request details with complete information
  const request = (await db
    .query(`
    SELECT 
      r.*, 
      u.email as requestor_email,
      u.first_name || ' ' || u.last_name as requestor_name,
      u.organization as requestor_org,
      u.phone as requestor_phone,
      du.first_name || ' ' || du.last_name as dta_name,
      du.email as dta_email,
      du.phone as dta_phone,
      md.serial_number as drive_serial,
      md.type as drive_type,
      md.model as drive_model,
      md.status as drive_status
    FROM aft_requests r
    LEFT JOIN users u ON r.requestor_id = u.id
    LEFT JOIN users du ON r.dta_id = du.id
    LEFT JOIN media_drives md ON r.selected_drive_id = md.id
    WHERE r.id = ? AND r.dta_id = ?
  `)
    .get(requestId, userId)) as DbRow;

  if (!request) {
    return renderNotFound(user);
  }

  // Get request history
  const history = (await db
    .query(`
    SELECT * FROM aft_request_history 
    WHERE request_id = ? 
    ORDER BY created_at DESC
  `)
    .all(requestId)) as DbRow[];

  const content = `
    <div class="space-y-6">
      <!-- Status Banner -->
      ${renderStatusBanner(request)}
      
      <!-- Main Content Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left Column - Request Details -->
        <div class="lg:col-span-2 space-y-6">
          ${renderRequestDetails(request)}
          ${renderDestinations(request)}
          ${renderFileInformation(request)}
          ${renderJustification(request)}
          ${renderHistory(history)}
        </div>
        
        <!-- Right Column - Actions & Info -->
        <div class="space-y-6">
          ${renderDTAActions(request)}
          ${renderRequestorInfo(request)}
          ${renderMetadata(request)}
        </div>
      </div>
    </div>
  `;

  return DTANavigation.renderLayout(
    'Request Review',
    `Request #${request.request_number || requestId}`,
    user,
    '/dta/request',
    content,
  );
}

function renderStatusBanner(request: DbRow): string {
  const statusConfig = {
    pending_dta: {
      icon: ClockIcon({ size: 20 }),
      text: 'Pending DTA Action',
      class: 'bg-[var(--warning)] border-[var(--warning)] text-[var(--warning-foreground)]',
    },
    active_transfer: {
      icon: ClockIcon({ size: 20 }),
      text: 'Active Transfer - Section 4',
      class: 'bg-[var(--info)] border-[var(--info)] text-[var(--info-foreground)]',
    },
    pending_sme_signature: {
      icon: CheckCircleIcon({ size: 20 }),
      text: 'Pending SME Signature',
      class: 'bg-[var(--success)] border-[var(--success)] text-[var(--success-foreground)]',
    },
    completed: {
      icon: CheckCircleIcon({ size: 20 }),
      text: 'Transfer Complete',
      class: 'bg-[var(--success)] border-[var(--success)] text-[var(--success-foreground)]',
    },
    cancelled: {
      icon: XCircleIcon({ size: 20 }),
      text: 'Transfer Cancelled',
      class:
        'bg-[var(--destructive)] border-[var(--destructive)] text-[var(--destructive-foreground)]',
    },
  };

  const statusKey = (
    ['pending_dta', 'active_transfer', 'pending_sme_signature', 'completed', 'cancelled'] as readonly string[]
  ).includes(request.status as string)
    ? (request.status as
        | 'pending_dta'
        | 'active_transfer'
        | 'pending_sme_signature'
        | 'completed'
        | 'cancelled')
    : 'pending_dta';
  const config = statusConfig[statusKey];

  return `
    <div class="rounded-lg border-2 ${config.class} p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          ${config.icon}
          <span class="font-semibold">${config.text}</span>
        </div>
        ${
          request.priority === 'urgent'
            ? `
          <span class="flex items-center gap-2 px-3 py-1 bg-[var(--destructive)] text-[var(--destructive-foreground)] rounded-full text-sm font-medium">
            ${AlertTriangleIcon({ size: 16 })}
            Urgent Request
          </span>
        `
            : ''
        }
      </div>
    </div>
  `;
}

function renderRequestDetails(request: DbRow): string {
  return ComponentBuilder.card({
    children: `
      <div class="p-6 pb-4">
        <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)] flex items-center gap-2">
          ${FileTextIcon({ size: 20 })}
          Transfer Details
        </h3>
      </div>
      <div class="p-6 pt-0 space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Source System</label>
            <p class="text-base font-medium text-[var(--foreground)] flex items-center gap-2 mt-1">
              ${ServerIcon({ size: 16 })}
              ${request.source_system}
            </p>
          </div>
          <div>
            <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Destination System</label>
            <p class="text-base font-medium text-[var(--foreground)] flex items-center gap-2 mt-1">
              ${ServerIcon({ size: 16 })}
              ${request.dest_system || 'Not specified'}
            </p>
          </div>
          <div>
            <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Classification</label>
            <p class="text-base font-medium text-[var(--foreground)] flex items-center gap-2 mt-1">
              ${ShieldIcon({ size: 16 })}
              ${request.classification || 'UNCLASSIFIED'}
            </p>
          </div>
          <div>
            <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Transfer Type</label>
            <p class="text-base font-medium text-[var(--foreground)]">${request.transfer_type || 'Standard'}</p>
          </div>
        </div>
        
        ${
          request.data_description || request.description
            ? `
          <div>
            <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Description</label>
            <p class="text-sm text-[var(--foreground)] mt-1">${request.data_description || request.description}</p>
          </div>
        `
            : ''
        }
      </div>
    `,
  });
}

function renderDestinations(request: DbRow): string {
  // Parse transfer_data.destinations if present
  let destinations: Array<{ is?: string; classification?: string; location?: string; contact?: string }> = [];
  try {
    const td = request.transfer_data ? JSON.parse(String(request.transfer_data)) : null;
    destinations = Array.isArray(td?.destinations) ? td.destinations : [];
  } catch {}

  if (!request.dest_system && destinations.length === 0) return '';

  // Ensure primary appears first
  const list = [] as Array<{ is: string; classification?: string; primary?: boolean }>;
  if (request.dest_system) {
    list.push({
      is: request.dest_system as string,
      classification: destinations[0]?.classification,
      primary: true,
    });
  }
  // Add extras (skip first if it duplicates primary)
  const extras = request.dest_system ? destinations.slice(1) : destinations;
  for (const d of extras) {
    list.push({ is: d?.is || '', classification: d?.classification || '' });
  }

  return ComponentBuilder.card({
    children: `
      <div class="p-6 pb-4">
        <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Destination Systems</h3>
      </div>
      <div class="p-6 pt-0 space-y-2">
        ${list
          .map(
            (d) => `
          <div class="flex items-center justify-between p-3 bg-[var(--muted)] rounded">
            <div class="font-medium ${d.primary ? 'text-[var(--primary)]' : ''}">${d.is || '(unspecified)'}</div>
            <div class="text-xs text-[var(--muted-foreground)]">${d.classification || ''}</div>
          </div>
        `,
          )
          .join('')}
      </div>
    `,
  });
}

function renderFileInformation(request: DbRow): string {
  let files: Array<{ name: string; size: number; type: string; hash?: string; classification?: string }> = [];
  try {
    files = request.files_list ? JSON.parse(String(request.files_list)) : [];
    if (!Array.isArray(files)) files = [];
  } catch {
    files = [];
  }

  return ComponentBuilder.card({
    children: `
      <div class="p-6 pb-4">
        <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Files to Transfer</h3>
      </div>
      <div class="p-6 pt-0 space-y-2">
        ${
          files.length > 0
            ? files
                .map((file) => {
                  const base = (file?.name || '').toString();
                  const ext = (file?.type || '').toString().replace(/^\./, '');
                  const fullName = base && ext ? `${base}.${ext}` : base || '(unnamed)';
                  const size = (file?.size || '').toString().trim();
                  const sizeDisplay = size ? size : 'Size not specified';
                  const classification = file?.classification || 'No classification';
                  return `
            <div class="flex items-center justify-between p-3 bg-[var(--muted)] rounded">
              <div>
                <div class="font-medium">${fullName}</div>
                <div class="text-xs text-[var(--muted-foreground)]">${sizeDisplay}</div>
              </div>
              <div class="text-sm text-[var(--muted-foreground)]">${classification}</div>
            </div>
          `;
                })
                .join('')
            : '<p class="text-[var(--muted-foreground)]">No files specified</p>'
        }
      </div>
    `,
  });
}

function renderJustification(request: DbRow): string {
  return ComponentBuilder.card({
    children: `
      <div class="p-6 pb-4">
        <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Business Justification</h3>
      </div>
      <div class="p-6 pt-0">
        <div class="text-sm text-[var(--foreground)] whitespace-pre-wrap">
          ${request.transfer_purpose || request.justification || 'No justification provided'}
        </div>
      </div>
    `,
  });
}

function renderHistory(history: any[]): string {
  if (!history || history.length === 0) {
    return '';
  }

  return ComponentBuilder.card({
    children: `
      <div class="p-6 pb-4">
        <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Request History</h3>
      </div>
      <div class="p-6 pt-0 space-y-3">
        ${history
          .map(
            (entry) => `
          <div class="flex items-start gap-3 pb-3 border-b border-[var(--border)] last:border-0">
            <div class="w-2 h-2 rounded-full bg-[var(--primary)] mt-2"></div>
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-medium text-[var(--foreground)]">${entry.action}</span>
                <span class="text-xs text-[var(--muted-foreground)]">${new Date(entry.created_at).toLocaleString()}</span>
              </div>
              ${entry.notes ? `<p class="text-sm text-[var(--muted-foreground)]">${entry.notes}</p>` : ''}
              <p class="text-xs text-[var(--muted-foreground)]">by ${entry.user_email}</p>
            </div>
          </div>
        `,
          )
          .join('')}
      </div>
    `,
  });
}

function renderDTAActions(request: DbRow): string {
  if (['completed', 'cancelled', 'pending_sme_signature'].includes(request.status as string)) {
    return ComponentBuilder.card({
      children: `
        <div class="p-6 pb-0">
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Actions</h3>
        </div>
        <div class="text-center py-4">
          <p class="text-sm text-[var(--muted-foreground)] mb-4">
            ${
              request.status === 'completed'
                ? 'This transfer has been completed.'
                : request.status === 'cancelled'
                  ? 'This transfer was cancelled.'
                  : 'This request is awaiting SME signature.'
            }
          </p>
          ${ComponentBuilder.button({
            children: 'Back to Requests',
            onClick: "window.location.href='/dta/requests'",
            variant: 'secondary',
            className: 'w-full',
          })}
        </div>
      `,
    });
  }

  if (request.status === 'active_transfer') {
    return ComponentBuilder.card({
      children: `
        <div class="p-6 pb-0">
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Transfer Management</h3>
        </div>
        <div class="p-6 pt-4 space-y-4">
          <div class="bg-[var(--info)]/10 border border-[var(--info)]/20 p-4 rounded-lg">
            <p class="text-sm text-[var(--foreground)] mb-2">Active transfer in progress. Section 4 procedures in effect.</p>
            <p class="text-xs text-[var(--muted-foreground)]">Conduct AV scans, complete transfer, and sign off.</p>
          </div>
          ${ComponentBuilder.primaryButton({
            children: 'Manage Transfer',
            onClick: `manageTransfer(${request.id})`,
            className: 'w-full justify-center',
          })}
        </div>
      `,
    });
  }

  // pending_dta status
  return ComponentBuilder.card({
    children: `
      <div class="p-6 pb-0">
        <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">DTA Actions</h3>
      </div>
      <div class="p-6 pt-4 space-y-4">
        <div class="bg-[var(--warning)]/10 border border-[var(--warning)]/20 p-4 rounded-lg">
          <p class="text-sm text-[var(--foreground)] mb-2">This request is ready for DTA action.</p>
          <p class="text-xs text-[var(--muted-foreground)]">Review the transfer details and initiate the transfer process.</p>
        </div>
        ${ComponentBuilder.primaryButton({
          children: 'Initiate Transfer',
          onClick: `initiateTransfer(${request.id})`,
          className: 'w-full justify-center',
        })}
      </div>
    `,
  });
}

function renderRequestorInfo(request: DbRow): string {
  return ComponentBuilder.card({
    children: `
      <div class="p-6 pb-4">
        <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Requestor Information</h3>
      </div>
      <div class="p-6 pt-0 space-y-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center">
            ${UserIcon({ size: 20 })}
          </div>
          <div>
            <p class="text-sm font-medium text-[var(--foreground)]">${request.requestor_name || 'Unknown'}</p>
            <p class="text-xs text-[var(--muted-foreground)]">${request.requestor_email}</p>
          </div>
        </div>
        ${
          request.requestor_org
            ? `
          <div>
            <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Organization</label>
            <p class="text-sm text-[var(--foreground)] mt-1">${request.requestor_org}</p>
          </div>
        `
            : ''
        }
        ${
          request.dta_name
            ? `
          <div class="border-t border-[var(--border)] pt-4">
            <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Assigned DTA</label>
            <div class="flex items-center gap-3 mt-2">
              <div class="w-8 h-8 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-xs font-medium">
                ${(request.dta_name as string)
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')}
              </div>
              <div>
                <p class="text-sm font-medium text-[var(--foreground)]">${(request.dta_name as string)}</p>
                <p class="text-xs text-[var(--muted-foreground)]">${request.dta_email || 'No email available'}</p>
              </div>
            </div>
            ${
              request.drive_serial
                ? `
              <div class="mt-3 p-3 bg-[var(--muted)] rounded-md">
                <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Assigned Drive</label>
                <p class="text-sm font-medium text-[var(--foreground)] mt-1">${request.drive_serial}</p>
                <p class="text-xs text-[var(--muted-foreground)]">${request.drive_type} ${request.drive_model} - ${request.drive_status}</p>
              </div>
            `
                : ''
            }
          </div>
        `
            : `
          <div class="border-t border-[var(--border)] pt-4">
            <p class="text-sm text-[var(--muted-foreground)]">No DTA assigned yet</p>
          </div>
        `
        }
      </div>
    `,
  });
}

function renderMetadata(request: DbRow): string {
  return ComponentBuilder.card({
    children: `
      <div class="p-6 pb-4">
        <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Request Metadata</h3>
      </div>
      <div class="p-6 pt-0 space-y-3">
        <div>
          <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Request ID</label>
          <p class="text-sm font-mono text-[var(--foreground)] mt-1">#${request.id}</p>
        </div>
        <div>
          <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Created</label>
          <p class="text-sm text-[var(--foreground)] mt-1 flex items-center gap-2">
            ${CalendarIcon({ size: 14 })}
            ${new Date(request.created_at as number).toLocaleString()}
          </p>
        </div>
        ${
          request.updated_at
            ? `
          <div>
            <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Last Updated</label>
            <p class="text-sm text-[var(--foreground)] mt-1">${new Date(request.updated_at as number).toLocaleString()}</p>
          </div>
        `
            : ''
        }
      </div>
    `,
  });
}

function renderNotFound(user: DTAUser): string {
  const content = `
    <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-12 text-center">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--muted)] mb-4">
        ${AlertTriangleIcon({ size: 32, color: 'var(--destructive)' })}
      </div>
      <h3 class="text-xl font-semibold text-[var(--foreground)] mb-2">Request Not Found</h3>
      <p class="text-[var(--muted-foreground)] mb-6">The requested AFT request could not be found.</p>
      ${ComponentBuilder.primaryButton({
        children: 'Back to Requests',
        onClick: "window.location.href='/dta/requests'",
      })}
    </div>
  `;

  return DTANavigation.renderLayout('Request Not Found', '', user, '/dta/request', content);
}

function getScript(): string {
  return `
    function initiateTransfer(requestId) {
      if (confirm('Are you sure you want to initiate this transfer? This will activate Section 4 procedures.')) {
        fetch('/api/dta/requests/' + requestId + '/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert('Transfer initiated successfully! Moving to active transfer.');
            window.location.reload();
          } else {
            alert('Error initiating transfer: ' + data.error);
          }
        })
        .catch(error => {
          console.error('Error:', error);
          alert('Failed to initiate transfer. Please try again.');
        });
      }
    }
    
    function manageTransfer(requestId) {
      // Navigate to active transfers page
      window.location.href = '/dta/active';
    }
    
    function showTransferManagementModal(request, transferStatus) {
      // Provide default values for transferStatus to prevent undefined errors
      const status = transferStatus || {};
      const originationScan = status.origination_scan_performed || false;
      const destinationScan = status.destination_scan_performed || false;
      const transferCompleted = status.transfer_completed || false;
      const dtaSignature = status.dta_signature || false;
      
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
              <p class="text-[var(--muted-foreground)]">Request #\${request.request_number || request.id} - Section 4 Procedures</p>
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
                    <span class="\${originationScan ? 'text-[var(--success)]' : 'text-[var(--muted-foreground)]'}">
                      \${originationScan ? '✓ Completed' : '○ Pending'}
                    </span>
                    \${!originationScan ? \`
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
                    <span class="\${destinationScan ? 'text-[var(--success)]' : 'text-[var(--muted-foreground)]'}">
                      \${destinationScan ? '✓ Completed' : '○ Pending'}
                    </span>
                    \${!destinationScan ? \`
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
                  <div class="text-[var(--foreground)]">\${transferCompleted ? 'Completed' : 'In Progress'}</div>
                </div>
                \${originationScan && destinationScan && !transferCompleted ? \`
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
                  <div class="text-[var(--foreground)]">\${dtaSignature ? 'Signed' : 'Pending'}</div>
                </div>
                \${transferCompleted && !dtaSignature ? \`
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
      const filesScanned = prompt('How many files were scanned?', '0');
      const threatsFound = prompt('How many threats were found?', '0');
      
      if (filesScanned !== null && threatsFound !== null) {
        fetch('/api/dta/requests/' + requestId + '/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            scanType, 
            filesScanned: parseInt(filesScanned) || 0, 
            threatsFound: parseInt(threatsFound) || 0 
          })
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert(scanType.charAt(0).toUpperCase() + scanType.slice(1) + ' scan recorded successfully!');
            window.location.reload();
          } else {
            alert('Failed to record scan: ' + data.error);
          }
        })
        .catch(error => {
          console.error('Error:', error);
          alert('Failed to record scan.');
        });
      }
    }
    
    function completeTransfer(requestId) {
      if (confirm('Are you sure you want to mark this transfer as complete?')) {
        const filesTransferred = prompt('How many files were transferred?');
        const smeUserId = prompt('Enter SME User ID for Two-Person Integrity:');
        
        if (filesTransferred && smeUserId) {
          fetch('/api/dta/requests/' + requestId + '/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              filesTransferred: parseInt(filesTransferred) || 0,
              smeUserId: parseInt(smeUserId),
              tpiMaintained: true
            })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert('Transfer marked as complete!');
              window.location.reload();
            } else {
              alert('Failed to complete transfer: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error:', error);
            alert('Failed to complete transfer.');
          });
        }
      }
    }
    
    function signDTA(requestId) {
      if (confirm('Are you sure you want to sign this request as DTA? This will move the request to SME signature.')) {
        fetch('/api/dta/requests/' + requestId + '/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert('DTA signature recorded! Request moved to SME signature.');
            window.location.reload();
          } else {
            alert('Failed to record DTA signature: ' + data.error);
          }
        })
        .catch(error => {
          console.error('Error:', error);
          alert('Failed to record DTA signature.');
        });
      }
    }
  `;
}

export const DTARequestReviewPage = {
  render,
  getScript,
};
