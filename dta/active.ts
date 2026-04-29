// DTA Active Transfers - Enhanced Professional UI

import { getDb } from '../lib/database-bun';
import { DTANavigation, type DTAUser } from './dta-nav';

async function render(user: DTAUser, _userId: number): Promise<string> {
  const db = getDb();

  // Get active transfers
  const activeTransfers = (await db
    .query(`
    SELECT 
      id, request_number, requestor_name, requestor_email,
      source_system, source_location, classification,
      origination_scan_status, origination_files_scanned,
      destination_scan_status, destination_files_scanned,
      transfer_completed_date, dta_signature_date,
      created_at, updated_at
    FROM aft_requests
    WHERE status = 'active_transfer'
    ORDER BY updated_at DESC
  `)
    .all()) as any[];

  const content = `
    <div class="dashboard-main">
      <div class="space-y-6">
        <div class="status-card">
          <h1 class="text-2xl font-bold mb-2">Active Transfers - Section 4 Procedures</h1>
          <p class="text-muted-foreground">Record AV scan results, perform transfers, and complete DTA signature workflow</p>
        </div>
        
        ${buildActiveTransfersTable(activeTransfers)}
      </div>
      ${buildScanModal()}
    </div>
  `;

  return DTANavigation.renderLayout(
    'Active Transfers',
    'Section 4 Transfer Procedures',
    user,
    '/dta/active',
    content,
  );
}

