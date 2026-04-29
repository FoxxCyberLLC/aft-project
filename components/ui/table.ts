import type { DbRow } from '../../lib/database-bun';
// Reusable Table Component with consistent styling
export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, row: DbRow) => string;
}

export interface TableRow {
  [key: string]: unknown;
  id?: string | number;
}

export interface TableProps {
  columns: TableColumn[];
  rows: TableRow[];
  className?: string;
  striped?: boolean;
  hoverable?: boolean;
  bordered?: boolean;
  compact?: boolean;
  emptyMessage?: string;
  loading?: boolean;
  onRowClick?: string; // JavaScript function name
}

export interface TableSearchProps {
  placeholder?: string;
  onSearch?: string; // JavaScript function name
  className?: string;
}

export interface TableFiltersProps {
  filters: Array<{
    key: string;
    label: string;
    options: Array<{ value: string; label: string }>;
    onChange?: string; // JavaScript function name
  }>;
  className?: string;
}

export interface TableActionsProps {
  primary?: {
    label: string;
    onClick: string;
    icon?: string;
  };
  secondary?: Array<{
    label: string;
    onClick: string;
    icon?: string;
  }>;
  className?: string;
}

export function Table({
  columns,
  rows,
  className = '',
  striped = true,
  hoverable = true,
  bordered = true,
  compact = false,
  emptyMessage = 'No data available',
  loading = false,
  onRowClick,
}: TableProps): string {
  if (loading) {
    return `
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] overflow-hidden ${className}">
        <div class="flex items-center justify-center py-12">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
          <span class="ml-2 text-[var(--muted-foreground)]">Loading...</span>
        </div>
      </div>
    `;
  }

  if (rows.length === 0) {
    return `
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] overflow-hidden ${className}">
        <div class="text-center py-12">
          <div class="text-4xl mb-4">📄</div>
          <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No Data</h3>
          <p class="text-[var(--muted-foreground)]">${emptyMessage}</p>
        </div>
      </div>
    `;
  }

  const headerCells = columns
    .map(
      (column) => `
    <th class="text-${column.align || 'left'} px-4 py-3 font-medium text-[var(--foreground)] bg-[var(--muted)] ${column.width ? `w-${column.width}` : ''} ${column.sortable ? 'cursor-pointer hover:bg-[var(--secondary)] transition-colors' : ''}" ${column.sortable ? `onclick="sortTable('${column.key}')"` : ''}>
      <div class="flex items-center gap-2">
        ${column.label}
        ${column.sortable ? '<span class="sort-indicator text-xs text-[var(--muted-foreground)]">↕</span>' : ''}
      </div>
    </th>
  `,
    )
    .join('');

  const bodyRows = rows
    .map(
      (row) => `
    <tr class="${hoverable ? 'hover:bg-[var(--muted)] transition-colors' : ''} ${onRowClick ? 'cursor-pointer' : ''} ${bordered ? 'border-b border-[var(--border)]' : ''}" ${onRowClick ? `onclick="${onRowClick}('${row.id || ''}')"` : ''}>
      ${columns
        .map((column) => {
          const value = row[column.key];
          const displayValue = column.render ? column.render(value, row) : value || '';
          return `
          <td class="px-4 py-${compact ? '2' : '3'} text-${column.align || 'left'}">
            ${displayValue}
          </td>
        `;
        })
        .join('')}
    </tr>
  `,
    )
    .join('');

  return `
    <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] overflow-hidden ${className}">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr>
              ${headerCells}
            </tr>
          </thead>
          <tbody class="${striped ? 'divide-y divide-[var(--border)]' : ''}">
            ${bodyRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function TableSearch({
  placeholder = 'Search...',
  onSearch = 'handleSearch',
  className = '',
}: TableSearchProps): string {
  return `
    <div class="relative ${className}">
      <input 
        type="text" 
        placeholder="${placeholder}"
        class="w-full pl-10 pr-4 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-colors"
        oninput="${onSearch}(this.value)"
      >
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg class="h-4 w-4 text-[var(--muted-foreground)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
      </div>
    </div>
  `;
}

export function TableFilters({ filters, className = '' }: TableFiltersProps): string {
  const filterElements = filters
    .map(
      (filter) => `
    <select 
      class="px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors"
      ${filter.onChange ? `onchange="${filter.onChange}(this.value)"` : ''}
    >
      <option value="">${filter.label}</option>
      ${filter.options
        .map(
          (option) => `
        <option value="${option.value}">${option.label}</option>
      `,
        )
        .join('')}
    </select>
  `,
    )
    .join('');

  return `
    <div class="flex gap-3 ${className}">
      ${filterElements}
    </div>
  `;
}

export function TableActions({
  primary,
  secondary = [],
  className = '',
}: TableActionsProps): string {
  const secondaryButtons = secondary
    .map(
      (action) => `
    <button 
      onclick="${action.onClick}"
      class="px-3 py-2 bg-[var(--secondary)] text-[var(--secondary-foreground)] border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors text-sm font-medium flex items-center gap-2"
    >
      ${action.icon || ''}
      ${action.label}
    </button>
  `,
    )
    .join('');

  return `
    <div class="flex gap-3 items-center ${className}">
      ${
        secondary.length > 0
          ? `
        <div class="flex gap-2">
          ${secondaryButtons}
        </div>
      `
          : ''
      }
      
      ${
        primary
          ? `
        <button 
          onclick="${primary.onClick}"
          class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90 transition-colors text-sm font-weight-600 flex items-center gap-2"
        >
          ${primary.icon || ''}
          ${primary.label}
        </button>
      `
          : ''
      }
    </div>
  `;
}

export function TableContainer({
  title,
  description,
  search,
  filters,
  actions,
  table,
  className = '',
}: {
  title?: string;
  description?: string;
  search?: string;
  filters?: string;
  actions?: string;
  table: string;
  className?: string;
}): string {
  return `
    <div class="space-y-6 ${className}">
      ${
        title
          ? `
        <div>
          <h2 class="text-xl font-semibold text-[var(--foreground)] mb-1">${title}</h2>
          ${description ? `<p class="text-[var(--muted-foreground)] text-sm">${description}</p>` : ''}
        </div>
      `
          : ''
      }
      
      ${
        search || filters || actions
          ? `
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div class="flex flex-col sm:flex-row gap-3">
            ${search || ''}
            ${filters || ''}
          </div>
          ${actions || ''}
        </div>
      `
          : ''
      }
      
      ${table}
    </div>
  `;
}

// Utility function to generate status badges
export function StatusBadge(
  status: string,
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info',
): string {
  const variants = {
    default: 'bg-[var(--secondary)] text-[var(--secondary-foreground)]',
    success: 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20',
    warning: 'bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20',
    error:
      'bg-[var(--destructive)]/10 text-[var(--destructive)] border border-[var(--destructive)]/20',
    info: 'bg-[var(--info)]/10 text-[var(--info)] border border-[var(--info)]/20',
  };

  const variantClass = variants[variant || 'default'];

  return `
    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClass}">
      ${status}
    </span>
  `;
}

// Utility function for action buttons in table cells
export function TableCellActions(
  actions: Array<{
    label: string;
    onClick: string;
    variant?: 'primary' | 'secondary' | 'destructive';
    size?: 'sm' | 'xs';
  }>,
): string {
  return `
    <div class="flex gap-1">
      ${actions
        .map((action) => {
          const variants = {
            primary:
              'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90',
            secondary:
              'bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--muted)]',
            destructive:
              'bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:bg-[var(--destructive)]/90',
          };
          const sizes = {
            xs: 'px-2 py-1 text-xs',
            sm: 'px-3 py-1.5 text-sm',
          };

          const variantClass = variants[action.variant || 'secondary'];
          const sizeClass = sizes[action.size || 'xs'];

          return `
          <button 
            onclick="${action.onClick}"
            class="${variantClass} ${sizeClass} rounded transition-colors font-medium"
          >
            ${action.label}
          </button>
        `;
        })
        .join('')}
    </div>
  `;
}
