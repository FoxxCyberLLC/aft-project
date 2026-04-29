// DTA Transfer Form - Step-by-step transfer workflow with proper form interface

import { CACPinModal } from '../components/cac-pin-modal';
import { ShieldIcon } from '../components/icons';
import { CACSignatureManager } from '../lib/cac-signature';
import { type DbRow, getDb } from '../lib/database-bun';
import { DTANavigation, type DTAUser } from './dta-nav';

async function render(user: DTAUser, requestId: string, userId: number): Promise<string> {
  const db = getDb();

  // Get request details
  const request = (await db
    .query(`
    SELECT 
      id, request_number, requestor_name, requestor_email,
      source_system, source_location, dest_system, dest_location,
      classification, data_size, files_list, justification,
      origination_scan_status, origination_files_scanned,
      destination_scan_status, destination_files_scanned,
      transfer_completed_date, dta_signature_date,
      assigned_sme_id, status, created_at, updated_at
    FROM aft_requests
    WHERE id = ? AND dta_id = ?
  `)
    .get(requestId, userId)) as DbRow;

  if (!request) {
    return renderNotFound(user);
  }

  // Get available SME users
  const smeUsers = (await db
    .query(`
    SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    WHERE ur.role = 'sme' AND u.is_active = TRUE
    ORDER BY u.last_name, u.first_name
  `)
    .all()) as DbRow[];

  // Get existing CAC signatures for this request
  const cacSignatures = await CACSignatureManager.getRequestSignatures(parseInt(requestId, 10));

  const content = buildTransferForm(request, smeUsers, cacSignatures);

  return DTANavigation.renderLayout(
    'Transfer Management',
    `Section 4 Procedures - Request ${request.request_number}`,
    user,
    '/dta/active',
    content,
  );
}

function buildTransferForm(request: DbRow, smeUsers: DbRow[], cacSignatures: DbRow[]): string {
  const currentStep = getCurrentStep(request);
  const submitText = getSubmitButtonText(currentStep, request);
  const submitButton = submitText
    ? `
              <button type="submit" 
                      class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90">
                ${submitText}
              </button>
            `
    : '';

  return `
    <div class="max-w-4xl mx-auto space-y-6">
      <!-- Request Header -->
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
        <div class="flex items-start justify-between">
          <div>
            <h1 class="text-2xl font-bold text-[var(--foreground)]">Transfer Management</h1>
            <p class="text-[var(--muted-foreground)]">Request ${request.request_number} - Section 4 Procedures</p>
          </div>
          <div class="text-right">
            <div class="text-sm font-medium text-[var(--foreground)]">${request.requestor_name}</div>
            <div class="text-xs text-[var(--muted-foreground)]">${request.classification}</div>
          </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-[var(--border)]">
          <div>
            <label class="text-sm font-medium text-[var(--muted-foreground)]">Transfer Route</label>
            <div class="text-[var(--foreground)]">${request.source_system || 'Source'} → ${request.dest_system || request.dest_location || 'Destination'}</div>
          </div>
          <div>
            <label class="text-sm font-medium text-[var(--muted-foreground)]">File Details</label>
            <div class="text-[var(--foreground)]">Size: ${request.data_size || 'Unknown size'}</div>
          </div>
        </div>
      </div>

      <!-- Progress Steps -->
      ${buildProgressSteps(currentStep)}

      <!-- Transfer Form -->
      <form id="transferForm" class="space-y-6">
        <input type="hidden" name="requestId" value="${request.id}">
        
        ${buildAVScanSection(request, currentStep)}
        ${buildSignatureSection(request, smeUsers, currentStep)}
        ${renderExistingSignatures(cacSignatures)}
        
        <!-- Form Actions -->
        <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
          <div class="flex items-center justify-between">
            <button type="button" onclick="window.location.href='/dta/active'" 
                    class="px-4 py-2 border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--muted)]">
              Back to Active Transfers
            </button>
            <div class="flex gap-2">
              <button type="button" onclick="saveProgress()" 
                      class="px-4 py-2 border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--muted)]">
                Save Progress
              </button>
              ${submitButton}
            </div>
          </div>
        </div>
      </form>
    </div>
    
    <!-- CAC PIN Modal -->
    ${CACPinModal.render()}
  `;
}

