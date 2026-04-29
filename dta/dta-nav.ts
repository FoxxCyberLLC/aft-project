// DTA Navigation Component for consistent navigation across DTA pages

import { ArrowRightIcon, ChartBarIcon, DatabaseIcon, FileTextIcon } from '../components/icons';
import { ComponentBuilder } from '../components/ui/server-components';

export interface DTAUser {
  email: string;
  role: string;
}

export interface DTANavItem {
  label: string;
  href: string;
  active?: boolean;
  icon?: string;
}

const NAV_ITEMS: DTANavItem[] = [
  { label: 'Dashboard', href: '/dta', icon: ChartBarIcon({ size: 16 }) },
  { label: 'Transfer Requests', href: '/dta/requests', icon: FileTextIcon({ size: 16 }) },
  { label: 'Active Transfers', href: '/dta/active', icon: ArrowRightIcon({ size: 16 }) },
  { label: 'Data Management', href: '/dta/data', icon: DatabaseIcon({ size: 16 }) },
];

function getNavItems(currentPath: string): DTANavItem[] {
  return NAV_ITEMS.map((item) => ({
    ...item,
    active:
      currentPath === item.href || (item.href !== '/dta' && currentPath.startsWith(item.href)),
  }));
}

function renderNavigation(currentPath: string): string {
  const navItems = getNavItems(currentPath);

  return `
    <nav class="flex space-x-1 pb-4 border-t border-[var(--border)] pt-4">
      ${navItems
        .map(
          (item) => `
        <a 
          href="${item.href}" 
          class="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            item.active
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
          }"
        >
          ${item.icon ? `<span class="icon-interactive">${item.icon}</span>` : ''}
          ${item.label}
        </a>
      `,
        )
        .join('')}
    </nav>
  `;
}

function renderQuickStats(
  stats: Array<{
    label: string;
    value: string | number;
    status: 'operational' | 'warning' | 'error' | 'info';
  }>,
): string {
  return `
    <div class="grid grid-cols-1 md:grid-cols-${stats.length} gap-4 mb-6">
      ${stats
        .map(
          (stat) => `
        <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
          <div class="text-2xl font-bold ${
            stat.status === 'operational'
              ? 'text-[var(--primary)]'
              : stat.status === 'warning'
                ? 'text-[var(--warning)]'
                : stat.status === 'info'
                  ? 'text-[var(--info)]'
                  : 'text-[var(--destructive)]'
          }">${stat.value}</div>
          <div class="text-sm text-[var(--muted-foreground)]">${stat.label}</div>
        </div>
      `,
        )
        .join('')}
    </div>
  `;
}

function renderPageHeader(
  title: string,
  subtitle: string,
  user: DTAUser,
  currentPath: string,
  actions?: string,
): string {
  return ComponentBuilder.pageHeader({
    title: `AFT DTA - ${title}`,
    subtitle,
    classification: 'UNCLASSIFIED',
    user,
    actions:
      actions ||
      ComponentBuilder.destructiveButton({
        children: 'Logout',
        onClick: "window.location.href='/logout'",
        size: 'sm',
      }),
    navigation: getNavItems(currentPath),
  });
}

function renderLayout(
  title: string,
  subtitle: string,
  user: DTAUser,
  currentPath: string,
  content: string,
  actions?: string,
): string {
  const header = renderPageHeader(title, subtitle, user, currentPath, actions);

  return ComponentBuilder.pageLayout({
    header,
    children: ComponentBuilder.container({ children: content }),
    footer: `
      <div class="flex justify-between items-center text-sm text-[var(--muted-foreground)] py-4">
        <span>AFT DTA Portal v1.0</span>
        <span>Last updated: ${new Date().toLocaleString()}</span>
      </div>
    `,
  });
}

// Breadcrumb navigation for nested DTA pages
function renderBreadcrumb(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const breadcrumbs: string[] = [];
  let currentPath = '';

  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const isLast = index === segments.length - 1;
    const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');

    breadcrumbs.push(
      isLast
        ? `<span class="text-[var(--foreground)]">${label}</span>`
        : `<a href="${currentPath}" class="text-[var(--primary)] hover:underline">${label}</a>`,
    );
  });

  return `
    <nav class="flex items-center space-x-2 text-sm text-[var(--muted-foreground)] mb-4">
      ${breadcrumbs.join(' <span>/</span> ')}
    </nav>
  `;
}

export const DTANavigation = {
  getNavItems,
  renderNavigation,
  renderQuickStats,
  renderPageHeader,
  renderLayout,
  renderBreadcrumb,
};
