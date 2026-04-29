// Media Custodian Inventory Management - Full CRUD operations for media drives
import { ComponentBuilder } from '../components/ui/server-components';
import { getDb, type DbRow } from '../lib/database-bun';
import { MediaCustodianNavigation, type MediaCustodianUser } from './media-custodian-nav';

async function render(user: MediaCustodianUser, _userId: number): Promise<string> {
  const db = getDb();

  // Get all media drives from database
  const drives = (await db
    .query(`
    SELECT md.*, u.email as issued_to_email, u.first_name, u.last_name
    FROM media_drives md
    LEFT JOIN users u ON md.issued_to_user_id = u.id
    ORDER BY md.created_at DESC
  `)
    .all()) as DbRow[];

  // Get only DTAs for drive assignment dropdown
  const users = (await db
    .query(`
    SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = TRUE
    WHERE u.is_active = TRUE AND ur.role = 'dta'
    ORDER BY u.last_name, u.first_name
  `)
    .all()) as DbRow[];

  // Build drives table
  const drivesTable = buildDrivesTable(drives);

  // Build add drive form
  const addDriveForm = buildAddDriveForm();

  // Build issue drive modal
  const issueDriveModal = buildIssueDriveModal(users);

  const pageContent = `
    <div class="space-y-6">
      <!-- Action Bar -->
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-2xl font-bold text-[var(--foreground)]">Media Drives</h2>
          <p class="text-[var(--muted-foreground)]">Track and manage physical media devices</p>
        </div>
        <button onclick="showAddDriveModal()" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90">
          Add New Drive
        </button>
      </div>

      <!-- Statistics Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        ${buildStatsCards(drives)}
      </div>

      <!-- Drives Table -->
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)]">
        <div class="p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold text-[var(--foreground)]">All Media Drives</h3>
            <div class="flex space-x-2">
              <input type="text" id="search-drives" placeholder="Search drives..." 
                     class="px-3 py-2 border border-[var(--border)] rounded-md text-sm" onkeyup="filterDrives()">
              <select id="status-filter" onchange="filterDrives()" 
                      class="px-3 py-2 border border-[var(--border)] rounded-md text-sm">
                <option value="">All Status</option>
                <option value="available">Available</option>
                <option value="issued">Issued</option>
                <option value="in_use">In Use</option>
                <option value="maintenance">Maintenance</option>
                <option value="retired">Retired</option>
              </select>
            </div>
          </div>
          ${drivesTable}
        </div>
      </div>
    </div>

    <!-- Add Drive Modal -->
    ${addDriveForm}
    
    <!-- Issue Drive Modal -->
    ${issueDriveModal}
    
    <!-- Edit Drive Modal -->
    ${buildEditDriveModal()}
  `;

  return MediaCustodianNavigation.renderLayout(
    'Media Inventory',
    'Manage physical media drives and track their status',
    user,
    '/media-custodian/inventory',
    pageContent,
  );
}

function buildStatsCards(drives: any[]): string {
  const total = drives.length;
  const available = drives.filter((d) => d.status === 'available').length;
  const issued = drives.filter((d) => d.status === 'issued').length;
  const inUse = drives.filter((d) => d.status === 'in_use').length;

  return `
    <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
      <div class="text-2xl font-bold text-[var(--foreground)]">${total}</div>
      <div class="text-sm text-[var(--muted-foreground)]">Total Drives</div>
    </div>
    <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
      <div class="text-2xl font-bold text-[var(--success)]">${available}</div>
      <div class="text-sm text-[var(--muted-foreground)]">Available</div>
    </div>
    <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
      <div class="text-2xl font-bold text-[var(--warning)]">${issued}</div>
      <div class="text-sm text-[var(--muted-foreground)]">Issued</div>
    </div>
    <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
      <div class="text-2xl font-bold text-[var(--info)]">${inUse}</div>
      <div class="text-sm text-[var(--muted-foreground)]">In Use</div>
    </div>
  `;
}

