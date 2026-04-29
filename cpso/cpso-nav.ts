// CPSO Navigation Component for consistent navigation across CPSO pages

import { ChartBarIcon, CheckCircleIcon, ClipboardIcon, ClockIcon } from '../components/icons';
import { ComponentBuilder } from '../components/ui/server-components';

export interface CPSOUser {
  email: string;
  role: string;
}

export interface CPSONavItem {
  label: string;
  href: string;
  active?: boolean;
  icon?: string;
}

const NAV_ITEMS: CPSONavItem[] = [
  { label: 'Dashboard', href: '/cpso', icon: ChartBarIcon({ size: 16 }) },
  { label: 'Pending Approvals', href: '/cpso/pending', icon: ClockIcon({ size: 16 }) },
  { label: 'Approved', href: '/cpso/approved', icon: CheckCircleIcon({ size: 16 }) },
  { label: 'Reports', href: '/cpso/reports', icon: ClipboardIcon({ size: 16 }) },
  { label: 'All Requests', href: '/cpso/all-requests', icon: ClipboardIcon({ size: 16 }) },
];

function getNavItems(currentPath: string): CPSONavItem[] {
  return NAV_ITEMS.map((item) => ({
    ...item,
    active:
      currentPath === item.href || (item.href !== '/cpso' && currentPath.startsWith(item.href)),
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

function renderPageHeader(
  title: string,
  subtitle: string,
  user: CPSOUser,
  currentPath: string,
  actions?: string,
): string {
  return ComponentBuilder.pageHeader({
    title: `AFT CPSO - ${title}`,
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
  user: CPSOUser,
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
        <span>AFT Approver Portal v1.0</span>
        <span>Last updated: ${new Date().toLocaleString()}</span>
      </div>
    `,
  });
}

// Breadcrumb navigation for nested approver pages
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

// Quick stats component for approver dashboard
function renderQuickStats(
  stats: Array<{
    label: string;
    value: number | string;
    status: 'operational' | 'warning' | 'error';
  }>,
): string {
  return `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      ${stats
        .map(
          (stat) => `
        <div class="stat-card">
          <div class="text-sm text-[var(--muted-foreground)] mb-1">${stat.label}</div>
          <div class="text-2xl font-bold text-[var(--foreground)]">${stat.value}</div>
          <div class="mt-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              stat.status === 'operational'
                ? 'bg-green-100 text-green-800'
                : stat.status === 'warning'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
            }">
              ${stat.status === 'operational' ? '●' : stat.status === 'warning' ? '◐' : '○'} 
              ${stat.status.charAt(0).toUpperCase() + stat.status.slice(1)}
            </span>
          </div>
        </div>
      `,
        )
        .join('')}
    </div>
  `;
}

export const CPSONavigation = {
  getNavItems,
  renderNavigation,
  renderPageHeader,
  renderLayout,
  renderBreadcrumb,
  renderQuickStats,
};
