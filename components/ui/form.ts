// Form components following the design system

export interface InputProps {
  id?: string;
  name?: string;
  type?:
    | 'text'
    | 'email'
    | 'password'
    | 'tel'
    | 'url'
    | 'search'
    | 'number'
    | 'date'
    | 'datetime-local'
    | 'time';
  placeholder?: string;
  value?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  className?: string;
  onChange?: string; // JavaScript code
  onFocus?: string;
  onBlur?: string;
}

export interface LabelProps {
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: string;
}

export interface SelectProps {
  id?: string;
  name?: string;
  value?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onChange?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
}

export interface TextareaProps extends Omit<InputProps, 'type'> {
  rows?: number;
  cols?: number;
}

export interface FormGroupProps {
  className?: string;
  children: string;
}

export function Input({
  id,
  name,
  type = 'text',
  placeholder,
  value,
  required = false,
  disabled = false,
  readonly = false,
  className = '',
  onChange,
  onFocus,
  onBlur,
}: InputProps): string {
  const baseClasses = [
    'w-full',
    'px-3',
    'py-2',
    'text-sm',
    'bg-[var(--background)]',
    'border',
    'border-[var(--input)]',
    'rounded-md',
    'text-[var(--foreground)]',
    'placeholder-[var(--muted-foreground)]',
    'transition-colors',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-[var(--ring)]',
    'focus:border-[var(--ring)]',
    'disabled:opacity-50',
    'disabled:cursor-not-allowed',
    'readonly:opacity-75',
  ];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <input
      ${id ? `id="${id}"` : ''}
      ${name ? `name="${name}"` : ''}
      type="${type}"
      class="${allClasses}"
      ${placeholder ? `placeholder="${placeholder}"` : ''}
      ${value ? `value="${value}"` : ''}
      ${required ? 'required' : ''}
      ${disabled ? 'disabled' : ''}
      ${readonly ? 'readonly' : ''}
      ${onChange ? `onchange="${onChange}"` : ''}
      ${onFocus ? `onfocus="${onFocus}"` : ''}
      ${onBlur ? `onblur="${onBlur}"` : ''}
    />
  `;
}

export function Label({ htmlFor, required = false, className = '', children }: LabelProps): string {
  const baseClasses = ['block', 'text-sm', 'font-medium', 'text-[var(--foreground)]', 'mb-2'];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <label
      ${htmlFor ? `for="${htmlFor}"` : ''}
      class="${allClasses}"
    >
      ${children}${required ? '<span class="text-[var(--destructive)] ml-1">*</span>' : ''}
    </label>
  `;
}

export function Select({
  id,
  name,
  value,
  required = false,
  disabled = false,
  className = '',
  onChange,
  options,
  placeholder,
}: SelectProps): string {
  const baseClasses = [
    'w-full',
    'px-3',
    'py-2',
    'text-sm',
    'bg-[var(--background)]',
    'border',
    'border-[var(--input)]',
    'rounded-md',
    'text-[var(--foreground)]',
    'transition-colors',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-[var(--ring)]',
    'focus:border-[var(--ring)]',
    'disabled:opacity-50',
    'disabled:cursor-not-allowed',
  ];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  const optionElements = [
    placeholder
      ? `<option value="" disabled ${!value ? 'selected' : ''}>${placeholder}</option>`
      : '',
    ...options.map(
      (option) => `
      <option 
        value="${option.value}" 
        ${value === option.value ? 'selected' : ''}
        ${option.disabled ? 'disabled' : ''}
      >
        ${option.label}
      </option>
    `,
    ),
  ]
    .filter(Boolean)
    .join('');

  return `
    <select
      ${id ? `id="${id}"` : ''}
      ${name ? `name="${name}"` : ''}
      class="${allClasses}"
      ${required ? 'required' : ''}
      ${disabled ? 'disabled' : ''}
      ${onChange ? `onchange="${onChange}"` : ''}
    >
      ${optionElements}
    </select>
  `;
}

export function Textarea({
  id,
  name,
  placeholder,
  value,
  required = false,
  disabled = false,
  readonly = false,
  className = '',
  onChange,
  onFocus,
  onBlur,
  rows = 4,
  cols,
}: TextareaProps): string {
  const baseClasses = [
    'w-full',
    'px-3',
    'py-2',
    'text-sm',
    'bg-[var(--background)]',
    'border',
    'border-[var(--input)]',
    'rounded-md',
    'text-[var(--foreground)]',
    'placeholder-[var(--muted-foreground)]',
    'transition-colors',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-[var(--ring)]',
    'focus:border-[var(--ring)]',
    'disabled:opacity-50',
    'disabled:cursor-not-allowed',
    'readonly:opacity-75',
    'resize-y',
  ];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <textarea
      ${id ? `id="${id}"` : ''}
      ${name ? `name="${name}"` : ''}
      class="${allClasses}"
      rows="${rows}"
      ${cols ? `cols="${cols}"` : ''}
      ${placeholder ? `placeholder="${placeholder}"` : ''}
      ${required ? 'required' : ''}
      ${disabled ? 'disabled' : ''}
      ${readonly ? 'readonly' : ''}
      ${onChange ? `onchange="${onChange}"` : ''}
      ${onFocus ? `onfocus="${onFocus}"` : ''}
      ${onBlur ? `onblur="${onBlur}"` : ''}
    >${value || ''}</textarea>
  `;
}

export function FormGroup({ className = '', children }: FormGroupProps): string {
  const baseClasses = ['mb-4'];
  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <div class="${allClasses}">
      ${children}
    </div>
  `;
}

export function FormSection({
  title,
  description,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  children: string;
  className?: string;
}): string {
  const baseClasses = [
    'mb-8',
    'pb-6',
    'border-b',
    'border-[var(--border)]',
    'last:border-b-0',
    'last:pb-0',
    'last:mb-0',
  ];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <div class="${allClasses}">
      <div class="mb-6">
        <h3 class="text-lg font-semibold text-[var(--foreground)] mb-2">${title}</h3>
        ${description ? `<p class="text-sm text-[var(--muted-foreground)]">${description}</p>` : ''}
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${children}
      </div>
    </div>
  `;
}

export function ErrorMessage({
  children,
  className = '',
}: {
  children: string;
  className?: string;
}): string {
  const baseClasses = [
    'text-sm',
    'text-[var(--destructive)]',
    'mt-1',
    'flex',
    'items-center',
    'gap-1',
  ];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <div class="${allClasses}">
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>
      ${children}
    </div>
  `;
}

export function SuccessMessage({
  children,
  className = '',
}: {
  children: string;
  className?: string;
}): string {
  const baseClasses = ['text-sm', 'text-[var(--success)]', 'mt-1', 'flex', 'items-center', 'gap-1'];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <div class="${allClasses}">
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
      </svg>
      ${children}
    </div>
  `;
}
