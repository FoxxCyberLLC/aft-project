// Button component with variants following the design system

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'warning' | 'destructive' | 'success';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: string; // JavaScript code to execute
  href?: string; // If provided, renders as a link
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  id?: string;
  children: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  href,
  type = 'button',
  className = '',
  id,
  children,
}: ButtonProps): string {
  const baseClasses = [
    'inline-flex',
    'items-center',
    'justify-center',
    'font-medium',
    'transition-all',
    'duration-200',
    'border',
    'border-transparent',
    'cursor-pointer',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-offset-2',
    'focus:ring-var(--ring)',
    'disabled:opacity-50',
    'disabled:cursor-not-allowed',
  ];

  // Variant styles
  const variantClasses = {
    primary: [
      'bg-[var(--primary)]',
      'text-[var(--primary-foreground)]',
      'hover:bg-[rgb(37,99,235)]',
      'focus:ring-[var(--primary)]',
    ],
    secondary: [
      'bg-[var(--secondary)]',
      'text-[var(--secondary-foreground)]',
      'border-[var(--border)]',
      'hover:bg-[var(--muted)]',
      'focus:ring-[var(--secondary)]',
    ],
    outline: [
      'bg-transparent',
      'text-[var(--foreground)]',
      'border',
      'border-[var(--border)]',
      'hover:bg-[var(--muted)]',
      'focus:ring-[var(--ring)]',
    ],
    warning: [
      'bg-[var(--warning)]',
      'text-[var(--warning-foreground)]',
      'hover:bg-[rgb(217,119,6)]',
      'focus:ring-[var(--warning)]',
    ],
    destructive: [
      'bg-[var(--destructive)]',
      'text-[var(--destructive-foreground)]',
      'hover:bg-[rgb(220,38,38)]',
      'focus:ring-[var(--destructive)]',
    ],
    success: [
      'bg-[var(--success)]',
      'text-[var(--success-foreground)]',
      'hover:bg-[rgb(21,128,61)]',
      'focus:ring-[var(--success)]',
    ],
  };

  // Size styles
  const sizeClasses = {
    sm: ['text-sm', 'px-3', 'py-1.5', 'rounded-md'],
    md: ['text-sm', 'px-4', 'py-2', 'rounded-md'],
    lg: ['text-base', 'px-6', 'py-3', 'rounded-lg'],
  };

  const allClasses = [
    ...baseClasses,
    ...(variantClasses[variant] || variantClasses.primary),
    ...(sizeClasses[size] || sizeClasses.md),
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const loadingSpinner = loading
    ? `
    <svg class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  `
    : '';

  const content = `${loadingSpinner}${children}`;

  if (href) {
    return `
      <a
        href="${href}"
        class="${allClasses}"
        ${id ? `id="${id}"` : ''}
        ${disabled || loading ? 'onclick="return false;" style="pointer-events: none;"' : ''}
      >
        ${content}
      </a>
    `;
  }

  return `
    <button
      type="${type}"
      class="${allClasses}"
      ${id ? `id="${id}"` : ''}
      ${disabled || loading ? 'disabled' : ''}
      ${onClick ? `onclick="${onClick}"` : ''}
    >
      ${content}
    </button>
  `;
}

// Convenience functions for common button types
export const PrimaryButton = (props: Omit<ButtonProps, 'variant'>) =>
  Button({ ...props, variant: 'primary' });

export const SecondaryButton = (props: Omit<ButtonProps, 'variant'>) =>
  Button({ ...props, variant: 'secondary' });

export const DestructiveButton = (props: Omit<ButtonProps, 'variant'>) =>
  Button({ ...props, variant: 'destructive' });

export const WarningButton = (props: Omit<ButtonProps, 'variant'>) =>
  Button({ ...props, variant: 'warning' });

export const SuccessButton = (props: Omit<ButtonProps, 'variant'>) =>
  Button({ ...props, variant: 'success' });