function getCurrentStep(request: DbRow): number {
  if (!request.origination_scan_status || !request.destination_scan_status) return 1;
  if (!request.dta_signature_date) return 2;
  return 3; // Complete
}

function isStepAccessible(stepNumber: number, request: DbRow): boolean {
  const currentStep = getCurrentStep(request);
  // Unlock signature step as soon as both AV scans are recorded
  const scansRecorded = !!request.origination_scan_status && !!request.destination_scan_status;
  if (stepNumber === 2 && scansRecorded) return true;
  return stepNumber <= currentStep;
}

function buildProgressSteps(currentStep: number): string {
  const steps = [
    {
      id: 1,
      title: 'AV Scan Verification',
      description: 'Record origination and destination scan results',
    },
    {
      id: 2,
      title: 'Sign & Complete Transfer',
      description: 'Sign transfer, complete files, and forward to SME',
    },
    { id: 3, title: 'Complete', description: 'Transfer forwarded to SME for verification' },
  ];

  const stepsHtml = steps
    .map((step) => {
      const isActive = step.id === currentStep;
      const isComplete = step.id < currentStep;
      const statusClass = isComplete
        ? 'bg-[var(--success)] text-white'
        : isActive
          ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
          : 'bg-[var(--muted)] text-[var(--muted-foreground)]';

      return `
      <div class="flex items-center ${step.id < steps.length ? 'flex-1' : ''}">
        <div class="flex items-center">
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${statusClass}">
            ${isComplete ? '✓' : step.id}
          </div>
          <div class="ml-3">
            <div class="text-sm font-medium text-[var(--foreground)]">${step.title}</div>
            <div class="text-xs text-[var(--muted-foreground)]">${step.description}</div>
          </div>
        </div>
        ${step.id < steps.length ? '<div class="flex-1 h-px bg-[var(--border)] mx-4"></div>' : ''}
      </div>
    `;
    })
    .join('');

  return `
    <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
      <div class="flex items-center">
        ${stepsHtml}
      </div>
    </div>
  `;
}

