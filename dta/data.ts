// DTA Data Tracking - Section 4 transfer history and anti-virus scan records
import { ComponentBuilder, Templates } from '../components/ui/server-components';
import { getDb, type Db, type DbRow } from '../lib/database-bun';
import { DTANavigation, type DTAUser } from './dta-nav';

async function render(user: DTAUser, userId: number): Promise<string> {
  const db = getDb();

  // Get actual DTA transfer history and scan data for this specific DTA
  const transferHistory = await getTransferHistory(db, userId);
  const scanStatistics = await getScanStatistics(db, userId);
  const recentTransfers = await getRecentDTATransfers(db, userId);

  // Build Section 4 tracking cards
  const transferHistoryCard = Templates.adminCard({
    title: 'My Transfer History',
    description: `You have processed ${transferHistory.totalTransfers} transfers with ${transferHistory.totalFilesTransferred.toLocaleString()} files transferred`,
    primaryAction: { label: 'View Full History', onClick: 'showTransferHistory()' },
    secondaryAction: { label: 'Export History', onClick: 'exportTransferHistory()' },
    status: {
      label: 'Total Transfers',
      value: transferHistory.totalTransfers.toString(),
      status: 'operational',
    },
  });

  const antivirusScanCard = Templates.adminCard({
    title: 'My Anti-Virus Scan Records',
    description: `You have completed ${scanStatistics.totalScans} scans on ${scanStatistics.totalFilesScanned.toLocaleString()} files with ${scanStatistics.threatsFound} threats detected`,
    primaryAction: { label: 'View Scan Records', onClick: 'showScanRecords()' },
    secondaryAction: { label: 'Scan Report', onClick: 'generateScanReport()' },
    status: {
      label: 'Scans Performed',
      value: scanStatistics.totalScans.toString(),
      status: scanStatistics.threatsFound > 0 ? 'warning' : 'operational',
    },
  });

  // Build transfer tracking table
  const transferTrackingTable = buildTransferTrackingTable(recentTransfers);

  // Build Section 4 statistics with accumulated data
  const statsCard = DTANavigation.renderQuickStats([
    { label: 'Total Transfers', value: transferHistory.totalTransfers, status: 'operational' },
    {
      label: 'Files Transferred',
      value: transferHistory.totalFilesTransferred.toLocaleString(),
      status: 'operational',
    },
    {
      label: 'Completed Transfers',
      value: transferHistory.completedTransfers,
      status: 'operational',
    },
    { label: 'DTA Signatures', value: transferHistory.signedTransfers, status: 'operational' },
    { label: 'AV Scans Completed', value: scanStatistics.totalScans, status: 'operational' },
    {
      label: 'Files Scanned',
      value: scanStatistics.totalFilesScanned.toLocaleString(),
      status: 'operational',
    },
    {
      label: 'Threats Detected',
      value: scanStatistics.threatsFound,
      status: scanStatistics.threatsFound > 0 ? 'warning' : 'operational',
    },
  ]);

  const content = `
    <div class="space-y-8">
      ${ComponentBuilder.sectionHeader({
        title: 'My DTA Data & Transfer History',
        description: `Personal transfer statistics, file tracking, and Section 4 compliance records for ${user.email}`,
      })}
      
      ${ComponentBuilder.grid({
        cols: 2,
        gap: 'lg',
        responsive: true,
        children: [transferHistoryCard, antivirusScanCard].join(''),
      })}
      
      <div>
        <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">My Transfer & Scan Statistics</h3>
        ${statsCard}
      </div>

      <div>
        <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Recent Transfer History (Last 20)</h3>
        ${transferTrackingTable}
      </div>
    </div>
  `;

  return DTANavigation.renderLayout(
    'Data Management',
    'My transfer history, file tracking, and accumulated data statistics',
    user,
    '/dta/data',
    content,
  );
}

