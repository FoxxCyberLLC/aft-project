// AFT Request Creation Wizard - Sections I & II from ACDS Form v1.3

import { FormComponents } from '../components/ui/form-components';
import { getDb } from '../lib/database-bun';
import { RequestorNavigation, type RequestorUser } from './requestor-nav';

export interface AFTRequestDraft {
  // Section I
  media_control_number?: string;
  media_type?: string;

  // Section II
  source_is?: string;
  source_classification?: string;
  destination_is?: string;
  destination_classification?: string;
  media_disposition?: string;
  overall_classification?: string;
  transfer_type?: string;
  destination_file?: 'upload' | 'download';
  process_name?: string;
  procedure_document?: string;
  justification?: string;
  num_files?: number;
  files?: Array<{ name: string; type: string; classification: string }>;
  additional_file_list_attached?: boolean;
  media_transportation?: boolean;
  media_destination?: string;
  destination_poc?: string;
  destination_address?: string;
  media_encrypted?: boolean;
  destinations_json?: string;
}

async function render(user: RequestorUser, userId: number, draftId?: number): Promise<string> {
  const db = getDb();
  let existingDraft: any = null;

  // Load existing draft if editing
  if (draftId) {
    existingDraft = (await db
      .query('SELECT * FROM aft_requests WHERE id = ? AND requestor_id = ?')
      .get(draftId, userId)) as any;
    if (existingDraft) {
      // Parse files list if it exists
      if (existingDraft.files_list) {
        try {
          existingDraft.files = JSON.parse(existingDraft.files_list);
        } catch {
          existingDraft.files = [];
        }
      }
    }
  }

  // Status indicator
  const statusIndicator = existingDraft
    ? `
    <div class="mb-6 p-4 bg-[var(--muted)] rounded-lg border border-[var(--border)]">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="font-medium text-[var(--foreground)]">Request Status</h3>
          <p class="text-sm text-[var(--muted-foreground)]">
            ${existingDraft.status.toUpperCase()} - Last updated: ${new Date(existingDraft.updated_at * 1000).toLocaleString()}
          </p>
        </div>
        <div class="text-right">
          <div class="text-sm font-medium text-[var(--foreground)]">Request #</div>
          <div class="text-lg font-bold text-[var(--primary)]">${existingDraft.request_number}</div>
        </div>
      </div>
    </div>
  `
    : '';

  // Prepare initial destinations JSON from existing draft transfer_data
  const initialDestinationsJson = (() => {
    try {
      const td = existingDraft?.transfer_data ? JSON.parse(existingDraft.transfer_data) : null;
      const arr = td?.destinations || [];
      return JSON.stringify(arr);
    } catch {
      return '[]';
    }
  })();

  // Section I - Media Information
  const sectionI = `
    ${FormComponents.sectionHeader({
      title: 'Media Information',
      subtitle: 'Basic media identification and type',
      sectionNumber: 'I',
    })}
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      ${FormComponents.formField({
        label: 'Assigned Data Transfer Agent (DTA)',
        required: true,
        description: 'Select the DTA responsible for this transfer',
        children: FormComponents.select({
          name: 'dta_id',
          value: existingDraft?.dta_id?.toString() || '',
          placeholder: 'Select a DTA',
          required: true,
          options: [],
        }),
      })}
      
      ${FormComponents.formField({
        label: 'Media Control Number',
        description: 'Unique identifier for this media transfer',
        children: FormComponents.textInput({
          name: 'media_control_number',
          value: existingDraft?.request_number || '',
          maxLength: 50,
        }),
      })}
      
      ${FormComponents.formField({
        label: 'Media Type',
        required: true,
        description: 'Type of media being used for transfer',
        children: FormComponents.select({
          name: 'media_type',
          value: existingDraft?.media_type || '',
          required: true,
          options: [
            { value: 'SSD', label: 'SSD (Solid State Drive)' },
            { value: 'SSD-T', label: 'SSD (Travel)' },
            { value: 'DVD', label: 'DVD' },
            { value: 'DVD-R', label: 'DVD (Rewritable)' },
            { value: 'DVD-RDL', label: 'DVD (Rewritable Dual Layer)' },
            { value: 'CD', label: 'CD' },
            { value: 'CD-R', label: 'CD (Rewritable)' },
            { value: 'CD-RW', label: 'CD (Rewritable Dual Layer)' },
          ],
        }),
      })}
    </div>
  `;

  // Section II - Transfer Details
  const sectionII = `
    ${FormComponents.sectionHeader({
      title: 'Transfer Details',
      subtitle: 'Source, destination, and transfer specifications',
      sectionNumber: 'II',
    })}
    
    <div class="space-y-6">
      <!-- Source and Destination Information -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        ${FormComponents.formField({
          label: 'Source Information System (IS)',
          required: true,
          children: FormComponents.textInput({
            name: 'source_is',
            value: existingDraft?.source_system || '',
            required: true,
            maxLength: 100,
          }),
        })}
        
        ${FormComponents.formField({
          label: 'Source Classification',
          required: true,
          children: FormComponents.select({
            name: 'source_classification',
            value: existingDraft?.source_classification || '',
            required: true,
            options: [
              { value: 'UNCLASSIFIED', label: 'UNCLASSIFIED' },
              { value: 'CUI', label: 'CUI (Controlled Unclassified Information)' },
              { value: 'CONFIDENTIAL', label: 'CONFIDENTIAL' },
              { value: 'SECRET', label: 'SECRET' },
              { value: 'TOP SECRET', label: 'TOP SECRET' },
              { value: 'TOP SECRET//SCI', label: 'TOP SECRET//SCI' },
            ],
          }),
        })}
        
        ${FormComponents.formField({
          label: 'Destination Information System (IS)',
          required: true,
          children: FormComponents.textInput({
            name: 'destination_is',
            value: existingDraft?.dest_system || '',
            required: true,
            maxLength: 100,
          }),
        })}
        
        ${FormComponents.formField({
          label: 'Destination Classification',
          required: true,
          children: FormComponents.select({
            name: 'destination_classification',
            value: existingDraft?.destination_classification || '',
            required: true,
            options: [
              { value: 'UNCLASSIFIED', label: 'UNCLASSIFIED' },
              { value: 'CUI', label: 'CUI (Controlled Unclassified Information)' },
              { value: 'CONFIDENTIAL', label: 'CONFIDENTIAL' },
              { value: 'SECRET', label: 'SECRET' },
              { value: 'TOP SECRET', label: 'TOP SECRET' },
              { value: 'TOP SECRET//SCI', label: 'TOP SECRET//SCI' },
            ],
          }),
        })}

        <!-- Extra Destination rows (inline) -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-medium text-[var(--foreground)]">Add more Destinations</h4>
            <button type="button" class="action-btn secondary" onclick="addDestination()">+ Add Destination</button>
          </div>
          <div id="destinations-list" class="space-y-2"></div>
        </div>
        
        ${FormComponents.formField({
          label: 'Media Disposition',
          required: true,
          description: 'How will the media be handled after transfer',
          children: FormComponents.select({
            name: 'media_disposition',
            value: existingDraft?.media_disposition || '',
            required: true,
            options: [
              { value: 'Destroy', label: 'Destroy (Physical destruction)' },
              { value: 'Sanitize', label: 'Sanitize (Data wiping)' },
              { value: 'Retain', label: 'Retain (Keep for future use)' },
              { value: 'Return to Owner', label: 'Return to Owner' },
              { value: 'Degauss', label: 'Degauss (Magnetic erasure)' },
              { value: 'Overwrite', label: 'Overwrite (Multiple pass)' },
            ],
          }),
        })}
        
        ${FormComponents.formField({
          label: 'Overall Classification',
          required: true,
          description: 'Highest classification level of all data',
          children: FormComponents.select({
            name: 'overall_classification',
            value: existingDraft?.classification || '',
            required: true,
            options: [
              { value: 'UNCLASSIFIED', label: 'UNCLASSIFIED' },
              { value: 'CUI', label: 'CUI (Controlled Unclassified Information)' },
              { value: 'CONFIDENTIAL', label: 'CONFIDENTIAL' },
              { value: 'SECRET', label: 'SECRET' },
              { value: 'TOP SECRET', label: 'TOP SECRET' },
              { value: 'TOP SECRET//SCI', label: 'TOP SECRET//SCI' },
            ],
          }),
        })}
      </div>

      <!-- Transfer Type and Direction -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        ${FormComponents.formField({
          label: 'Transfer Type',
          required: true,
          children: FormComponents.select({
            name: 'transfer_type',
            value: existingDraft?.transfer_type || '',
            required: true,
            options: [
              { value: 'High-to-Low', label: 'High-to-Low' },
              { value: 'Low-to-High', label: 'Low-to-High' },
              { value: 'Low-to-Low', label: 'Low-to-Low' },
              { value: 'Intra-Domain', label: 'Intra-Domain' },
            ],
          }),
        })}
        
        ${FormComponents.formField({
          label: 'Destination File Operation',
          required: true,
          description: 'Are you adding files to or removing files from the destination IS?',
          children: FormComponents.radioGroup({
            name: 'destination_file',
            value: existingDraft?.destination_file || '',
            inline: true,
            options: [
              { value: 'upload', label: 'Upload (Add Files to IS)' },
              { value: 'download', label: 'Download (Remove Files from IS)' },
            ],
          }),
        })}
      </div>

      <!-- Non-Human Readable Process -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        ${FormComponents.formField({
          label: 'Process Name (If Non-Human Readable)',
          description: 'Required if transferring machine-readable files',
          children: FormComponents.textInput({
            name: 'process_name',
            value: existingDraft?.process_name || '',
            maxLength: 200,
          }),
        })}
        
        ${FormComponents.formField({
          label: 'Procedure Document #',
          description: 'Reference document number (as applicable)',
          children: FormComponents.textInput({
            name: 'procedure_document',
            value: existingDraft?.procedure_document || '',
            maxLength: 100,
          }),
        })}
      </div>

      <!-- Justification -->
      ${FormComponents.formField({
        label: 'Justification for Transfer',
        required: true,
        description: 'Explain the business need and purpose for this transfer',
        children: FormComponents.textarea({
          name: 'justification',
          value: existingDraft?.transfer_purpose || '',
          rows: 4,
          required: true,
        }),
      })}

      <!-- Number of Files -->
      ${FormComponents.formField({
        label: 'Number of Files for Transfer',
        required: true,
        children: FormComponents.textInput({
          name: 'num_files',
          value: existingDraft?.num_files?.toString() || '',
          required: true,
        }),
      })}

      <!-- File List -->
      ${FormComponents.formField({
        label: 'File Names, Types, and Classification',
        required: true,
        description: 'List each file with its type and classification level',
        children: FormComponents.fileListInput({
          files: existingDraft?.files || [],
          maxFiles: 5,
        }),
      })}

      <!-- Media Transportation -->
      <div class="bg-[var(--muted)] p-4 rounded-md space-y-4">
        <h4 class="font-medium text-[var(--foreground)]">Media Transportation</h4>
        
        ${FormComponents.formField({
          label: 'Will media be transported outside an approved area?',
          required: true,
          children: FormComponents.radioGroup({
            name: 'media_transportation',
            value: existingDraft?.media_transportation?.toString() || '',
            inline: true,
            options: [
              { value: 'true', label: 'Yes' },
              { value: 'false', label: 'No' },
            ],
          }),
        })}
        
        <div id="transport-details" style="display: ${existingDraft?.media_transportation ? 'block' : 'none'}">
          <div class="grid grid-cols-1 gap-4">
            ${FormComponents.formField({
              label: 'Media Destination',
              children: FormComponents.textInput({
                name: 'media_destination',
                value: existingDraft?.media_destination || '',
                maxLength: 200,
              }),
            })}
            
            ${FormComponents.formField({
              label: 'Destination POC / Customer Name',
              children: FormComponents.textInput({
                name: 'destination_poc',
                value: existingDraft?.dest_contact || '',
                maxLength: 100,
              }),
            })}
            
            ${FormComponents.formField({
              label: 'Destination Address / Location',
              children: FormComponents.textarea({
                name: 'destination_address',
                value: existingDraft?.dest_location || '',
                rows: 3,
              }),
            })}
          </div>
        </div>
      </div>

      <!-- Media Encryption -->
      <div class="bg-[var(--muted)] p-4 rounded-md">
        <h4 class="font-medium text-[var(--foreground)] mb-2">Media Encryption</h4>
        <p class="text-xs text-[var(--muted-foreground)] mb-4">
          Cryptographic mechanisms during transport outside of controlled areas shall be either an NSA or FIPS 140-2 compliant algorithm. [MP-5(4)]
        </p>
        
        ${FormComponents.formField({
          label: 'Will Media be Encrypted?',
          required: true,
          children: FormComponents.radioGroup({
            name: 'media_encrypted',
            value: existingDraft?.media_encrypted?.toString() || '',
            inline: true,
            options: [
              { value: 'true', label: 'Yes' },
              { value: 'false', label: 'No' },
            ],
          }),
        })}
      </div>
    </div>
  `;

  // Form actions based on status
  const formActions = `
    <div class="flex justify-between items-center pt-6 border-t border-[var(--border)]">
      <button
        type="button"
        onclick="window.location.href='/requestor/requests'"
        class="px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] bg-[var(--background)] border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
      >
        Back to Requests
      </button>
      
      <div class="flex space-x-3">
        ${
          existingDraft && existingDraft.status !== 'draft'
            ? `
          <button
            type="button"
            onclick="toggleEditMode()"
            id="edit-button"
            class="px-4 py-2 text-sm font-medium text-[var(--foreground)] bg-[var(--secondary)] hover:bg-[var(--secondary)]/80 rounded-md transition-colors"
          >
            Edit
          </button>
        `
            : ''
        }
        
        <button
          type="button"
          onclick="saveDraft()"
          id="save-button"
          class="px-4 py-2 text-sm font-medium text-[var(--foreground)] bg-[var(--secondary)] hover:bg-[var(--secondary)]/80 rounded-md transition-colors"
        >
          Save
        </button>
        
        <button
          type="button"
          onclick="saveAndClose()"
          id="submit-button"
          class="px-6 py-2 text-sm font-medium text-[var(--primary-foreground)] bg-[var(--primary)] hover:bg-[var(--primary)]/90 rounded-md transition-colors"
        >
          Save and Close
      </div>
    </div>
  `;

  const content = `
      ${statusIndicator}

      <form id="aft-request-form" class="space-y-8">
        <input type="hidden" name="draft_id" value="${draftId || ''}" />
        <input type="hidden" name="requestor_id" value="${userId}" />
        <input type="hidden" id="initial-destinations" value='${initialDestinationsJson.replace(/'/g, '&#39;').replace(/</g, '&lt;')}' />
        <input type="hidden" name="destinations_json" id="destinations_json" value='' />

        <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 space-y-8" id="form-container">
          ${sectionI}
          ${sectionII}
          ${formActions}
        </div>
      </form>
  `;

  return RequestorNavigation.renderLayout(
    draftId ? `Request ${existingDraft?.request_number || 'Edit'}` : 'New Request',
    existingDraft
      ? 'View and modify your AFT request'
      : 'Create your Assured File Transfer request',
    user,
    '/requestor/new-request',
    content,
  );
}