function buildAVScanSection(request: DbRow, currentStep: number): string {
  const isActive = currentStep === 1;
  const isComplete = currentStep > 1;

  return `
    <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6 ${!isActive && !isComplete ? 'opacity-50' : ''}">
      <div class="flex items-center gap-2 mb-4">
        <div class="w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
          isComplete
            ? 'bg-[var(--success)] text-white'
            : isActive
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
              : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
        }">
          ${isComplete ? '✓' : '1'}
        </div>
        <h3 class="text-lg font-semibold text-[var(--foreground)]">Anti-Virus Scan Verification</h3>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Origination Scan -->
        <div class="space-y-3">
          <label class="text-sm font-medium text-[var(--foreground)]">Origination Media Scan</label>
          <div class="space-y-2">
            <select name="originationScanResult" class="w-full p-2 border border-[var(--border)] rounded-md" ${!isActive ? 'disabled' : ''}>
              <option value="">Select scan result...</option>
              <option value="clean" ${request.origination_scan_status === 'clean' ? 'selected' : ''}>Clean</option>
              <option value="infected" ${request.origination_scan_status === 'infected' ? 'selected' : ''}>Infected</option>
            </select>
            <input type="number" name="originationFilesScanned" placeholder="Number of files scanned" 
                   class="w-full p-2 border border-[var(--border)] rounded-md" 
                   value="${request.origination_files_scanned || ''}" ${!isActive ? 'disabled' : ''} min="0">
          </div>
          ${
            request.origination_scan_status
              ? `
            <div class="text-xs p-2 rounded ${request.origination_scan_status === 'clean' ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--destructive)]/10 text-[var(--destructive)]'}">
              Status: ${(request.origination_scan_status as string).toUpperCase()} ${request.origination_files_scanned ? `(${request.origination_files_scanned} files)` : ''}
            </div>
          `
              : ''
          }
        </div>

        <!-- Destination Scan -->
        <div class="space-y-3">
          <label class="text-sm font-medium text-[var(--foreground)]">Destination Media Scan</label>
          <div class="space-y-2">
            <select name="destinationScanResult" class="w-full p-2 border border-[var(--border)] rounded-md" ${!isActive ? 'disabled' : ''}>
              <option value="">Select scan result...</option>
              <option value="clean" ${request.destination_scan_status === 'clean' ? 'selected' : ''}>Clean</option>
              <option value="infected" ${request.destination_scan_status === 'infected' ? 'selected' : ''}>Infected</option>
            </select>
            <input type="number" name="destinationFilesScanned" placeholder="Number of files scanned" 
                   class="w-full p-2 border border-[var(--border)] rounded-md" 
                   value="${request.destination_files_scanned || ''}" ${!isActive ? 'disabled' : ''} min="0">
          </div>
          ${
            request.destination_scan_status
              ? `
            <div class="text-xs p-2 rounded ${request.destination_scan_status === 'clean' ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--destructive)]/10 text-[var(--destructive)]'}">
              Status: ${(request.destination_scan_status as string).toUpperCase()} ${request.destination_files_scanned ? `(${request.destination_files_scanned} files)` : ''}
            </div>
          `
              : ''
          }
        </div>
      </div>

      <div class="mt-4">
        <label class="text-sm font-medium text-[var(--foreground)]">Scan Notes</label>
        <textarea name="scanNotes" rows="2" class="w-full p-2 border border-[var(--border)] rounded-md mt-1" 
                  placeholder="Additional notes about the AV scan results..." ${!isActive ? 'disabled' : ''}></textarea>
      </div>
    </div>
  `;
}