async function getTransferHistory(db: Db, userId?: number) {
  // Get actual DTA transfer statistics with file and data size accumulation
  const baseQuery = userId
    ? `SELECT
      COUNT(*) as total_transfers,
      SUM(COALESCE(files_transferred_count, 0)) as total_files_transferred,
      COUNT(CASE WHEN transfer_completed_date IS NOT NULL THEN 1 END) as completed_transfers,
      COUNT(CASE WHEN dta_signature_date IS NOT NULL THEN 1 END) as signed_transfers
    FROM aft_requests
    WHERE dta_id = ? AND status IN ('active_transfer', 'pending_sme_signature', 'pending_media_custodian', 'completed', 'disposed')`
    : `SELECT
      COUNT(*) as total_transfers,
      SUM(COALESCE(files_transferred_count, 0)) as total_files_transferred,
      COUNT(CASE WHEN transfer_completed_date IS NOT NULL THEN 1 END) as completed_transfers,
      COUNT(CASE WHEN dta_signature_date IS NOT NULL THEN 1 END) as signed_transfers
    FROM aft_requests
    WHERE status IN ('active_transfer', 'pending_sme_signature', 'pending_media_custodian', 'completed', 'disposed')`;

  const stats = (userId
    ? await db.query(baseQuery).get(userId)
    : await db.query(baseQuery).get()) as
    | {
        total_transfers: number;
        total_files_transferred: number;
        completed_transfers: number;
        signed_transfers: number;
      }
    | undefined;

  return {
    totalTransfers: stats?.total_transfers || 0,
    totalFilesTransferred: stats?.total_files_transferred || 0,
    completedTransfers: stats?.completed_transfers || 0,
    signedTransfers: stats?.signed_transfers || 0,
  };
}

async function getScanStatistics(db: Db, userId?: number) {
  // Get actual anti-virus scan statistics from Section 4 data
  const baseQuery = userId
    ? `SELECT
      COUNT(CASE WHEN origination_scan_performed = TRUE THEN 1 END) as origination_scans,
      COUNT(CASE WHEN destination_scan_performed = TRUE THEN 1 END) as destination_scans,
      SUM(COALESCE(origination_threats_found, 0) + COALESCE(destination_threats_found, 0)) as total_threats,
      SUM(COALESCE(origination_files_scanned, 0) + COALESCE(destination_files_scanned, 0)) as total_files_scanned
    FROM aft_requests
    WHERE dta_id = ? AND status IN ('active_transfer', 'pending_sme_signature', 'pending_media_custodian', 'completed', 'disposed')`
    : `SELECT
      COUNT(CASE WHEN origination_scan_performed = TRUE THEN 1 END) as origination_scans,
      COUNT(CASE WHEN destination_scan_performed = TRUE THEN 1 END) as destination_scans,
      SUM(COALESCE(origination_threats_found, 0) + COALESCE(destination_threats_found, 0)) as total_threats,
      SUM(COALESCE(origination_files_scanned, 0) + COALESCE(destination_files_scanned, 0)) as total_files_scanned
    FROM aft_requests
    WHERE status IN ('active_transfer', 'pending_sme_signature', 'pending_media_custodian', 'completed', 'disposed')`;

  const scanStats = (userId
    ? await db.query(baseQuery).get(userId)
    : await db.query(baseQuery).get()) as
    | {
        origination_scans: number;
        destination_scans: number;
        total_threats: number;
        total_files_scanned: number;
      }
    | undefined;

  return {
    totalScans: (scanStats?.origination_scans || 0) + (scanStats?.destination_scans || 0),
    originationScans: scanStats?.origination_scans || 0,
    destinationScans: scanStats?.destination_scans || 0,
    threatsFound: scanStats?.total_threats || 0,
    totalFilesScanned: scanStats?.total_files_scanned || 0,
  };
}

