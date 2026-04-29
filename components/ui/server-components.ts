// Server-side component helpers for Bun server
// This file provides utilities to use our UI components in server-rendered HTML

import { CalendarIcon, ListIcon } from '../icons';
import * as UI from './index';

// Helper class to build HTML with components
function button(props: UI.ButtonProps): string {
  return UI.Button(props);
}

function primaryButton(props: Omit<UI.ButtonProps, 'variant'>): string {
  return UI.PrimaryButton(props);
}

function secondaryButton(props: Omit<UI.ButtonProps, 'variant'>): string {
  return UI.SecondaryButton(props);
}

function destructiveButton(props: Omit<UI.ButtonProps, 'variant'>): string {
  return UI.DestructiveButton(props);
}

function card(props: UI.CardProps): string {
  return UI.Card(props);
}

function statusCard(props: UI.StatusCardProps): string {
  return UI.StatusCard(props);
}

function pageHeader(props: UI.PageHeaderProps): string {
  return UI.PageHeader(props);
}

function container(props: UI.ContainerProps): string {
  return UI.Container(props);
}

function grid(props: UI.GridProps): string {
  return UI.Grid(props);
}

function pageLayout(props: {
  header: string;
  children: string;
  footer?: string;
  className?: string;
}): string {
  return UI.PageLayout(props);
}

function sectionHeader(props: {
  title: string;
  description?: string;
  actions?: string;
  className?: string;
}): string {
  return UI.SectionHeader(props);
}

function formGroup(props: UI.FormGroupProps): string {
  return UI.FormGroup(props);
}

function input(props: UI.InputProps): string {
  return UI.Input(props);
}

function label(props: UI.LabelProps): string {
  return UI.Label(props);
}

function select(props: UI.SelectProps): string {
  return UI.Select(props);
}

function table(props: UI.TableProps): string {
  return UI.Table(props);
}

function tableSearch(props: UI.TableSearchProps): string {
  return UI.TableSearch(props);
}

function tableFilters(props: UI.TableFiltersProps): string {
  return UI.TableFilters(props);
}

function tableActions(props: UI.TableActionsProps): string {
  return UI.TableActions(props);
}

function tableContainer(props: {
  title?: string;
  description?: string;
  search?: string;
  filters?: string;
  actions?: string;
  table: string;
  className?: string;
}): string {
  return UI.TableContainer(props);
}

function statusBadge(
  status: string,
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info',
): string {
  return UI.StatusBadge(status, variant);
}

function tableCellActions(
  actions: Array<{
    label: string;
    onClick: string;
    variant?: 'primary' | 'secondary' | 'destructive';
    size?: 'sm' | 'xs';
  }>,
): string {
  return UI.TableCellActions(actions);
}

function timeline(props: UI.TimelineProps): string {
  return UI.Timeline(props);
}

function statusProgress(props: UI.StatusProgressProps): string {
  return UI.StatusProgress(props);
}

function timelineStatusBadge(
  status: string,
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info',
  showProgress?: boolean,
  progressData?: { current: number; total: number },
): string {
  return UI.TimelineStatusBadge(status, variant, showProgress, progressData);
}

function viewToggle(activeView: 'table' | 'timeline'): string {
  return `
    <div class="view-toggle">
      <button 
        class="view-toggle-button ${activeView === 'table' ? 'active' : ''}" 
        onclick="switchView('table')"
        type="button"
      >
        <span class="inline-flex items-center gap-2">
          <span class="inline-block align-middle">${ListIcon({ size: 16 })}</span>
          <span>Table View</span>
        </span>
      </button>
      <button 
        class="view-toggle-button ${activeView === 'timeline' ? 'active' : ''}" 
        onclick="switchView('timeline')"
        type="button"
      >
        <span class="inline-flex items-center gap-2">
          <span class="inline-block align-middle">${CalendarIcon({ size: 16 })}</span>
          <span>Timeline View</span>
        </span>
      </button>
    </div>
  `;
}

/**
 * Renders the DAO out-of-band attestation block for a request review page.
 * For high-to-low transfers this surfaces the DAO approver name and approval
 * date that the requestor recorded at submission. For other transfer types
 * the block is omitted entirely (returns empty string) so it doesn't add
 * noise to non-applicable requests.
 */