function buildSignatureSection(request: DbRow, smeUsers: DbRow[], currentStep: number): string {
  const _isActive = currentStep === 2;
  const isComplete = currentStep > 2;
  const isAccessible = isStepAccessible(2, request);
  const scansRecorded = !!request.origination_scan_status && !!request.destination_scan_status;

  return `
    <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6 ${!isAccessible ? 'opacity-50' : ''}">
      <div class="flex items-center gap-2 mb-4">
        <div class="w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
          isComplete
            ? 'bg-[var(--success)] text-white'
            : isAccessible
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
              : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
        }">
          ${isComplete ? '✓' : '2'}
        </div>
        <h3 class="text-lg font-semibold text-[var(--foreground)]">Sign Transfer & Complete (Forward to SME)</h3>
        ${
          scansRecorded && !isComplete
            ? `
          <div class="ml-auto">
            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[var(--info)]/10 text-[var(--info)]">
              Ready for Signature
            </span>
          </div>
        `
            : ''
        }
      </div>

      <div class="space-y-4">
        <!-- Transfer Information -->
        <div class="bg-[var(--muted)]/20 rounded-lg p-4 border border-[var(--border)]">
          <h4 class="text-sm font-semibold text-[var(--foreground)] mb-3">File Transfer Completion</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium text-[var(--foreground)]">Files Transferred</label>
              <input type="number" name="filesTransferred"
                     class="w-full p-2 border border-[var(--border)] rounded-md mt-1"
                     ${!isAccessible ? 'disabled' : ''}
                     placeholder="Number of files transferred" min="1" required>
            </div>
            <div>
              <label class="text-sm font-medium text-[var(--foreground)]">Transfer Date/Time</label>
              <input type="datetime-local" name="transferDateTime"
                     class="w-full p-2 border border-[var(--border)] rounded-md mt-1"
                     ${!isAccessible ? 'disabled' : ''}>
            </div>
          </div>
          <div class="mt-3">
            <label class="text-sm font-medium text-[var(--foreground)]">Transfer Notes</label>
            <textarea name="transferNotes" rows="2" class="w-full p-2 border border-[var(--border)] rounded-md mt-1"
                      placeholder="Transfer completion notes, any issues encountered, etc." ${!isAccessible ? 'disabled' : ''}></textarea>
          </div>
        </div>

        <!-- SME Assignment -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-sm font-medium text-[var(--foreground)]">Assign SME for Two-Person Integrity</label>
            <select name="smeUserId" class="w-full p-2 border border-[var(--border)] rounded-md mt-1" ${!isAccessible ? 'disabled' : ''} required>
              <option value="">Select SME...</option>
              ${smeUsers
                .map(
                  (sme) => `
                <option value="${sme.id}" ${request.assigned_sme_id === sme.id ? 'selected' : ''}>
                  ${sme.first_name} ${sme.last_name} (${sme.email})
                </option>
              `,
                )
                .join('')}
            </select>
          </div>
          <div>
            <label class="text-sm font-medium text-[var(--foreground)]">DTA Signature Date/Time</label>
            <input type="datetime-local" name="dtaSignatureDateTime"
                   class="w-full p-2 border border-[var(--border)] rounded-md mt-1"
                   ${!isAccessible ? 'disabled' : ''} value="${request.dta_signature_date ? new Date((request.dta_signature_date as number) * 1000).toISOString().slice(0, 16) : ''}">
          </div>
        </div>

        <div>
          <label class="text-sm font-medium text-[var(--foreground)]">DTA Signature Notes</label>
          <textarea name="dtaSignatureNotes" id="dta-signature-notes" rows="3" class="w-full p-2 border border-[var(--border)] rounded-md mt-1" 
                    placeholder="DTA certification notes, compliance verification, etc." ${!isAccessible ? 'disabled' : ''}></textarea>
        </div>
        
        ${
          isAccessible && !isComplete
            ? `
          <div class="space-y-3">
            <div id="cac-signature-status" class="bg-[var(--info)]/10 border border-[var(--info)]/20 rounded-lg p-4">
              <p class="text-sm text-[var(--info)] font-medium mb-2">CAC Digital Signature</p>
              <p class="text-xs text-[var(--muted-foreground)]">
                Checking for CAC certificate...
              </p>
            </div>
            <label class="text-sm font-medium text-[var(--foreground)]">Signature Method</label>
            <div class="flex gap-3">
              <button type="button"
                      id="sign-cac-btn"
                      onclick="signWithCACDirect(${request.id})"
                      class="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90"
                      disabled>
                ${ShieldIcon({ size: 16 })}
                Sign with CAC
              </button>
              <button type="button" onclick="signManually(${request.id})"
                      class="px-4 py-2 border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--muted)]">
                Manual Signature
              </button>
            </div>
          </div>
        `
            : ''
        }

        ${
          isAccessible && !isComplete
            ? `
          <div class="bg-[var(--info)]/10 border border-[var(--info)]/20 rounded-lg p-4">
            <div class="text-sm text-[var(--info)]">
              ℹ️ By signing this transfer, you certify that all Section 4 procedures and file transfers have been completed according to AFT requirements. The transfer will be immediately forwarded to the assigned SME for Two-Person Integrity verification.
            </div>
          </div>
        `
            : ''
        }

        ${
          isComplete
            ? `
          <div class="text-xs p-2 rounded bg-[var(--success)]/10 text-[var(--success)]">
            ✓ Transfer completed and signed on ${new Date((request.dta_signature_date as number) * 1000).toLocaleString()}. Forwarded to SME for verification.
          </div>
        `
            : ''
        }
      </div>
    </div>
  `;
}

function getSubmitButtonText(currentStep: number, _request: DbRow): string {
  switch (currentStep) {
    case 1:
      return 'Record AV Scan Results';
    case 2:
      return 'Sign, Complete & Forward to SME';
    default:
      return '';
  }
}