function buildDrivesTable(drives: any[]): string {
  if (drives.length === 0) {
    return `
      <div class="text-center py-8">
        <div class="text-4xl mb-4">💾</div>
        <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No Media Drives</h3>
        <p class="text-[var(--muted-foreground)] mb-4">No media drives have been added to the inventory yet.</p>
        <button onclick="showAddDriveModal()" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md">
          Add First Drive
        </button>
      </div>
    `;
  }

  // Transform drives data for table
  const tableData = drives.map((drive) => ({
    id: drive.id,
    serial_number: drive.serial_number,
    media_control_number: drive.media_control_number,
    type: drive.type,
    model: drive.model,
    capacity: drive.capacity,
    status: drive.status,
    location: drive.location,
    issued_to: drive.issued_to_email
      ? `${drive.first_name} ${drive.last_name} (${drive.issued_to_email})`
      : null,
    last_used: drive.last_used,
    created_at: drive.created_at,
    issued_at: drive.issued_at,
    returned_at: drive.returned_at,
  }));

  // Define table columns
  const columns = [
    {
      key: 'serial_number',
      label: 'Serial Number',
      render: (_value: unknown, row: DbRow) => `
        <div>
          <div class="font-medium text-[var(--foreground)]">${row.serial_number}</div>
          <div class="text-sm text-[var(--muted-foreground)]">ID: ${row.id}</div>
        </div>
      `,
    },
    {
      key: 'media_control_number',
      label: 'Media Control #',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">${row.media_control_number || '-'}</div>
      `,
    },
    {
      key: 'type',
      label: 'Type & Model',
      render: (_value: unknown, row: DbRow) => `
        <div>
          <div class="font-medium text-[var(--foreground)]">${row.type}</div>
          <div class="text-sm text-[var(--muted-foreground)]">${row.model}</div>
        </div>
      `,
    },
    {
      key: 'capacity',
      label: 'Capacity',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">${row.capacity}</div>
      `,
    },
    {
      key: 'status',
      label: 'Status',
      render: (_value: unknown, row: DbRow) => {
        const statusVariant = {
          available: 'success',
          issued: 'warning',
          in_use: 'info',
          maintenance: 'warning',
          retired: 'default',
        } as const;

        const variant = statusVariant[row.status as keyof typeof statusVariant] || 'default';

        return ComponentBuilder.statusBadge(String(row.status).replace('_', ' ').toUpperCase(), variant);
      },
    },
    {
      key: 'location',
      label: 'Location',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">${row.location || 'Not specified'}</div>
      `,
    },
    {
      key: 'issued_to',
      label: 'Issued To',
      render: (_value: unknown, row: DbRow) => `
        <div class="text-sm text-[var(--foreground)]">${row.issued_to || 'Not issued'}</div>
      `,
    },
    {
      key: 'last_activity',
      label: 'Last Activity',
      render: (_value: unknown, row: DbRow) => {
        const ts = row.issued_at || row.returned_at || row.last_used || row.created_at;
        const label = row.issued_at
          ? 'Issued'
          : row.returned_at
            ? 'Returned'
            : row.last_used
              ? 'Used'
              : 'Created';
        return `
          <div class="text-sm text-[var(--foreground)]">
            ${ts ? new Date(ts * 1000).toLocaleDateString() : 'Never'}
            <span class="text-[var(--muted-foreground)]">(${label})</span>
          </div>
        `;
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_value: unknown, row: DbRow) => `
        <div class="flex gap-2">
          ${
            row.status === 'available'
              ? ComponentBuilder.button({
                  children: 'Issue',
                  variant: 'secondary',
                  onClick: `issueDrive(${row.id})`,
                })
              : row.status === 'issued'
                ? ComponentBuilder.button({
                    children: 'Return',
                    variant: 'secondary',
                    onClick: `returnDrive(${row.id})`,
                  })
                : ''
          }
          ${ComponentBuilder.button({ children: 'Edit', variant: 'secondary', onClick: `editDrive(${row.id})` })}
          ${ComponentBuilder.button({ children: 'Delete', variant: 'destructive', onClick: `deleteDrive(${row.id})` })}
        </div>
      `,
    },
  ];

  // Create table
  const table = ComponentBuilder.table({
    columns,
    rows: tableData,
    emptyMessage: 'No drives found matching your criteria',
    compact: false,
  });

  return table;
}

function buildAddDriveForm(): string {
  return `
    <div id="add-drive-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden flex items-center justify-center z-50">
      <div class="bg-[var(--background)] rounded-lg shadow-xl max-w-md w-full mx-4">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-[var(--foreground)]">Add New Drive</h3>
            <button onclick="hideAddDriveModal()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">&times;</button>
          </div>
          
          <form id="add-drive-form" onsubmit="submitAddDrive(event)">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Media Control Number *</label>
                <input type="text" name="media_control_number" required 
                       class="w-full px-3 py-2 border border-[var(--border)] rounded-md" placeholder="e.g., MCN-001">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Serial Number *</label>
                <input type="text" name="serial_number" required 
                       class="w-full px-3 py-2 border border-[var(--border)] rounded-md">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Type *</label>
                <select name="type" required class="w-full px-3 py-2 border border-[var(--border)] rounded-md">
                  <option value="">Select type</option>
                  <option value="SSD">SSD (Solid State Drive)</option>
                  <option value="SSD-T">SSD (Travel)</option>
                  <option value="USB">USB Drive</option>
                  <option value="DVD">DVD</option>
                  <option value="DVD-R">DVD (Rewritable)</option>
                  <option value="CD">CD</option>
                  <option value="CD-R">CD (Rewritable)</option>
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Model *</label>
                <input type="text" name="model" required 
                       class="w-full px-3 py-2 border border-[var(--border)] rounded-md">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Capacity *</label>
                <input type="text" name="capacity" required placeholder="e.g., 1TB, 32GB, 4.7GB"
                       class="w-full px-3 py-2 border border-[var(--border)] rounded-md">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Location</label>
                <input type="text" name="location" placeholder="e.g., Secure Storage A-1"
                       class="w-full px-3 py-2 border border-[var(--border)] rounded-md">
              </div>
            </div>
            
            <div class="flex justify-end space-x-2 mt-6">
              <button type="button" onclick="hideAddDriveModal()" 
                      class="px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)]">
                Cancel
              </button>
              <button type="submit" 
                      class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90">
                Add Drive
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

function buildIssueDriveModal(users: any[]): string {
  const userOptions = users
    .map(
      (user) =>
        `<option value="${user.id}">${user.first_name} ${user.last_name} (${user.email})</option>`,
    )
    .join('');

  return `
    <div id="issue-drive-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden flex items-center justify-center z-50">
      <div class="bg-[var(--background)] rounded-lg shadow-xl max-w-md w-full mx-4">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-[var(--foreground)]">Issue Drive to DTA</h3>
            <button onclick="hideIssueDriveModal()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">&times;</button>
          </div>
          
          <div class="mb-4 p-3 bg-[var(--info)]/10 border border-[var(--info)]/20 rounded-md">
            <div class="flex items-center">
              <div class="text-[var(--info)] mr-2">ℹ</div>
              <div class="text-sm text-[var(--info)]">
                <strong>Drive Assignment Rules:</strong><br>
                • Only DTAs can have drives issued<br>
                • DTAs can only have one drive at a time
              </div>
            </div>
          </div>
          
          <form id="issue-drive-form" onsubmit="submitIssueDrive(event)">
            <input type="hidden" id="issue-drive-id" name="drive_id">
            
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Drive</label>
                <div id="issue-drive-info" class="p-3 bg-[var(--muted)] rounded-md text-sm"></div>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Issue to DTA *</label>
                <select name="user_id" required class="w-full px-3 py-2 border border-[var(--border)] rounded-md">
                  <option value="">Select DTA</option>
                  ${userOptions}
                </select>
                ${users.length === 0 ? '<p class="text-sm text-[var(--muted-foreground)] mt-1">No DTAs available for drive assignment</p>' : ''}
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Purpose</label>
                <textarea name="purpose" rows="3" placeholder="Reason for issuing this drive"
                          class="w-full px-3 py-2 border border-[var(--border)] rounded-md"></textarea>
              </div>
            </div>
            
            <div class="flex justify-end space-x-2 mt-6">
              <button type="button" onclick="hideIssueDriveModal()" 
                      class="px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)]">
                Cancel
              </button>
              <button type="submit" 
                      class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90">
                Issue Drive
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

function buildEditDriveModal(): string {
  return `
    <div id="edit-drive-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden flex items-center justify-center z-50">
      <div class="bg-[var(--background)] rounded-lg shadow-xl max-w-md w-full mx-4">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-[var(--foreground)]">Edit Drive</h3>
            <button onclick="hideEditDriveModal()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">&times;</button>
          </div>
          
          <form id="edit-drive-form" onsubmit="submitEditDrive(event)">
            <input type="hidden" id="edit-drive-id" name="drive_id">
            
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Serial Number *</label>
                <input type="text" id="edit-serial-number" name="serial_number" required 
                       class="w-full px-3 py-2 border border-[var(--border)] rounded-md">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Media Control Number *</label>
                <input type="text" id="edit-media-control-number" name="media_control_number" required 
                       class="w-full px-3 py-2 border border-[var(--border)] rounded-md">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Type *</label>
                <select id="edit-type" name="type" required class="w-full px-3 py-2 border border-[var(--border)] rounded-md">
                  <option value="SSD">SSD (Solid State Drive)</option>
                  <option value="SSD-T">SSD (Travel)</option>
                  <option value="USB">USB Drive</option>
                  <option value="DVD">DVD</option>
                  <option value="DVD-R">DVD (Rewritable)</option>
                  <option value="CD">CD</option>
                  <option value="CD-R">CD (Rewritable)</option>
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Model *</label>
                <input type="text" id="edit-model" name="model" required 
                       class="w-full px-3 py-2 border border-[var(--border)] rounded-md">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Capacity *</label>
                <input type="text" id="edit-capacity" name="capacity" required 
                       class="w-full px-3 py-2 border border-[var(--border)] rounded-md">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Location</label>
                <input type="text" id="edit-location" name="location" 
                       class="w-full px-3 py-2 border border-[var(--border)] rounded-md">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Status</label>
                <select id="edit-status" name="status" class="w-full px-3 py-2 border border-[var(--border)] rounded-md">
                  <option value="available">Available</option>
                  <option value="issued">Issued</option>
                  <option value="in_use">In Use</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>
            
            <div class="flex justify-end space-x-2 mt-6">
              <button type="button" onclick="hideEditDriveModal()" 
                      class="px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)]">
                Cancel
              </button>
              <button type="submit" 
                      class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90">
                Update Drive
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

function getScript(): string {
  return `
    let allDrives = [];
    
    // Modal functions
    function showAddDriveModal() {
      document.getElementById('add-drive-modal').classList.remove('hidden');
    }
    
    function hideAddDriveModal() {
      document.getElementById('add-drive-modal').classList.add('hidden');
      document.getElementById('add-drive-form').reset();
    }
    
    function showIssueDriveModal() {
      document.getElementById('issue-drive-modal').classList.remove('hidden');
    }
    
    function hideIssueDriveModal() {
      document.getElementById('issue-drive-modal').classList.add('hidden');
      document.getElementById('issue-drive-form').reset();
    }
    
    function showEditDriveModal() {
      document.getElementById('edit-drive-modal').classList.remove('hidden');
    }
    
    function hideEditDriveModal() {
      document.getElementById('edit-drive-modal').classList.add('hidden');
      document.getElementById('edit-drive-form').reset();
    }
    
    // Drive operations
    function issueDrive(driveId) {
      fetch('/media-custodian/api/drives/' + driveId)
        .then(response => response.json())
        .then(drive => {
          document.getElementById('issue-drive-id').value = driveId;
          document.getElementById('issue-drive-info').innerHTML = 
            \`<strong>\${drive.type} - \${drive.model}</strong><br>
             Serial: \${drive.serial_number}<br>
             Capacity: \${drive.capacity}\`;
          showIssueDriveModal();
        })
        .catch(error => {
          console.error('Error loading drive:', error);
          alert('Failed to load drive information');
        });
    }
    
    function editDrive(driveId) {
      fetch('/media-custodian/api/drives/' + driveId)
        .then(response => response.json())
        .then(drive => {
          document.getElementById('edit-drive-id').value = driveId;
          document.getElementById('edit-serial-number').value = drive.serial_number;
          document.getElementById('edit-media-control-number').value = drive.media_control_number || '';
          document.getElementById('edit-type').value = drive.type;
          document.getElementById('edit-model').value = drive.model;
          document.getElementById('edit-capacity').value = drive.capacity;
          document.getElementById('edit-location').value = drive.location || '';
          document.getElementById('edit-status').value = drive.status;
          showEditDriveModal();
        })
        .catch(error => {
          console.error('Error loading drive:', error);
          alert('Failed to load drive information');
        });
    }
    
    function deleteDrive(driveId) {
      if (!confirm('Are you sure you want to delete this drive? This action cannot be undone.')) {
        return;
      }
      
      fetch('/media-custodian/api/drives/' + driveId, {
        method: 'DELETE'
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert('Drive deleted successfully');
          window.location.reload();
        } else {
          alert('Failed to delete drive: ' + data.error);
        }
      })
      .catch(error => {
        console.error('Error deleting drive:', error);
        alert('Failed to delete drive');
      });
    }
    
    function returnDrive(driveId) {
      if (!confirm('Mark this drive as returned and available?')) {
        return;
      }
      
      fetch('/media-custodian/api/drives/' + driveId + '/return', {
        method: 'POST'
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert('Drive returned successfully');
          window.location.reload();
        } else {
          alert('Failed to return drive: ' + data.error);
        }
      })
      .catch(error => {
        console.error('Error returning drive:', error);
        alert('Failed to return drive');
      });
    }
    
    // Form submissions
    function submitAddDrive(event) {
      event.preventDefault();
      const formData = new FormData(event.target);
      const data = Object.fromEntries(formData.entries());
      
      fetch('/media-custodian/api/drives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert('Drive added successfully');
          hideAddDriveModal();
          window.location.reload();
        } else {
          alert('Failed to add drive: ' + data.error);
        }
      })
      .catch(error => {
        console.error('Error adding drive:', error);
        alert('Failed to add drive');
      });
    }
    
    function submitIssueDrive(event) {
      event.preventDefault();
      const formData = new FormData(event.target);
      const data = Object.fromEntries(formData.entries());
      
      fetch('/media-custodian/api/drives/' + data.drive_id + '/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert('Drive issued successfully');
          hideIssueDriveModal();
          window.location.reload();
        } else {
          alert('Failed to issue drive: ' + data.error);
        }
      })
      .catch(error => {
        console.error('Error issuing drive:', error);
        alert('Failed to issue drive');
      });
    }
    
    function submitEditDrive(event) {
      event.preventDefault();
      const formData = new FormData(event.target);
      const data = Object.fromEntries(formData.entries());
      
      fetch('/media-custodian/api/drives/' + data.drive_id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert('Drive updated successfully');
          hideEditDriveModal();
          window.location.reload();
        } else {
          alert('Failed to update drive: ' + data.error);
        }
      })
      .catch(error => {
        console.error('Error updating drive:', error);
        alert('Failed to update drive');
      });
    }
    
    // Filtering
    function filterDrives() {
      const searchTerm = document.getElementById('search-drives').value.toLowerCase();
      const statusFilter = document.getElementById('status-filter').value;
      const rows = document.querySelectorAll('table tbody tr');
      
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const statusCell = row.querySelector('td:nth-child(4)'); // Status column
        const status = statusCell ? statusCell.textContent.toLowerCase().replace(/\\s+/g, '_') : '';
        
        const matchesSearch = text.includes(searchTerm);
        const matchesStatus = !statusFilter || status.includes(statusFilter);
        
        row.style.display = matchesSearch && matchesStatus ? '' : 'none';
      });
    }
  `;
}

export const MediaCustodianInventory = {
  render,
  getScript,
};