function buildActiveTransfersTable(transfers: any[]): string {
  if (transfers.length === 0) {
    return `
      <div class="status-card text-center">
        <div class="text-4xl mb-4">🔄</div>
        <h3 class="text-lg font-medium mb-2">No Active Transfers</h3>
        <p class="text-muted-foreground mb-4">No transfers are currently in active status.</p>
      </div>
    `;
  }

  // Transform transfers data for enhanced table
  const tableData = transfers.map((transfer) => ({
    id: transfer.id,
    request_number: transfer.request_number,
    requestor_name: transfer.requestor_name || transfer.requestor_email,
    source_system: transfer.source_system,
    source_location: transfer.source_location,
    classification: transfer.classification || 'UNCLASSIFIED',
    origination_scan_status: transfer.origination_scan_status || 'pending',
    origination_files_scanned: transfer.origination_files_scanned,
    destination_scan_status: transfer.destination_scan_status || 'pending',
    destination_files_scanned: transfer.destination_files_scanned,
    transfer_completed: !!transfer.transfer_completed_date,
    dta_signature: !!transfer.dta_signature_date,
  }));

  // Enhanced table columns with professional styling
  const columns = [
    {
      key: 'request_number',
      label: 'Request Details',
      render: (_value: any, row: any) => `
        <div class="flex flex-col space-y-1">
          <div class="font-semibold text-sm text-[var(--foreground)]">${row.request_number}</div>
          <div class="text-xs text-[var(--muted-foreground)]">${row.requestor_name}</div>
        </div>
      `,
    },
    {
      key: 'systems',
      label: 'Transfer Route',
      render: (_value: any, row: any) => `
        <div class="flex flex-col space-y-1">
          <div class="text-sm font-medium">${row.source_system || 'Source'} → ${row.source_location || 'Destination'}</div>
          <div class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[var(--accent)] text-[var(--accent-foreground)]">
            ${row.classification}
          </div>
        </div>
      `,
    },
    {
      key: 'av_scan_workflow',
      label: 'AV Scan Status',
      render: (_value: any, row: any) => {
        return `
          <div class="space-y-3">
            <div class="grid grid-cols-1 gap-2">
              <div class="flex items-center justify-between p-2 rounded-md border border-[var(--border)] bg-[var(--card)]">
                <div class="flex items-center space-x-2">
                  <div class="flex items-center space-x-1">
                    <span class="w-3 h-3 rounded-full ${row.origination_scan_status === 'clean' ? 'bg-green-500' : row.origination_scan_status === 'infected' ? 'bg-red-500' : 'bg-gray-400'}"></span>
                    <span class="text-xs font-medium">Origin</span>
                  </div>
                  ${row.origination_files_scanned ? `<span class="text-xs text-[var(--muted-foreground)]">${row.origination_files_scanned} files</span>` : ''}
                </div>
                <span class="text-xs font-semibold ${row.origination_scan_status === 'clean' ? 'text-green-600' : row.origination_scan_status === 'infected' ? 'text-red-600' : 'text-gray-500'}">
                  ${row.origination_scan_status === 'clean' ? 'CLEAN' : row.origination_scan_status === 'infected' ? 'INFECTED' : 'PENDING'}
                </span>
              </div>
              
              <div class="flex items-center justify-between p-2 rounded-md border border-[var(--border)] bg-[var(--card)]">
                <div class="flex items-center space-x-2">
                  <div class="flex items-center space-x-1">
                    <span class="w-3 h-3 rounded-full ${row.destination_scan_status === 'clean' ? 'bg-green-500' : row.destination_scan_status === 'infected' ? 'bg-red-500' : 'bg-gray-400'}"></span>
                    <span class="text-xs font-medium">Destination</span>
                  </div>
                  ${row.destination_files_scanned ? `<span class="text-xs text-[var(--muted-foreground)]">${row.destination_files_scanned} files</span>` : ''}
                </div>
                <span class="text-xs font-semibold ${row.destination_scan_status === 'clean' ? 'text-green-600' : row.destination_scan_status === 'infected' ? 'text-red-600' : 'text-gray-500'}">
                  ${row.destination_scan_status === 'clean' ? 'CLEAN' : row.destination_scan_status === 'infected' ? 'INFECTED' : 'PENDING'}
                </span>
              </div>
            </div>
            
            <button class="w-full px-3 py-2 text-xs font-medium rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] transition-colors duration-200 flex items-center justify-center space-x-1" 
                    onclick="openScanModal(${row.id}, '${row.request_number}')">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <span>Record Scan</span>
            </button>
          </div>
        `;
      },
    },
    {
      key: 'transfer_workflow',
      label: 'Transfer Actions',
      render: (_value: any, row: any) => {
        const canTransfer = !!row.origination_scan_status && !!row.destination_scan_status;
        const transferComplete = row.transfer_completed;
        const dtaSigned = row.dta_signature;

        if (dtaSigned) {
          return `
            <div class="flex flex-col space-y-2">
              <div class="flex items-center space-x-2 p-2 rounded-md bg-green-50 border border-green-200">
                <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"></path>
                </svg>
                <span class="text-xs font-medium text-green-800">DTA Signed</span>
              </div>
              <div class="text-xs text-[var(--muted-foreground)] text-center">Awaiting SME Review</div>
            </div>
          `;
        } else {
          return `
            <div class="flex flex-col space-y-2">
              <div class="flex flex-col space-y-1">
                <div class="text-xs text-[var(--muted-foreground)] mb-1">
                  Status: ${transferComplete ? 'Transfer Complete' : canTransfer ? 'Ready for Transfer' : 'Awaiting AV Scans'}
                </div>
                
                ${
                  !canTransfer
                    ? `
                  <div class="p-2 rounded-md bg-yellow-50 border border-yellow-200">
                    <div class="flex items-center space-x-1">
                      <svg class="w-3 h-3 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                      </svg>
                      <span class="text-xs font-medium text-yellow-800">Waiting for AV scans to be recorded</span>
                    </div>
                  </div>
                `
                    : ''
                }
              </div>
              
              <button class="w-full px-3 py-2 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200 flex items-center justify-center space-x-1" 
                      onclick="window.location.href='/dta/transfer/${row.id}'">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                </svg>
                <span>Manage Transfer</span>
              </button>
            </div>
          `;
        }
      },
    },
  ];

  // Create enhanced professional table
  const table = buildProfessionalTable(columns, tableData);

  return `
    <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-sm">
      <div class="px-6 py-4 border-b border-[var(--border)]">
        <h2 class="text-lg font-semibold text-[var(--foreground)]">Active Transfer Queue</h2>
        <p class="text-sm text-[var(--muted-foreground)]">${tableData.length} transfer${tableData.length !== 1 ? 's' : ''} requiring attention</p>
      </div>
      <div class="overflow-hidden">
        ${table}
      </div>
    </div>
  `;
}

function buildProfessionalTable(columns: any[], data: any[]): string {
  if (data.length === 0) {
    return `
      <div class="text-center py-12">
        <div class="text-4xl mb-4">📋</div>
        <h3 class="text-lg font-medium mb-2">No Active Transfers</h3>
        <p class="text-[var(--muted-foreground)]">All transfers have been completed or are awaiting approval.</p>
      </div>
    `;
  }

  const headerRow = columns
    .map(
      (col) =>
        `<th class="px-6 py-4 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider border-b border-[var(--border)]">${col.label}</th>`,
    )
    .join('');

  const dataRows = data
    .map((row, _index) => {
      const cells = columns
        .map((col) => {
          const value = col.render ? col.render(row[col.key], row) : row[col.key];
          return `<td class="px-6 py-4 border-b border-[var(--border)] align-top">${value}</td>`;
        })
        .join('');
      return `<tr class="hover:bg-[var(--accent)]/50 transition-colors duration-150">${cells}</tr>`;
    })
    .join('');

  return `
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-[var(--border)]">
        <thead class="bg-[var(--muted)]/30">
          <tr>${headerRow}</tr>
        </thead>
        <tbody class="bg-[var(--card)] divide-y divide-[var(--border)]">
          ${dataRows}
        </tbody>
      </table>
    </div>
  `;
}