function daoAttestationBlock(args: {
  transferType: string | null | undefined;
  daoApproved: boolean | number | null | undefined;
  daoApproverName: string | null | undefined;
  daoApprovalDate: number | null | undefined;
}): string {
  // Inline normalization (server-components.ts must not import from lib/).
  const tt = (args.transferType ?? '').toLowerCase().replace(/[-_\s]/g, '_');
  if (tt !== 'high_to_low') return '';

  const approved = !!args.daoApproved;
  const dateStr = args.daoApprovalDate
    ? new Date(Number(args.daoApprovalDate) * 1000).toISOString().slice(0, 10)
    : '';
  const name = args.daoApproverName ?? '';

  const tone = approved
    ? {
        border: 'border-[var(--success)]',
        bg: 'bg-[var(--success)]/5',
        title: 'DAO Approval Attested (out-of-band)',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[var(--success)]"><path d="M20 6L9 17l-5-5"/></svg>',
      }
    : {
        border: 'border-[var(--destructive)]',
        bg: 'bg-[var(--destructive)]/5',
        title: 'DAO Approval Missing',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[var(--destructive)]"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      };

  return `
    <div class="border-2 ${tone.border} ${tone.bg} rounded-lg p-4">
      <div class="flex items-center gap-2 mb-2">
        ${tone.icon}
        <span class="font-semibold text-[var(--foreground)]">${tone.title}</span>
      </div>
      <p class="text-xs text-[var(--muted-foreground)] mb-3">
        High-to-low transfers require the DAO to sign the AFT request form on the
        unclassified side. The fields below are the requestor's attestation that
        this signature was obtained.
      </p>
      ${
        approved
          ? `
        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">DAO Approver</dt>
            <dd class="text-[var(--foreground)] font-medium">${name || '—'}</dd>
          </div>
          <div>
            <dt class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Approval Date</dt>
            <dd class="text-[var(--foreground)] font-medium">${dateStr || '—'}</dd>
          </div>
        </dl>`
          : `
        <p class="text-sm text-[var(--destructive)]">
          The requestor has not attested to DAO approval for this high-to-low transfer.
          The request should not be approved further until this is corrected.
        </p>`
      }
    </div>
  `;
}

export const ComponentBuilder = {
  button,
  primaryButton,
  secondaryButton,
  destructiveButton,
  card,
  statusCard,
  pageHeader,
  container,
  grid,
  pageLayout,
  sectionHeader,
  formGroup,
  input,
  label,
  select,
  table,
  tableSearch,
  tableFilters,
  tableActions,
  tableContainer,
  statusBadge,
  tableCellActions,
  timeline,
  statusProgress,
  timelineStatusBadge,
  viewToggle,
  daoAttestationBlock,
};

// Pre-built component templates for common layouts
// Admin dashboard card with actions
function adminCard({
  title,
  description,
  primaryAction,
  secondaryAction,
  status,
}: {
  title: string;
  description: string;
  primaryAction: { label: string; onClick: string };
  secondaryAction?: { label: string; onClick: string };
  status?: { label: string; value: string; status: 'operational' | 'warning' | 'error' | 'info' };
}): string {
  const actions = [
    ComponentBuilder.primaryButton({
      children: primaryAction.label,
      onClick: primaryAction.onClick,
      size: 'sm',
    }),
    secondaryAction
      ? ComponentBuilder.secondaryButton({
          children: secondaryAction.label,
          onClick: secondaryAction.onClick,
          size: 'sm',
        })
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const items = status ? [status] : [];

  return ComponentBuilder.statusCard({
    title,
    items,
    actions: `
      <div class="text-sm text-[var(--muted-foreground)] mb-4">${description}</div>
      <div class="flex gap-2">${actions}</div>
    `,
  });
}

// Form field with label and error handling
function formField({
  id,
  label,
  type = 'text',
  placeholder,
  required = false,
  error,
  success,
}: {
  id: string;
  label: string;
  type?: UI.InputProps['type'];
  placeholder?: string;
  required?: boolean;
  error?: string;
  success?: string;
}): string {
  return ComponentBuilder.formGroup({
    children: [
      ComponentBuilder.label({
        htmlFor: id,
        children: label,
        required,
      }),
      ComponentBuilder.input({
        id,
        name: id,
        type,
        placeholder,
        required,
      }),
      error ? UI.ErrorMessage({ children: error }) : '',
      success ? UI.SuccessMessage({ children: success }) : '',
    ]
      .filter(Boolean)
      .join(''),
  });
}

// Navigation menu
function navigation(
  items: Array<{
    label: string;
    href: string;
    active?: boolean;
    icon?: string;
  }>,
): string {
  return `
    <nav class="flex space-x-1">
      ${items
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
          ${item.icon ? `<span class="w-4 h-4">${item.icon}</span>` : ''}
          ${item.label}
        </a>
      `,
        )
        .join('')}
    </nav>
  `;
}

// Security audit table
function auditTable(
  entries: Array<{
    timestamp: string;
    user: string;
    action: string;
    description: string;
    status: 'success' | 'warning' | 'error';
  }>,
): string {
  return `
    <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full divide-y divide-[var(--border)]">
          <thead class="bg-[var(--muted)]">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Time</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">User</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Action</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Description</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody class="bg-[var(--card)] divide-y divide-[var(--border)]">
            ${entries
              .map(
                (entry) => `
              <tr class="hover:bg-[var(--muted)]">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-[var(--foreground)]">${entry.timestamp}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-[var(--foreground)]">${entry.user}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--foreground)]">${entry.action}</td>
                <td class="px-6 py-4 text-sm text-[var(--muted-foreground)]">${entry.description}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    entry.status === 'success'
                      ? 'bg-green-100 text-green-800'
                      : entry.status === 'warning'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                  }">
                    ${entry.status.toUpperCase()}
                  </span>
                </td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export const Templates = {
  adminCard,
  formField,
  navigation,
  auditTable,
};
