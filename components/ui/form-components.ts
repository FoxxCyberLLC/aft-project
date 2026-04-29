// Form UI Components for clean wizard experience
// Form field wrapper
function formField(options: {
  label: string;
  required?: boolean;
  description?: string;
  children: string;
  className?: string;
}): string {
  return `
    <div class="${options.className || 'space-y-2'}">
      <label class="block text-sm font-medium text-[var(--foreground)]">
        ${options.label}
        ${options.required ? '<span class="text-[var(--destructive)] ml-1">*</span>' : ''}
      </label>
      ${
        options.description
          ? `
        <p class="text-xs text-[var(--muted-foreground)]">${options.description}</p>
      `
          : ''
      }
      ${options.children}
    </div>
  `;
}

// Text input
function textInput(options: {
  name: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
}): string {
  return `
    <input
      type="text"
      name="${options.name}"
      id="${options.name}"
      value="${options.value || ''}"
      placeholder="${options.placeholder || ''}"
      ${options.required ? 'required' : ''}
      ${options.disabled ? 'disabled' : ''}
      ${options.maxLength ? `maxlength="${options.maxLength}"` : ''}
      class="block w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:bg-[var(--muted)] disabled:cursor-not-allowed"
    />
  `;
}

// Textarea
function textarea(options: {
  name: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  rows?: number;
  disabled?: boolean;
}): string {
  return `
    <textarea
      name="${options.name}"
      id="${options.name}"
      rows="${options.rows || 3}"
      placeholder="${options.placeholder || ''}"
      ${options.required ? 'required' : ''}
      ${options.disabled ? 'disabled' : ''}
      class="block w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:bg-[var(--muted)] disabled:cursor-not-allowed resize-vertical"
    >${options.value || ''}</textarea>
  `;
}

// Select dropdown
function select(options: {
  name: string;
  value?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}): string {
  return `
    <select
      name="${options.name}"
      id="${options.name}"
      ${options.required ? 'required' : ''}
      ${options.disabled ? 'disabled' : ''}
      class="block w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:bg-[var(--muted)] disabled:cursor-not-allowed"
    >
      ${options.placeholder ? `<option value="">${options.placeholder}</option>` : ''}
      ${options.options
        .map(
          (opt) => `
        <option value="${opt.value}" ${opt.value === options.value ? 'selected' : ''} ${opt.disabled ? 'disabled' : ''}>
          ${opt.label}
        </option>
      `,
        )
        .join('')}
    </select>
  `;
}

// Checkbox
function checkbox(options: {
  name: string;
  value?: string;
  checked?: boolean;
  label: string;
  disabled?: boolean;
}): string {
  return `
    <div class="flex items-center space-x-2">
      <input
        type="checkbox"
        name="${options.name}"
        id="${options.name}"
        value="${options.value || 'true'}"
        ${options.checked ? 'checked' : ''}
        ${options.disabled ? 'disabled' : ''}
        class="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0"
      />
      <label for="${options.name}" class="text-sm text-[var(--foreground)]">
        ${options.label}
      </label>
    </div>
  `;
}

// Radio button group
function radioGroup(options: {
  name: string;
  value?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  inline?: boolean;
}): string {
  const containerClass = options.inline ? 'flex items-center space-x-6' : 'space-y-2';

  return `
    <div class="${containerClass}">
      ${options.options
        .map(
          (opt) => `
        <div class="flex items-center space-x-2">
          <input
            type="radio"
            name="${options.name}"
            id="${options.name}_${opt.value}"
            value="${opt.value}"
            ${opt.value === options.value ? 'checked' : ''}
            ${opt.disabled ? 'disabled' : ''}
            class="h-4 w-4 border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0"
          />
          <label for="${options.name}_${opt.value}" class="text-sm text-[var(--foreground)]">
            ${opt.label}
          </label>
        </div>
      `,
        )
        .join('')}
    </div>
  `;
}

// File list component for multiple files with types and classifications
function fileListInput(options: {
  files?: Array<{ name: string; type: string; size?: string; classification: string }>;
  maxFiles?: number;
}): string {
  const files = options.files || [];
  const maxFiles = options.maxFiles || 5;

  return `
    <div class="space-y-4">
      <div class="bg-[var(--muted)] p-4 rounded-md">
        <div class="flex justify-between items-center mb-3">
          <h4 class="text-sm font-medium text-[var(--foreground)]">File Information</h4>
          <button 
            type="button" 
            onclick="addFileRow()"
            class="text-xs px-3 py-1 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90"
          >
            + Add File
          </button>
        </div>
        
        <div id="file-list" class="space-y-3">
          ${files.length === 0 ? fileRow(0) : ''}
          ${files.map((file, index) => fileRow(index, file)).join('')}
        </div>
        
        <div class="mt-3 text-xs text-[var(--muted-foreground)]">
          Maximum ${maxFiles} files can be listed here. Additional files can be listed on separate sheets.
        </div>
      </div>
    </div>
  `;
}

