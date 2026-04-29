// SME Navigation Component for consistent navigation across SME pages

import { ClipboardIcon, EditIcon, ListIcon } from '../components/icons';
import { ComponentBuilder } from '../components/ui/server-components';

export interface SMEUser {
  email: string;
  role: string;
}

export interface SMENavItem {
  label: string;
  href: string;
  active?: boolean;
  icon?: string;
}

const NAV_ITEMS: SMENavItem[] = [
  { label: 'Dashboard', href: '/sme', icon: EditIcon({ size: 16 }) },
  { label: 'Signature Queue', href: '/sme/signatures', icon: ClipboardIcon({ size: 16 }) },
  { label: 'Requests', href: '/sme/requests', icon: ListIcon({ size: 16 }) },
];

function getNavItems(currentPath: string): SMENavItem[] {
  return NAV_ITEMS.map((item) => ({
    ...item,
    active:
      currentPath === item.href || (item.href !== '/sme' && currentPath.startsWith(item.href)),
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
  user: SMEUser,
  currentPath: string,
  actions?: string,
): string {
  return ComponentBuilder.pageHeader({
    title: `AFT SME - ${title}`,
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
  user: SMEUser,
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
        <span>AFT SME Portal v1.0</span>
        <span>Last updated: ${new Date().toLocaleString()}</span>
      </div>
    `,
  });
}

export const SMENavigation = {
  getNavItems,
  renderNavigation,
  renderPageHeader,
  renderLayout,
};
