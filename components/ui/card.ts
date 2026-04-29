// Card components following the design system

export interface CardProps {
  className?: string;
  children: string;
  hover?: boolean;
  variant?: 'default' | 'elevated' | 'outlined';
}

export interface CardHeaderProps {
  className?: string;
  children: string;
}

export interface CardContentProps {
  className?: string;
  children: string;
}

export interface CardFooterProps {
  className?: string;
  children: string;
}

export function Card({
  className = '',
  children,
  hover = false,
  variant = 'default',
}: CardProps): string {
  const baseClasses = [
    'bg-[var(--card)]',
    'text-[var(--card-foreground)]',
    'rounded-lg',
    'border',
    'border-[var(--border)]',
  ];

  const variantClasses = {
    default: ['shadow-[var(--shadow-sm)]'],
    elevated: ['shadow-[var(--shadow-lg)]'],
    outlined: ['border-2', 'shadow-none'],
  };

  const hoverClasses = hover
    ? [
        'transition-all',
        'duration-200',
        'hover:shadow-[var(--shadow-md)]',
        'hover:border-[var(--primary)]',
        'hover:-translate-y-1',
        'cursor-pointer',
      ]
    : [];

  const allClasses = [...baseClasses, ...variantClasses[variant], ...hoverClasses, className]
    .filter(Boolean)
    .join(' ');

  return `
    <div class="${allClasses}">
      ${children}
    </div>
  `;
}

export function CardHeader({ className = '', children }: CardHeaderProps): string {
  const classes = ['p-6', 'pb-4', className].filter(Boolean).join(' ');

  return `
    <div class="${classes}">
      ${children}
    </div>
  `;
}

export function CardContent({ className = '', children }: CardContentProps): string {
  const classes = ['p-6', 'pt-0', className].filter(Boolean).join(' ');

  return `
    <div class="${classes}">
      ${children}
    </div>
  `;
}

export function CardFooter({ className = '', children }: CardFooterProps): string {
  const classes = ['p-6', 'pt-4', 'border-t', 'border-[var(--border)]', className]
    .filter(Boolean)
    .join(' ');

  return `
    <div class="${classes}">
      ${children}
    </div>
  `;
}

export function CardTitle({
  className = '',
  children,
}: {
  className?: string;
  children: string;
}): string {
  const classes = [
    'text-lg',
    'font-semibold',
    'leading-none',
    'tracking-tight',
    'text-[var(--card-foreground)]',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return `<h3 class="${classes}">${children}</h3>`;
}

export function CardDescription({
  className = '',
  children,
}: {
  className?: string;
  children: string;
}): string {
  const classes = ['text-sm', 'text-[var(--muted-foreground)]', 'mt-2', className]
    .filter(Boolean)
    .join(' ');

  return `<p class="${classes}">${children}</p>`;
}

// Status Card - specialized card for dashboard status items
export interface StatusCardProps extends Omit<CardProps, 'children'> {
  title: string;
  items: Array<{
    label: string;
    value: string;
    status?: 'operational' | 'secure' | 'low-threat' | 'attention' | 'warning' | 'error' | 'info';
  }>;
  actions?: string; // HTML for action buttons
}

export function StatusCard({
  title,
  items,
  actions,
  className = '',
  hover = true,
  variant = 'default',
}: StatusCardProps): string {
  const statusContent = items
    .map((item) => {
      const statusClass = item.status ? getStatusClass(item.status) : '';
      return `
      <div class="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-b-0">
        <span class="text-sm text-[var(--muted-foreground)]">${item.label}</span>
        <span class="text-sm font-medium font-mono ${statusClass}">${item.value}</span>
      </div>
    `;
    })
    .join('');

  const cardContent = CardContent({
    children: `
      <div class="space-y-2">
        ${statusContent}
      </div>
      ${actions ? `<div class="mt-6 pt-4 border-t border-[var(--border)]">${actions}</div>` : ''}
    `,
  });

  return Card({
    className,
    hover,
    variant,
    children:
      CardHeader({
        children: CardTitle({ children: title }),
      }) + cardContent,
  });
}

function getStatusClass(status: string): string {
  const statusClasses = {
    operational: 'text-[var(--success)]',
    secure: 'text-[var(--primary)]',
    'low-threat': 'text-[var(--success)]',
    attention: 'text-[var(--warning)]',
    warning: 'text-[var(--warning)]',
    error: 'text-[var(--destructive)]',
    info: 'text-[var(--info)]',
  };
  return statusClasses[status as keyof typeof statusClasses] || '';
}