async function getRecentDTATransfers(db: Db, userId?: number) {
  // Get recent transfers that DTA has handled
  const baseQuery = userId
    ? `SELECT
      r.id,
      r.request_number,
      r.status,
      r.origination_scan_performed,
      r.destination_scan_performed,
      r.origination_threats_found,
      r.destination_threats_found,
      r.origination_files_scanned,
      r.destination_files_scanned,
      r.files_transferred_count,
      r.file_size,
      r.transfer_completed_date,
      r.dta_signature_date,
      r.created_at,
      r.updated_at,
      COALESCE(u.first_name || ' ' || u.last_name, u.email) as requestor_name
    FROM aft_requests r
    LEFT JOIN users u ON r.requestor_id = u.id
    WHERE r.dta_id = ? AND r.status IN ('active_transfer', 'pending_sme_signature', 'pending_media_custodian', 'completed', 'disposed')
    ORDER BY r.updated_at DESC
    LIMIT 20`
    : `SELECT
      r.id,
      r.request_number,
      r.status,
      r.origination_scan_performed,
      r.destination_scan_performed,
      r.origination_threats_found,
      r.destination_threats_found,
      r.origination_files_scanned,
      r.destination_files_scanned,
      r.files_transferred_count,
      r.file_size,
      r.transfer_completed_date,
      r.dta_signature_date,
      r.created_at,
      r.updated_at,
      COALESCE(u.first_name || ' ' || u.last_name, u.email) as requestor_name
    FROM aft_requests r
    LEFT JOIN users u ON r.requestor_id = u.id
    WHERE r.status IN ('active_transfer', 'pending_sme_signature', 'pending_media_custodian', 'completed', 'disposed')
    ORDER BY r.updated_at DESC
    LIMIT 20`;

  return userId
    ? await db.query(baseQuery).all(userId)
    : ((await db.query(baseQuery).all()) as DbRow[]);
}

