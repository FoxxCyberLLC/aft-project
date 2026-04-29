// UI Components Library Index
// Export all components for easy importing

// Button Components
export {
  Button,
  type ButtonProps,
  DestructiveButton,
  PrimaryButton,
  SecondaryButton,
  SuccessButton,
  WarningButton,
} from './button';

// Card Components
export {
  Card,
  CardContent,
  type CardContentProps,
  CardDescription,
  CardFooter,
  type CardFooterProps,
  CardHeader,
  type CardHeaderProps,
  type CardProps,
  CardTitle,
  StatusCard,
  type StatusCardProps,
} from './card';

// Form Components
export {
  ErrorMessage,
  FormGroup,
  type FormGroupProps,
  FormSection,
  Input,
  type InputProps,
  Label,
  type LabelProps,
  Select,
  type SelectProps,
  SuccessMessage,
  Textarea,
  type TextareaProps,
} from './form';

// Layout Components
export {
  Container,
  type ContainerProps,
  Grid,
  type GridProps,
  MainContent,
  PageFooter,
  PageHeader,
  type PageHeaderProps,
  PageLayout,
  SectionHeader,
  Sidebar,
} from './layout';

// Table Components
export {
  StatusBadge,
  Table,
  TableActions,
  type TableActionsProps,
  TableCellActions,
  type TableColumn,
  TableContainer,
  TableFilters,
  type TableFiltersProps,
  type TableProps,
  type TableRow,
  TableSearch,
  type TableSearchProps,
} from './table';

// Timeline Components
export {
  AFT_STATUS_LABELS,
  AFT_WORKFLOW_STEPS,
  StatusProgress,
  type StatusProgressProps,
  Timeline,
  type TimelineProps,
  TimelineStatusBadge,
  type TimelineStep,
} from './timeline';

// Utility function to combine classes
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Theme utilities
export const theme = {
  colors: {
    primary: 'var(--primary)',
    'primary-foreground': 'var(--primary-foreground)',
    secondary: 'var(--secondary)',
    'secondary-foreground': 'var(--secondary-foreground)',
    destructive: 'var(--destructive)',
    'destructive-foreground': 'var(--destructive-foreground)',
    warning: 'var(--warning)',
    'warning-foreground': 'var(--warning-foreground)',
    success: 'var(--success)',
    'success-foreground': 'var(--success-foreground)',
    muted: 'var(--muted)',
    'muted-foreground': 'var(--muted-foreground)',
    accent: 'var(--accent)',
    'accent-foreground': 'var(--accent-foreground)',
    card: 'var(--card)',
    'card-foreground': 'var(--card-foreground)',
    border: 'var(--border)',
    input: 'var(--input)',
    ring: 'var(--ring)',
    background: 'var(--background)',
    foreground: 'var(--foreground)',
  },
  spacing: {
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  borderRadius: {
    sm: 'calc(var(--radius) - 2px)',
    md: 'var(--radius)',
    lg: 'calc(var(--radius) + 2px)',
  },
  shadows: {
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow)',
    lg: 'var(--shadow-lg)',
    xl: 'var(--shadow-xl)',
  },
};

// Component variants
export const variants = {
  button: {
    primary: 'action-btn primary',
    secondary: 'action-btn secondary',
    warning: 'action-btn warning',
    destructive: 'logout-btn',
    success: 'acknowledge-btn',
  },
  card: {
    default: 'status-card',
    elevated: 'status-card hover:shadow-lg',
    outlined: 'status-card border-2',
  },
} as const;