function getScript(): string {
  return `
    let fileRowCount = 1;
    let destinations = [];

    document.addEventListener('DOMContentLoaded', function() {
      loadDTAs();
      const dtaSelect = document.querySelector('select[name="dta_id"]');
      if (dtaSelect) {
        dtaSelect.addEventListener('change', function() { validateDTAAndPopulate(); });
      }

      const transportRadios = document.querySelectorAll('input[name="media_transportation"]');
      transportRadios.forEach(function(radio) {
        radio.addEventListener('change', function() {
          const details = document.getElementById('transport-details');
          details.style.display = (value === 'true') ? 'block' : 'none';
        });
      });

      const controlNumberField = document.querySelector('input[name="media_control_number"]');
      if (controlNumberField && !controlNumberField.value) {
        controlNumberField.value = generateControlNumber();
      }

      if (dtaSelect && dtaSelect.value) {
        validateDTAAndPopulate();
      }

      // Initialize destinations list from hidden input
      try {
        const initEl = document.getElementById('initial-destinations');
        if (initEl && initEl.value) {
          const parsed = JSON.parse(initEl.value);
          if (Array.isArray(parsed)) {
            // extras exclude the first (primary) destination
            const extras = parsed.slice(1).map(function(d){
              return { is: d?.is || '', classification: d?.classification || '' };
            });
            destinations = extras;
          }
        }
      } catch (e) {
        console.warn('Failed to parse initial destinations');
      }
      renderDestinations();
    });

    function generateControlNumber() {
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      return 'AFT-' + timestamp + '-' + random;
    }

    async function loadDTAs() {
      try {
        const res = await fetch('/api/requestor/dtas');
        if (!res.ok) return;
        const dtas = await res.json();
        const dtaSelect = document.querySelector('select[name="dta_id"]');
        if (!dtaSelect) return;
        dtaSelect.innerHTML = '<option value="">Select a DTA</option>';
        dtas.forEach(function(d) {
          const opt = document.createElement('option');
          opt.value = String(d.id);
          opt.textContent = d.first_name + ' ' + d.last_name + ' (' + d.email + ')';
          dtaSelect.appendChild(opt);
        });
        var currentVal = dtaSelect.getAttribute('value') || dtaSelect.value;
        if (currentVal) { dtaSelect.value = String(currentVal); }
      } catch (e) {
        console.error('Failed to load DTAs', e);
      }
    }

    async function validateDTAAndPopulate() {
      const dtaSelect = document.querySelector('select[name="dta_id"]');
      if (!dtaSelect || !dtaSelect.value) return;
      try {
        const res = await fetch('/api/requestor/dta/' + dtaSelect.value + '/issued-drive');
        const data = await res.json();
        if (!data.hasDrive) {
          alert('The selected DTA does not have a drive issued. Please contact the Media Custodian to issue a drive before proceeding.');
          disableFormExceptDTA(true);
          return;
        }
        disableFormExceptDTA(false);
        const controlField = document.querySelector('input[name="media_control_number"]');
        const mediaTypeSelect = document.querySelector('select[name="media_type"]');
        if (controlField && data.drive && data.drive.media_control_number) {
          controlField.value = data.drive.media_control_number;
        }
        if (mediaTypeSelect && data.drive && data.drive.type) {
          mediaTypeSelect.value = data.drive.type;
        }
      } catch (e) {
        console.error('Failed to validate DTA/drive', e);
      }
    }

    function disableFormExceptDTA(disabled) {
      const form = document.getElementById('aft-request-form');
      if (!form) return;
      const elements = form.querySelectorAll('input, textarea, select, button');
      elements.forEach(function(el) {
        if (el.name === 'dta_id' || el.id === 'edit-button' || el.id === 'save-button' || el.id === 'submit-button') return;
        if (disabled) {
          el.setAttribute('disabled', 'disabled');
          el.style.opacity = '0.6';
          el.style.pointerEvents = 'none';
        } else {
          el.removeAttribute('disabled');
          el.style.opacity = '1';
          el.style.pointerEvents = 'auto';
        }
      });
    }

    function addFileRow() {
      const fileList = document.getElementById('file-list');
      const newRow = document.createElement('div');
      newRow.innerHTML = createFileRowHTML(fileRowCount);
      fileList.appendChild(newRow.firstElementChild);
      fileRowCount++;
    }

    function renderDestinations() {
      const container = document.getElementById('destinations-list');
      if (!container) return;
      container.innerHTML = destinations.map(function(dest, idx) {
        var isVal = (dest && dest.is) ? dest.is : '';
        var clsVal = (dest && dest.classification) ? dest.classification : '';
        var options = ['','UNCLASSIFIED','CUI','CONFIDENTIAL','SECRET','TOP SECRET','TOP SECRET//SCI']
          .map(function(v){
            var sel = (v === clsVal) ? ' selected' : '';
            return '<option value="' + v + '"' + sel + '>' + (v || 'Classification') + '</option>';
          }).join('');
        return (
          '<div class="grid grid-cols-1 md:grid-cols-3 gap-2" data-dest-index="' + idx + '">' +
            '<input type="text" placeholder="Destination IS" class="block w-full text-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)] focus:border-[var(--primary)]" value="' + isVal + '" oninput="updateDestination(' + idx + ', &quot;is&quot;, value)" />' +
            '<select class="block w-full text-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)] focus:border-[var(--primary)]" onchange="updateDestination(' + idx + ', &quot;classification&quot;, value)">' + options + '</select>' +
            '<button type="button" class="px-2 py-1 text-xs text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded" onclick="removeDestination(' + idx + ')">Remove</button>' +
          '</div>'
        );
      }).join('');
    }

    function addDestination() {
      destinations.push({ is: '', classification: '' });
      renderDestinations();
    }

    function removeDestination(index) {
      destinations.splice(index, 1);
      renderDestinations();
    }

    function updateDestination(index, key, value) {
      if (!destinations[index]) destinations[index] = { is: '', classification: '' };
      destinations[index][key] = value;
    }

    function createFileRowHTML(index) {
      return \`
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-[var(--background)] border border-[var(--border)] rounded-md" data-file-index="\${index}">\n
          <div>\n
            <label class="block text-xs font-medium text-[var(--foreground)] mb-1">File Name</label>\n
            <input type="text" name="files[\${index}][name]" placeholder="e.g., dataset" class="block w-full text-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)] focus:border-[var(--primary)]" />\n
          </div>\n
          <div>\n
            <label class="block text-xs font-medium text-[var(--foreground)] mb-1">Extension</label>\n
            <input type="text" name="files[\${index}][type]" placeholder="e.g., csv" class="block w-full text-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)] focus:border-[var(--primary)]" />\n
          </div>\n
          <div>\n
            <label class="block text-xs font-medium text-[var(--foreground)] mb-1">Size</label>\n
            <input type="text" name="files[\${index}][size]" placeholder="e.g., 12 MB" class="block w-full text-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)] focus:border-[var(--primary)]" />\n
          </div>\n
          <div class="flex items-end gap-2">\n
            <div class="flex-1">\n
              <label class="block text-xs font-medium text-[var(--foreground)] mb-1">Classification</label>\n
              <select name="files[\${index}][classification]" class="block w-full text-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)] focus:border-[var(--primary)]">\n
                <option value="">Select classification</option>\n
                <option value="UNCLASSIFIED">UNCLASSIFIED</option>\n
                <option value="CUI">CUI</option>\n
                <option value="CONFIDENTIAL">CONFIDENTIAL</option>\n
                <option value="SECRET">SECRET</option>\n
                <option value="TOP SECRET">TOP SECRET</option>\n
                <option value="TOP SECRET//SCI">TOP SECRET//SCI</option>\n
              </select>\n
            </div>\n
            <button type="button" onclick="removeFileRow(\${index})" class="px-2 py-1 text-xs text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded">Remove</button>\n
          </div>\n
        </div>\n
      \`;
    }

    function removeFileRow(index) {
      const row = document.querySelector('[data-file-index="' + index + '"]');
      if (row) { row.remove(); }
    }

    async function saveDraft() {
      const form = document.getElementById('aft-request-form');
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      const files = [];
      const fileRows = document.querySelectorAll('[data-file-index]');
      fileRows.forEach(function(row) {
        const idx = row.getAttribute('data-file-index');
        const name = row.querySelector('[name="files[' + idx + '][name]"]')?.value;
        const type = row.querySelector('[name="files[' + idx + '][type]"]')?.value;
        const size = row.querySelector('[name="files[' + idx + '][size]"]')?.value;
        const classification = row.querySelector('[name="files[' + idx + '][classification]"]')?.value;
        if (name && classification) { files.push({ name: name, type: type || '', size: size || '', classification: classification }); }
      });
      data.files = JSON.stringify(files);
      // compose destinations as [primary, ...extras]
      const primaryIsEl = document.querySelector('input[name="destination_is"]');
      const primaryClsEl = document.querySelector('select[name="destination_classification"]');
      const primary = { is: (primaryIsEl?.value || ''), classification: (primaryClsEl?.value || '') };
      const allDest = [primary].concat(destinations.map(function(d){ return { is: d.is || '', classification: d.classification || '' }; }));
      const destField = document.getElementById('destinations_json');
      if (destField) { destField.value = JSON.stringify(allDest); }
      data.destinations_json = destField ? destField.value : JSON.stringify(allDest);
      data.status = 'draft';
      const response = await fetch('/api/requestor/save-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (response.ok) {
        const result = await response.json();
        if (result.requestId && !data.draft_id) {
          window.history.pushState({}, '', '/requestor/new-request?draft=' + result.requestId);
          const draftIdEl = document.querySelector('input[name="draft_id"]');
          if (draftIdEl) draftIdEl.value = result.requestId;
        }
      } else {
        alert('Failed to save draft. Please try again.');
      }
    }

    function toggleEditMode() {
      editMode = !editMode;
      const formElements = document.querySelectorAll('input, textarea, select, button[onclick*="addFileRow"], button[onclick*="removeFileRow"]');
      const editButton = document.getElementById('edit-button');
      const saveButton = document.getElementById('save-button');
      formElements.forEach(function(element) {
        if (element.id === 'edit-button' || element.id === 'save-button' || element.id === 'submit-button') { return; }
        if (editMode) {
          element.removeAttribute('disabled'); element.style.opacity = '1'; element.style.pointerEvents = 'auto';
        } else {
          element.setAttribute('disabled', 'disabled'); element.style.opacity = '0.6'; element.style.pointerEvents = 'none';
        }
      });
      if (editButton) { editButton.textContent = editMode ? 'View Only' : 'Edit'; }
      if (saveButton) { saveButton.style.display = editMode ? 'inline-block' : 'none'; }
    }

    async function saveAndClose() {
      try { await saveDraft(); window.location.href = '/requestor/requests'; }
      catch (e) { console.error('Failed to save and close', e); alert('Failed to save. Please try again.'); }
    }
  `;
}

export const RequestWizard = {
  render,
  getScript,
};