function buildTransferTrackingTable(transfers: any[]): string {
  if (transfers.length === 0) {
    return `
      <div class="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
        <div class="text-4xl mb-4">📋</div>
        <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No DTA Activity</h3>
        <p class="text-[var(--muted-foreground)] mb-4">No transfers have been processed by DTA yet.</p>
      </div>
    `;
  }

  // Transform transfers data for table
  const tableData = transfers.map((transfer) => ({
    id: transfer.id,
    request_number: transfer.request_number,
    requestor_name: transfer.requestor_name,
    status: transfer.status,
    origination_scan_performed: transfer.origination_scan_performed,
    destination_scan_performed: transfer.destination_scan_performed,
    origination_threats_found: transfer.origination_threats_found || 0,
    destination_threats_found: transfer.destination_threats_found || 0,
    origination_files_scanned: transfer.origination_files_scanned || 0,
    destination_files_scanned: transfer.destination_files_scanned || 0,
    files_transferred_count: transfer.files_transferred_count || 0,
    file_size: transfer.file_size || 'Unknown',
    transfer_completed_date: transfer.transfer_completed_date,
    dta_signature_date: transfer.dta_signature_date,
    created_at: transfer.created_at,
    updated_at: transfer.updated_at,
  }));

  // Define table columns for Section 4 tracking
  const columns = [
    {
      key: 'request_number',
      label: 'Request',
      render: (_value: unknown, row: DbRow) => `
        <div>
          <div class="font-medium text-[var(--foreground)]">${row.request_number}</div>
          <div class="text-sm text-[var(--muted-foreground)]">ID: ${row.id}</div>
        </div>
      `,
    },
    {
      key: 'requestor_name',
      label: 'Requestor',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">${row.requestor_name}</div>
      `,
    },
    {
      key: 'av_scans',
      label: 'Anti-Virus Scans',
      render: (_value: unknown, row: DbRow) => `
        <div class="space-y-1">
          <div class="flex items-center gap-2 text-xs">
            <span class="${row.origination_scan_performed ? 'text-[var(--success)]' : 'text-[var(--muted-foreground)]'}">
              ${row.origination_scan_performed ? '✓' : '○'} Origin
            </span>
            ${Number(row.origination_threats_found) > 0 ? `<span class="text-[var(--destructive)]">${row.origination_threats_found} threats</span>` : ''}
          </div>
          <div class="flex items-center gap-2 text-xs">
            <span class="${row.destination_scan_performed ? 'text-[var(--success)]' : 'text-[var(--muted-foreground)]'}">
              ${row.destination_scan_performed ? '✓' : '○'} Dest
            </span>
            ${Number(row.destination_threats_found) > 0 ? `<span class="text-[var(--destructive)]">${row.destination_threats_found} threats</span>` : ''}
          </div>
        </div>
      `,
    },
    {
      key: 'files_scanned',
      label: 'Files Scanned',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">
          ${Number(row.origination_files_scanned || 0) + Number(row.destination_files_scanned || 0)} files
        </div>
      `,
    },
    {
      key: 'files_transferred',
      label: 'Files Transferred',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">
          ${Number(row.files_transferred_count) > 0 ? `${Number(row.files_transferred_count).toLocaleString()} files` : 'Not completed'}
        </div>
      `,
    },
    {
      key: 'file_size',
      label: 'Data Size',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">
          ${row.file_size !== 'Unknown' ? row.file_size : 'N/A'}
        </div>
      `,
    },
    {
      key: 'status',
      label: 'Status',
      render: (_value: unknown, row: DbRow) => {
        const statusVariant = {
          active_transfer: 'info',
          pending_sme_signature: 'warning',
          completed: 'success',
          disposed: 'default',
        } as const;

        const variant = statusVariant[row.status as keyof typeof statusVariant] || 'default';

        return ComponentBuilder.statusBadge(String(row.status).replace('_', ' ').toUpperCase(), variant);
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_value: unknown, row: DbRow) => {
        const actions = [
          {
            label: 'View Details',
            onClick: `viewTransferDetails(${row.id})`,
            variant: 'secondary' as const,
          },
          {
            label: 'Scan History',
            onClick: `viewScanHistory(${row.id})`,
            variant: 'secondary' as const,
          },
        ];

        return ComponentBuilder.tableCellActions(actions);
      },
    },
  ];

  // Create table
  const table = ComponentBuilder.table({
    columns,
    rows: tableData,
    emptyMessage: 'No storage data found',
    compact: false,
  });

  // Create search and filters for Section 4 data
  const search = ComponentBuilder.tableSearch({
    placeholder: 'Search transfer history...',
    onSearch: 'filterTransferHistory',
  });

  const filters = ComponentBuilder.tableFilters({
    filters: [
      {
        key: 'scan_status',
        label: 'All Scan Status',
        options: [
          { value: 'both_complete', label: 'Both Scans Complete' },
          { value: 'partial', label: 'Partial Scans' },
          { value: 'none', label: 'No Scans' },
          { value: 'threats_found', label: 'Threats Detected' },
        ],
        onChange: 'filterByScanStatus',
      },
      {
        key: 'section4_status',
        label: 'All Section 4 Status',
        options: [
          { value: 'in_progress', label: 'In Progress' },
          { value: 'scans_complete', label: 'Scans Complete' },
          { value: 'transfer_complete', label: 'Transfer Complete' },
          { value: 'dta_signed', label: 'DTA Signed' },
        ],
        onChange: 'filterBySection4Status',
      },
    ],
  });

  const actions = ComponentBuilder.tableActions({
    primary: {
      label: 'Section 4 Report',
      onClick: 'generateSection4Report()',
    },
    secondary: [
      { label: 'Export Scan Data', onClick: 'exportScanData()' },
      { label: 'Export Signatures', onClick: 'exportDTASignatures()' },
    ],
  });

  return ComponentBuilder.tableContainer({
    title: 'Transfer History',
    description: 'Track transfers and anti-virus scan results',
    search,
    filters,
    actions,
    table,
    className: 'bg-[var(--card)] rounded-lg border border-[var(--border)]',
  });
}