// Individual file row
function fileRow(
  index: number,
  file?: { name: string; type: string; size?: string; classification: string },
): string {
  return `
    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-[var(--background)] border border-[var(--border)] rounded-md" data-file-index="${index}">
      <div>
        <label class="block text-xs font-medium text-[var(--foreground)] mb-1">File Name</label>
        <input
          type="text"
          name="files[${index}][name]"
          value="${file?.name || ''}"
          placeholder="Enter file name"
          class="block w-full text-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:border-[var(--primary)]"
        />
      </div>
      <div>
        <label class="block text-xs font-medium text-[var(--foreground)] mb-1">File Type</label>
        <input
          type="text"
          name="files[${index}][type]"
          value="${file?.type || ''}"
          placeholder="e.g., .docx, .pdf, .zip"
          class="block w-full text-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:border-[var(--primary)]"
        />
      </div>
      <div>
        <label class="block text-xs font-medium text-[var(--foreground)] mb-1">Size</label>
        <input
          type="text"
          name="files[${index}][size]"
          value="${file?.size || ''}"
          placeholder="e.g., 12 MB"
          class="block w-full text-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:border-[var(--primary)]"
        />
      </div>
      <div class="flex items-end gap-2">
        <div class="flex-1">
          <label class="block text-xs font-medium text-[var(--foreground)] mb-1">Classification</label>
          <select
            name="files[${index}][classification]"
            class="block w-full text-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)] focus:border-[var(--primary)]"
          >
            <option value="">Select classification</option>
            <option value="UNCLASSIFIED" ${file?.classification === 'UNCLASSIFIED' ? 'selected' : ''}>UNCLASSIFIED</option>
            <option value="CUI" ${file?.classification === 'CUI' ? 'selected' : ''}>CUI</option>
            <option value="CONFIDENTIAL" ${file?.classification === 'CONFIDENTIAL' ? 'selected' : ''}>CONFIDENTIAL</option>
            <option value="SECRET" ${file?.classification === 'SECRET' ? 'selected' : ''}>SECRET</option>
            <option value="TOP SECRET" ${file?.classification === 'TOP SECRET' ? 'selected' : ''}>TOP SECRET</option>
            <option value="TOP SECRET//SCI" ${file?.classification === 'TOP SECRET//SCI' ? 'selected' : ''}>TOP SECRET//SCI</option>
          </select>
        </div>
        ${
          index > 0
            ? `
          <button
            type="button"
            onclick="removeFileRow(${index})"
            class="px-2 py-1 text-xs text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded"
          >
            Remove
          </button>
        `
            : ''
        }
      </div>
    </div>
  `;
}

// Form section header
function sectionHeader(options: {
  title: string;
  subtitle?: string;
  sectionNumber?: string;
}): string {
  return `
    <div class="mb-6">
      <div class="flex items-center space-x-2 mb-2">
        ${
          options.sectionNumber
            ? `
          <span class="inline-flex items-center justify-center w-8 h-8 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full text-sm font-medium">
            ${options.sectionNumber}
          </span>
        `
            : ''
        }
        <h2 class="text-xl font-semibold text-[var(--foreground)]">${options.title}</h2>
      </div>
      ${
        options.subtitle
          ? `
        <p class="text-sm text-[var(--muted-foreground)] ml-10">${options.subtitle}</p>
      `
          : ''
      }
    </div>
  `;
}

// Form progress indicator
function progressIndicator(options: {
  currentStep: number;
  totalSteps: number;
  steps: Array<{ title: string; completed?: boolean }>;
}): string {
  return `
    <div class="mb-8">
      <div class="flex items-center justify-between">
        ${options.steps
          .map((step, index) => {
            const stepNumber = index + 1;
            const isCurrent = stepNumber === options.currentStep;
            const isCompleted = step.completed || stepNumber < options.currentStep;

            return `
            <div class="flex items-center ${index < options.steps.length - 1 ? 'flex-1' : ''}">
              <div class="flex items-center">
                <div class="flex items-center justify-center w-8 h-8 rounded-full ${
                  isCompleted
                    ? 'bg-[var(--success)] text-white'
                    : isCurrent
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                }">
                  ${isCompleted ? '✓' : stepNumber}
                </div>
                <span class="ml-2 text-sm font-medium ${
                  isCurrent ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'
                }">
                  ${step.title}
                </span>
              </div>
              ${
                index < options.steps.length - 1
                  ? `
                <div class="flex-1 h-px bg-[var(--border)] mx-4"></div>
              `
                  : ''
              }
            </div>
          `;
          })
          .join('')}
      </div>
    </div>
  `;
}

export const FormComponents = {
  formField,
  textInput,
  textarea,
  select,
  checkbox,
  radioGroup,
  fileListInput,
  fileRow,
  sectionHeader,
  progressIndicator,
};
