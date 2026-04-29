// Layout components following the design system

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  classification?: string;
  user?: {
    email: string;
    role: string;
  };
  actions?: string; // HTML for action buttons
  navigation?: Array<{
    label: string;
    href: string;
    active?: boolean;
  }>;
}

export interface ContainerProps {
  className?: string;
  children: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

export interface GridProps {
  className?: string;
  children: string;
  cols?: 1 | 2 | 3 | 4 | 5 | 6;
  gap?: 'sm' | 'md' | 'lg';
  responsive?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  classification = 'UNCLASSIFIED',
  user,
  actions,
  navigation,
}: PageHeaderProps): string {
  const navItems = navigation
    ? navigation
        .map(
          (item) => `
    <a 
      href="${item.href}" 
      class="px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        item.active
          ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
      }"
    >
      ${item.label}
    </a>
  `,
        )
        .join('')
    : '';

  return `
    <header class="bg-[var(--card)] border-b border-[var(--border)] shadow-[var(--shadow-sm)] sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-3 sm:px-5 lg:px-6">
        <div class="flex justify-between items-center py-4">
          <div class="flex items-center space-x-4">
            <div>
              <h1 class="text-2xl font-bold text-[var(--primary)] flex items-center gap-3">
                ${title}
                <span class="bg-[var(--warning)] text-[var(--warning-foreground)] px-2 py-1 text-xs font-semibold rounded-full uppercase tracking-wide">
                  ${classification}
                </span>
              </h1>
              ${subtitle ? `<p class="text-sm text-[var(--muted-foreground)] mt-1">${subtitle}</p>` : ''}
            </div>
          </div>
          
          <div class="flex items-center space-x-4">
            ${
              user
                ? `
              <div class="text-right">
                <div class="text-sm font-medium text-[var(--foreground)]">${user.email}</div>
                <div class="text-xs text-[var(--muted-foreground)] uppercase">${user.role}</div>
              </div>
            `
                : ''
            }
            ${actions ? `<div class="flex items-center space-x-2">${actions}</div>` : ''}
          </div>
        </div>
        
        ${
          navigation
            ? `
          <nav class="flex space-x-1 pb-4 border-t border-[var(--border)] pt-4">
            ${navItems}
          </nav>
        `
            : ''
        }
      </div>
    </header>
  `;
}

export function Container({ className = '', children, maxWidth = 'xl' }: ContainerProps): string {
  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-7xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-full',
  };

  const baseClasses = ['mx-auto', 'px-4', 'sm:px-6', 'lg:px-8', maxWidthClasses[maxWidth]];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <div class="${allClasses}">
      ${children}
    </div>
  `;
}

export function Grid({
  className = '',
  children,
  cols = 3,
  gap = 'md',
  responsive = true,
}: GridProps): string {
  const colClasses = responsive
    ? {
        1: 'grid-cols-1',
        2: 'grid-cols-1 md:grid-cols-2',
        3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
        4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
        5: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
        6: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
      }
    : {
        1: 'grid-cols-1',
        2: 'grid-cols-2',
        3: 'grid-cols-3',
        4: 'grid-cols-4',
        5: 'grid-cols-5',
        6: 'grid-cols-6',
      };

  const gapClasses = {
    sm: 'gap-4',
    md: 'gap-6',
    lg: 'gap-8',
  };

  const baseClasses = ['grid', colClasses[cols], gapClasses[gap]];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <div class="${allClasses}">
      ${children}
    </div>
  `;
}

export function PageLayout({
  header,
  children,
  footer,
  className = '',
}: {
  header: string;
  children: string;
  footer?: string;
  className?: string;
}): string {
  const baseClasses = ['min-h-screen', 'bg-[var(--muted)]', 'flex', 'flex-col'];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <div class="${allClasses}">
      ${header}
      <main class="flex-1 py-8">
        ${children}
      </main>
      ${footer ? `<footer class="border-t border-[var(--border)] bg-[var(--card)]">${footer}</footer>` : ''}
    </div>
  `;
}

export function Sidebar({
  className = '',
  children,
  width = 'md',
}: {
  className?: string;
  children: string;
  width?: 'sm' | 'md' | 'lg';
}): string {
  const widthClasses = {
    sm: 'w-64',
    md: 'w-80',
    lg: 'w-96',
  };

  const baseClasses = [
    'bg-[var(--card)]',
    'border-r',
    'border-[var(--border)]',
    'overflow-y-auto',
    widthClasses[width],
  ];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <aside class="${allClasses}">
      ${children}
    </aside>
  `;
}

export function MainContent({
  className = '',
  children,
}: {
  className?: string;
  children: string;
}): string {
  const baseClasses = ['flex-1', 'overflow-auto'];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <main class="${allClasses}">
      ${children}
    </main>
  `;
}

export function PageFooter({
  className = '',
  children,
}: {
  className?: string;
  children: string;
}): string {
  const baseClasses = ['border-t', 'border-[var(--border)]', 'bg-[var(--card)]', 'py-6'];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <footer class="${allClasses}">
      <div class="max-w-7xl mx-auto px-3 sm:px-5 lg:px-6">
        ${children}
      </div>
    </footer>
  `;
}

export function SectionHeader({
  title,
  description,
  actions,
  className = '',
}: {
  title: string;
  description?: string;
  actions?: string;
  className?: string;
}): string {
  const baseClasses = [
    'flex',
    'justify-between',
    'items-start',
    'mb-8',
    'pb-4',
    'border-b',
    'border-[var(--border)]',
  ];

  const allClasses = [...baseClasses, className].filter(Boolean).join(' ');

  return `
    <div class="${allClasses}">
      <div>
        <h2 class="text-2xl font-bold text-[var(--foreground)] mb-2">${title}</h2>
        ${description ? `<p class="text-[var(--muted-foreground)]">${description}</p>` : ''}
      </div>
      ${actions ? `<div class="flex items-center space-x-2">${actions}</div>` : ''}
    </div>
  `;
}