function getScript(): string {
  return `
    function showTransferHistory() {
      alert('My Transfer History:\\n\\nThis would show your comprehensive transfer history including:\\n• All transfers you have processed as DTA\\n• Files transferred counts and data sizes\\n• Section 4 completion timestamps\\n• Your DTA signature records\\n• Personal compliance metrics');
    }

    function exportTransferHistory() {
      alert('Exporting my transfer history...\\n\\nThis would generate your personal DTA report including:\\n• All transfers you have managed\\n• Accumulated file counts and data sizes\\n• Your Section 4 completion statistics\\n• Personal productivity metrics');
    }
    
    function showScanRecords() {
      alert('Anti-Virus Scan Records:\\n\\nThis would display detailed scan information including:\\n• Origination and destination scan results\\n• Files scanned counts\\n• Threats detected and mitigated\\n• Scan timestamps and technician records\\n• Compliance with Section 4 requirements');
    }
    
    function generateScanReport() {
      alert('Generating scan report...\\n\\nThis would create a detailed anti-virus report including:\\n• Total scans performed\\n• Threat detection statistics\\n• Scan coverage metrics\\n• Section 4 compliance status');
    }
    
    function showDTASignatures() {
      alert('DTA Signatures:\\n\\nThis would show all DTA signatures including:\\n• Signature timestamps\\n• Request completion status\\n• Two-Person Integrity workflow\\n• Audit trail for compliance\\n• SME signature coordination');
    }
    
    function generateSignatureReport() {
      alert('Generating signature report...\\n\\nThis would create a report of all DTA signatures including:\\n• Signature completion rates\\n• Timeline metrics\\n• Compliance tracking\\n• Audit documentation');
    }
    
    function showComplianceDashboard() {
      alert('Section 4 Compliance Dashboard:\\n\\nThis would display comprehensive compliance metrics including:\\n• Section 4 completion rates\\n• Anti-virus scan compliance\\n• DTA signature compliance\\n• Two-Person Integrity tracking\\n• Audit readiness status');
    }
    
    function generateAuditReport() {
      alert('Generating audit report...\\n\\nThis would create a comprehensive audit report including:\\n• Section 4 compliance verification\\n• Anti-virus scan documentation\\n• DTA signature audit trail\\n• Process compliance metrics\\n• Regulatory compliance status');
    }
    
    function viewSection4Details(requestId) {
      alert('Section 4 Details for Request ' + requestId + ':\\n\\nThis would show comprehensive Section 4 information including:\\n• Anti-virus scan details\\n• Transfer completion status\\n• DTA signature information\\n• Two-Person Integrity workflow\\n• Compliance documentation');
    }
    
    function viewScanHistory(requestId) {
      alert('Scan History for Request ' + requestId + ':\\n\\nThis would show detailed scan information including:\\n• Origination scan results\\n• Destination scan results\\n• Files scanned counts\\n• Threats detected\\n• Scan timestamps and operators');
    }
    
    function generateSection4Report() {
      alert('Generating Section 4 Report...\\n\\nThis would create a comprehensive Section 4 report including:\\n• All transfer Section 4 data\\n• Anti-virus scan summary\\n• DTA signature tracking\\n• Compliance metrics\\n• Audit trail documentation');
    }
    
    function exportScanData() {
      alert('Exporting scan data...\\n\\nThis would export detailed anti-virus scan data including:\\n• Scan results by request\\n• Threat detection records\\n• File scan counts\\n• Compliance metrics');
    }
    
    function exportDTASignatures() {
      alert('Exporting DTA signatures...\\n\\nThis would export DTA signature data including:\\n• Signature timestamps\\n• Request completion data\\n• Two-Person Integrity records\\n• Compliance documentation');
    }
    
    function filterTransferHistory(searchTerm) {
      const rows = document.querySelectorAll('tbody tr');
      const term = searchTerm.toLowerCase();
      
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
      });
    }
    
    function filterByScanStatus(status) {
      const rows = document.querySelectorAll('tbody tr');
      
      rows.forEach(row => {
        if (!status) {
          row.style.display = '';
          return;
        }
        
        // This would filter based on actual scan status in a real implementation
        row.style.display = '';
      });
    }
    
    function filterBySection4Status(status) {
      const rows = document.querySelectorAll('tbody tr');
      
      rows.forEach(row => {
        if (!status) {
          row.style.display = '';
          return;
        }
        
        // This would filter based on Section 4 status in a real implementation
        row.style.display = '';
      });
    }
  `;
}

export const DTADataManagement = {
  render,
  getScript,
};