function renderExistingSignatures(signatures: DbRow[]): string {
  if (!signatures || signatures.length === 0) {
    return '';
  }

  return `
    <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
      <div class="flex items-center gap-2 mb-4">
        ${ShieldIcon({ size: 20 })}
        <h3 class="text-lg font-semibold text-[var(--foreground)]">Digital Signature Chain</h3>
      </div>
      <div class="space-y-3">
        ${signatures
          .map((sig) => {
            const display = CACSignatureManager.formatSignatureForDisplay(sig);
            const roleLabel =
              sig.step_type === 'requestor_signature'
                ? 'Requestor'
                : sig.step_type === 'approver_approval'
                  ? 'ISSM Approver'
                  : sig.step_type === 'cpso_approval'
                    ? 'CPSO'
                    : sig.step_type === 'dta_signature'
                      ? 'DTA'
                      : sig.step_type || 'Signature';
            return `
            <div class="border border-[var(--border)] rounded-lg p-4 bg-[var(--muted)]">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full ${display.isValid ? 'bg-[var(--success)]' : 'bg-[var(--destructive)]'}"></div>
                  <span class="text-sm font-medium text-[var(--foreground)]">${display.signerName}</span>
                </div>
                <span class="text-xs font-medium text-[var(--primary)]">${roleLabel}</span>
              </div>
              <div class="text-xs text-[var(--muted-foreground)] space-y-1">
                <div>Signed: ${display.signedAt}</div>
                <div class="font-mono">${display.certificateInfo}</div>
              </div>
            </div>
          `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderNotFound(user: DTAUser): string {
  const content = `
    <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-12 text-center">
      <div class="text-4xl mb-4">🔍</div>
      <h2 class="text-xl font-semibold mb-2">Transfer Request Not Found</h2>
      <p class="text-[var(--muted-foreground)] mb-6">The requested transfer could not be found or you don't have access to it.</p>
      <button onclick="window.location.href='/dta/active'" 
              class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90">
        Back to Active Transfers
      </button>
    </div>
  `;

  return DTANavigation.renderLayout(
    'Transfer Not Found',
    'Request not found',
    user,
    '/dta/active',
    content,
  );
}

function getScript(): string {
  return `
    document.getElementById('transferForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const formData = new FormData(this);
      const data = Object.fromEntries(formData.entries());
      
      try {
        const response = await fetch('/api/dta/transfer-form', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
          alert('Transfer form updated successfully!');
          window.location.reload();
        } else {
          alert('Failed to update transfer: ' + result.error);
        }
      } catch (error) {
        console.error('Error submitting form:', error);
        alert('Failed to submit form. Please try again.');
      }
    });
    
    let cacCertificateInfo = null;

    // Auto-save when transfer completion fields are filled
    document.addEventListener('DOMContentLoaded', function() {
      checkCACCertificate();

      const transferDateField = document.querySelector('input[name="transferDateTime"]');
      const filesTransferredField = document.querySelector('input[name="filesTransferred"]');
      
      if (transferDateField && filesTransferredField) {
        const autoSaveTransfer = debounce(() => {
          if (transferDateField.value && filesTransferredField.value) {
            saveProgressSilent();
          }
        }, 2000);
        
        transferDateField.addEventListener('change', autoSaveTransfer);
        filesTransferredField.addEventListener('input', autoSaveTransfer);
      }
    });
    
    function debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }
    
    function saveProgress() {
      const form = document.getElementById('transferForm');
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      data.saveOnly = true;
      
      fetch('/api/dta/transfer-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          alert('Progress saved successfully!');
        } else {
          alert('Failed to save progress: ' + result.error);
        }
      })
      .catch(error => {
        console.error('Error saving progress:', error);
        alert('Failed to save progress. Please try again.');
      });
    }
    
    function saveProgressSilent() {
      const form = document.getElementById('transferForm');
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      data.saveOnly = true;
      
      fetch('/api/dta/transfer-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(response => response.json())
      .then(result => {
        if (!result.success) {
          console.warn('Auto-save failed:', result.error);
        }
      })
      .catch(error => {
        console.warn('Auto-save error:', error);
      });
    }

    function checkCACCertificate() {
      const statusElement = document.getElementById('cac-signature-status');
      const cacBtn = document.getElementById('sign-cac-btn');

      if (!statusElement) return; // Not on signature section

      // Check for client certificate
      fetch('/api/dta/cac-info')
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

            // Enable CAC button
            if (cacBtn) {
              cacBtn.disabled = false;
              cacBtn.className = cacBtn.className.replace('opacity-50', '');
            }

            console.log('CAC certificate available for DTA:', {
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

            console.log('No CAC certificate available for DTA');
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

    function signWithCACDirect(requestId) {
      if (!cacCertificateInfo) {
        alert('No CAC certificate available. Please ensure you are logged in with CAC authentication and refresh the page.');
        return;
      }

      const smeSelect = document.querySelector('select[name="smeUserId"]');
      const notes = document.getElementById('dta-signature-notes')?.value || '';

      if (!smeSelect || !smeSelect.value) {
        alert('Please select an SME for Two-Person Integrity verification.');
        return;
      }

      if (!confirm('Are you sure you want to sign this transfer with CAC digital signature?')) {
        return;
      }

      // Generate signature data using the pre-authenticated CAC
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

      // Submit CAC signature directly
      submitCACSignatureDirectly(requestId, signatureData, smeSelect.value, notes);
    }

    // Submit CAC signature directly using pre-authenticated CAC
    async function submitCACSignatureDirectly(requestId, signatureData, smeUserId, notes) {
      try {
        const response = await fetch('/api/dta/sign-transfer-cac/' + requestId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signature: signatureData.signature,
            certificate: signatureData.certificate,
            timestamp: signatureData.timestamp,
            algorithm: signatureData.algorithm,
            smeUserId: smeUserId,
            notes: notes
          })
        });

        const result = await response.json();

        if (result.success) {
          alert('Transfer signed with CAC signature successfully!');
          window.location.reload();
        } else {
          alert('Error signing transfer with CAC: ' + (result.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error submitting CAC signature:', error);
        alert('Failed to sign transfer with CAC. Please try again.');
      }
    }

    function signWithCAC(requestId) {
      // Store the request ID for CAC signing
      window.dtaSignRequestId = requestId;
      
      // Show the CAC PIN modal
      showCACPinModal(requestId);
    }
    
    function signManually(requestId) {
      const smeSelect = document.querySelector('select[name="smeUserId"]');
      const notes = document.getElementById('dta-signature-notes')?.value || '';
      
      if (!smeSelect || !smeSelect.value) {
        alert('Please select an SME before signing');
        return;
      }
      
      if (confirm('Are you sure you want to sign this transfer and assign it to the selected SME?')) {
        fetch('/api/dta/sign-transfer/' + requestId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            smeUserId: smeSelect.value,
            notes: notes,
            signatureMethod: 'manual'
          })
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert('Transfer signed successfully and forwarded to SME!');
            window.location.reload();
          } else {
            alert('Error signing transfer: ' + data.error);
          }
        });
      }
    }
    
    // Override the submit CAC signature function for DTA context
    async function submitCACSignature(requestId, signatureResult) {
      try {
        const smeSelect = document.querySelector('select[name="smeUserId"]');
        const notes = document.getElementById('dta-signature-notes')?.value || '';
        
        if (!smeSelect || !smeSelect.value) {
          showCACError('Please select an SME before signing');
          return;
        }
        
        const response = await fetch('/api/dta/sign-transfer-cac/' + requestId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signature: signatureResult.signature,
            certificate: signatureResult.certificate,
            timestamp: signatureResult.timestamp,
            algorithm: signatureResult.algorithm,
            smeUserId: smeSelect.value,
            notes: notes
          })
        });

        const result = await response.json();

        if (result.success) {
          closeCACPinModal();
          alert('Transfer signed with CAC signature and forwarded to SME!');
          window.location.reload();
        } else {
          showCACError('Server error: ' + result.error);
        }
      } catch (error) {
        console.error('Error submitting CAC signature:', error);
        showCACError('Failed to submit signature. Please try again.');
      }
    }
  `;
}

export const DTATransferForm = {
  render,
  getScript,
};