function buildScanModal(): string {
  return `
    <div id="scanModal" class="fixed inset-0 bg-black/50 items-center justify-center z-50" style="display:none;">
      <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl w-full max-w-md mx-4">
        <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 class="text-lg font-semibold">Record AV Scan Results</h2>
          <button aria-label="Close" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl leading-none" onclick="closeScanModal()">&times;</button>
        </div>
        <div class="p-6">
          <form id="scanForm" onsubmit="submitScanForm(event)">
            <input type="hidden" id="scanRequestId" name="requestId">
            <div class="mb-4 p-3 rounded-md bg-[var(--accent)]/10 border border-[var(--border)]">
              <p class="text-sm text-[var(--foreground)]">Request: <strong id="scanRequestNumber" class="font-semibold"></strong></p>
            </div>
            
            <div class="space-y-4">
              <div>
                <label for="scanType" class="block text-sm font-medium mb-2">Media Type</label>
                <select id="scanType" name="scanType" class="form-input-enhanced w-full px-3 py-2 border border-[var(--border)] rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required>
                  <option value="">Select Media...</option>
                  <option value="origination">Origin Media</option>
                  <option value="destination">Destination Media</option>
                </select>
              </div>

              <div>
                <label for="scanResult" class="block text-sm font-medium mb-2">AV Scan Result</label>
                <select id="scanResult" name="scanResult" class="form-input-enhanced w-full px-3 py-2 border border-[var(--border)] rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required>
                  <option value="">Select Result...</option>
                  <option value="clean">Clean</option>
                  <option value="infected">Infected</option>
                </select>
              </div>

              <div>
                <label for="filesScanned" class="block text-sm font-medium mb-2">Number of Files Scanned</label>
                <input type="number" id="filesScanned" name="filesScanned" class="form-input-enhanced w-full px-3 py-2 border border-[var(--border)] rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500" min="0" required>
              </div>
            </div>
            
            <div class="mt-6 flex justify-end gap-3">
              <button type="button" class="px-4 py-2 text-sm font-medium text-[var(--foreground)] bg-[var(--background)] border border-[var(--border)] rounded-md hover:bg-[var(--accent)] transition-colors duration-200" onclick="closeScanModal()">Cancel</button>
              <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors duration-200">Submit Scan</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

function getScript(): string {
  return `
    function openScanModal(requestId, requestNumber) {
      document.getElementById('scanRequestId').value = requestId;
      document.getElementById('scanRequestNumber').textContent = requestNumber;
      const modal = document.getElementById('scanModal');
      modal.style.display = 'flex';
      // Close on outside click
      modal.addEventListener('click', function onBackdrop(e) {
        if (e.target === modal) { closeScanModal(); modal.removeEventListener('click', onBackdrop); }
      });
    }

    function closeScanModal() {
      const modal = document.getElementById('scanModal');
      modal.style.display = 'none';
      document.getElementById('scanForm').reset();
    }

    function submitScanForm(event) {
      event.preventDefault();
      const form = event.target;
      const requestId = form.requestId.value;
      const scanType = form.scanType.value;
      const scanResult = form.scanResult.value;
      const filesScanned = parseInt(form.filesScanned.value);

      if (isNaN(filesScanned) || filesScanned < 0) {
          alert('Please enter a valid number of files scanned');
          return;
      }

      if (confirm(\`Record \${scanType} media scan as \${scanResult.toUpperCase()} with \${filesScanned} files scanned?\`)) {
          fetch(\`/api/dta/requests/\${requestId}/scan\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  scanType: scanType,
                  result: scanResult,
                  filesScanned: filesScanned,
                  notes: \`\${scanType.charAt(0).toUpperCase() + scanType.slice(1)} media AV scan: \${scanResult} (\${filesScanned} files scanned)\`
              })
          })
          .then(response => response.json())
          .then(data => {
              if (data.success) {
                  alert(\`\${scanType.charAt(0).toUpperCase() + scanType.slice(1)} scan recorded as \${scanResult}!\`);
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
    }
    
    // Accessibility: close on Escape
    document.addEventListener('keydown', function(e) { 
      if (e.key === 'Escape') { 
        const m = document.getElementById('scanModal'); 
        if (m && m.style.display !== 'none') closeScanModal(); 
      } 
    });
  `;
}

export const DTAActiveTransfers = {
  render,
  getScript,
};
