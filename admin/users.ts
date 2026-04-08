// Admin User Management Interface
import { ComponentBuilder } from "../components/ui/server-components";
import { getDb, UserRole, type UserRoleType, getUserRoles, getRoleDisplayName } from "../lib/database-bun";
import { escapeHtml } from "../lib/formatters";
import { AdminNavigation, type AdminUser } from "./admin-nav";

export class AdminUsers {
  
  static async renderUsersPage(user: AdminUser): Promise<string> {
    const db = getDb();
    
    // Get all users with their role information
    const users = await db.query(`
      SELECT 
        u.*,
        COUNT(ur.id) as role_count,
        GROUP_CONCAT(ur.role) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all() as any[];

    // Transform users data for table
    const tableData = users.map(dbUser => ({
      id: dbUser.id,
      name: `${dbUser.first_name} ${dbUser.last_name}`,
      email: dbUser.email,
      organization: dbUser.organization || 'N/A',
      phone: dbUser.phone || 'No phone',
      primary_role: dbUser.primary_role,
      role_count: dbUser.role_count,
      is_active: dbUser.is_active,
      created_at: dbUser.created_at
    }));

    // Define table columns. Every database value below is escaped via
    // escapeHtml because users can choose their own first/last name, email,
    // organization, etc - those values must not be trusted as raw HTML.
    const columns = [
      {
        key: 'name',
        label: 'User',
        render: (value: any, row: any) => `
          <div>
            <div class="font-medium text-[var(--foreground)]">${escapeHtml(row.name)}</div>
            <div class="text-sm text-[var(--muted-foreground)]">${escapeHtml(row.email)}</div>
          </div>
        `
      },
      {
        key: 'organization',
        label: 'Organization',
        render: (value: any, row: any) => `
          <div>
            <div class="text-sm">${escapeHtml(row.organization)}</div>
            <div class="text-xs text-[var(--muted-foreground)]">${escapeHtml(row.phone)}</div>
          </div>
        `
      },
      {
        key: 'primary_role',
        label: 'Primary Role',
        render: (value: any, row: any) => `
          <div>
            <div class="text-sm font-medium text-[var(--primary)]">${escapeHtml(getRoleDisplayName(row.primary_role))}</div>
            <div class="text-xs text-[var(--muted-foreground)]">+${Math.max(0, (row.role_count || 1) - 1)} additional</div>
          </div>
        `
      },
      {
        key: 'is_active',
        label: 'Status',
        render: (value: any, row: any) => ComponentBuilder.statusBadge(
          row.is_active ? 'Active' : 'Inactive',
          row.is_active ? 'success' : 'error'
        )
      },
      {
        key: 'created_at',
        label: 'Created',
        render: (value: any, row: any) => `
          <div class="text-sm">${new Date(row.created_at * 1000).toLocaleDateString()}</div>
        `
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (value: any, row: any) => ComponentBuilder.tableCellActions([
          { label: 'Edit', onClick: `editUser(${row.id})`, variant: 'secondary' },
          { label: 'Roles', onClick: `manageRoles(${row.id})`, variant: 'secondary' }
        ])
      }
    ];

    // Create table
    const table = ComponentBuilder.table({
      columns,
      rows: tableData,
      emptyMessage: 'No users found'
    });

    // Create search component
    const search = ComponentBuilder.tableSearch({
      placeholder: 'Search users...',
      onSearch: 'filterUsers'
    });

    // Create filters
    const filters = ComponentBuilder.tableFilters({
      filters: [
        {
          key: 'role',
          label: 'All Roles',
          options: [
            { value: UserRole.ADMIN, label: 'System Administrator' },
            { value: UserRole.REQUESTOR, label: 'Request Submitter' },
            { value: UserRole.DAO, label: 'Designated Authorizing Official' },
            { value: UserRole.APPROVER, label: 'Information System Security Manager' },
            { value: UserRole.CPSO, label: 'Contractor Program Security Officer' },
            { value: UserRole.DTA, label: 'Data Transfer Agent' },
            { value: UserRole.SME, label: 'Subject Matter Expert' },
            { value: UserRole.MEDIA_CUSTODIAN, label: 'Media Custodian' }
          ],
          onChange: 'filterByRole'
        }
      ]
    });

    // Create table actions
    const actions = ComponentBuilder.tableActions({
      primary: {
        label: '+ Add User',
        onClick: 'createUser()'
      }
    });

    // Create table container
    const tableContainer = ComponentBuilder.tableContainer({
      title: 'System Users',
      description: 'Manage user accounts and role assignments',
      search,
      filters,
      actions,
      table
    });

    const content = `
      ${tableContainer}

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mt-6">
        <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
          <div class="text-2xl font-bold text-[var(--primary)]">${users.length}</div>
          <div class="text-sm text-[var(--muted-foreground)]">Total Users</div>
        </div>
        <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
          <div class="text-2xl font-bold text-[var(--success)]">${users.filter(u => u.is_active).length}</div>
          <div class="text-sm text-[var(--muted-foreground)]">Active Users</div>
        </div>
        <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
          <div class="text-2xl font-bold text-[var(--warning)]">${users.filter(u => !u.is_active).length}</div>
          <div class="text-sm text-[var(--muted-foreground)]">Inactive Users</div>
        </div>
        <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
          <div class="text-2xl font-bold text-[var(--info)]">${users.filter(u => u.role_count > 1).length}</div>
          <div class="text-sm text-[var(--muted-foreground)]">Multi-Role Users</div>
        </div>
      </div>

      <!-- User Form Modal -->
      <div id="user-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50">
        <div class="bg-[var(--card)] rounded-lg p-6 w-full max-w-md mx-4 border border-[var(--border)]">
          <div class="flex justify-between items-center mb-4">
            <h3 id="modal-title" class="text-lg font-semibold text-[var(--foreground)]">Add User</h3>
            <button onclick="closeUserModal()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              ✕
            </button>
          </div>
          
          <form id="user-form" onsubmit="submitUser(event)">
            <input type="hidden" id="user-id" name="id">
            
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-[var(--foreground)] mb-1">First Name</label>
                  <input 
                    type="text" 
                    id="first-name" 
                    name="first_name" 
                    required
                    class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                </div>
                <div>
                  <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Last Name</label>
                  <input 
                    type="text" 
                    id="last-name" 
                    name="last_name" 
                    required
                    class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                </div>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Email</label>
                <input 
                  type="email" 
                  id="email" 
                  name="email" 
                  required
                  class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
              </div>
              
              <div>
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Primary Role</label>
                <select 
                  id="primary-role" 
                  name="primary_role" 
                  required
                  class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)]"
                >
                  <option value="${UserRole.REQUESTOR}">Request Submitter</option>
                  <option value="${UserRole.DAO}">Designated Authorizing Official</option>
                  <option value="${UserRole.APPROVER}">Information System Security Manager</option>
                  <option value="${UserRole.CPSO}">Contractor Program Security Officer</option>
                  <option value="${UserRole.DTA}">Data Transfer Agent</option>
                  <option value="${UserRole.SME}">Subject Matter Expert</option>
                  <option value="${UserRole.MEDIA_CUSTODIAN}">Media Custodian</option>
                  <option value="${UserRole.ADMIN}">System Administrator</option>
                </select>
              </div>
              
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Organization</label>
                  <input 
                    type="text" 
                    id="organization" 
                    name="organization"
                    class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                </div>
                <div>
                  <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Phone</label>
                  <input 
                    type="tel" 
                    id="phone" 
                    name="phone"
                    class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                </div>
              </div>
              
              <div id="password-section">
                <label class="block text-sm font-medium text-[var(--foreground)] mb-1">Password</label>
                <input 
                  type="password" 
                  id="password" 
                  name="password"
                  class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                <div class="text-xs text-[var(--muted-foreground)] mt-1">
                  Min 12 characters, uppercase, lowercase, number, special character
                </div>
              </div>
              
              <div class="flex items-center">
                <input type="checkbox" id="is-active" name="is_active" checked class="mr-2">
                <label for="is-active" class="text-sm text-[var(--foreground)]">Active User</label>
              </div>
            </div>
            
            <div class="flex gap-3 mt-6">
              ${ComponentBuilder.secondaryButton({
                children: 'Cancel',
                onClick: 'closeUserModal()',
                size: 'md'
              })}
              <button type="submit" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90 transition-opacity">
                Save User
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Role Management Modal -->
      <div id="roles-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50">
        <div class="bg-[var(--card)] rounded-lg p-6 w-full max-w-lg mx-4 border border-[var(--border)]">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold text-[var(--foreground)]">Manage User Roles</h3>
            <button onclick="closeRolesModal()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              ✕
            </button>
          </div>
          
          <div id="roles-content">
            <!-- Dynamic content loaded here -->
          </div>
        </div>
      </div>
    `;

    return AdminNavigation.renderLayout(
      'User Management',
      'Manage system users and their roles',
      user,
      '/admin/users',
      content
    );
  }

  static getScript(): string {
    return `
      let currentEditingUserId = null;
      
      function createUser() {
        document.getElementById('modal-title').textContent = 'Add User';
        document.getElementById('user-form').reset();
        document.getElementById('user-id').value = '';
        document.getElementById('password').required = true;
        document.getElementById('user-modal').classList.remove('hidden');
        document.getElementById('user-modal').classList.add('flex');
      }
      
      function editUser(userId) {
        currentEditingUserId = userId;
        document.getElementById('modal-title').textContent = 'Edit User';
        document.getElementById('password').required = false;
        
        // Fetch user data
        fetch('/api/admin/users/' + userId)
          .then(response => response.json())
          .then(user => {
            document.getElementById('user-id').value = user.id;
            document.getElementById('first-name').value = user.first_name;
            document.getElementById('last-name').value = user.last_name;
            document.getElementById('email').value = user.email;
            document.getElementById('primary-role').value = user.primary_role;
            document.getElementById('organization').value = user.organization || '';
            document.getElementById('phone').value = user.phone || '';
            document.getElementById('is-active').checked = user.is_active;
            
            document.getElementById('user-modal').classList.remove('hidden');
            document.getElementById('user-modal').classList.add('flex');
          })
          .catch(error => {
            alert('Error loading user data: ' + error.message);
          });
      }
      
      function closeUserModal() {
        document.getElementById('user-modal').classList.add('hidden');
        document.getElementById('user-modal').classList.remove('flex');
        currentEditingUserId = null;
      }
      
      function submitUser(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const userData = Object.fromEntries(formData.entries());
        userData.is_active = document.getElementById('is-active').checked;
        
        const url = userData.id ? '/api/admin/users/' + userData.id : '/api/admin/users';
        const method = userData.id ? 'PUT' : 'POST';
        
        fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userData)
        })
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            closeUserModal();
            window.location.reload();
          } else {
            alert('Error: ' + (result.message || 'Unknown error'));
          }
        })
        .catch(error => {
          alert('Network error: ' + error.message);
        });
      }
      
      function manageRoles(userId) {
        fetch('/api/admin/users/' + userId + '/roles')
          .then(response => response.json())
          .then(data => {
            const rolesContent = document.getElementById('roles-content');
            rolesContent.innerHTML = generateRolesInterface(data.user, data.userRoles, data.allRoles);
            
            document.getElementById('roles-modal').classList.remove('hidden');
            document.getElementById('roles-modal').classList.add('flex');
          })
          .catch(error => {
            alert('Error loading roles: ' + error.message);
          });
      }
      
      function closeRolesModal() {
        document.getElementById('roles-modal').classList.add('hidden');
        document.getElementById('roles-modal').classList.remove('flex');
      }
      
      function generateRolesInterface(user, userRoles, allRoles) {
        const userRoleIds = userRoles.map(ur => ur.role);
        
        const roleCheckboxes = allRoles.map(role => {
          const isChecked = userRoleIds.includes(role.id);
          const isPrimary = role.id === user.primary_role;
          
          return \`
            <div class="flex items-center justify-between p-3 border border-[var(--border)] rounded-md \${isPrimary ? 'bg-[var(--success)]/10' : ''}">
              <div class="flex items-center">
                <input 
                  type="checkbox" 
                  id="role-\${role.id}" 
                  value="\${role.id}"
                  \${isChecked ? 'checked' : ''}
                  \${isPrimary ? 'disabled' : ''}
                  class="mr-3"
                >
                <div>
                  <label for="role-\${role.id}" class="font-medium text-[var(--foreground)]">\${role.name}</label>
                  <div class="text-sm text-[var(--muted-foreground)]">\${role.description}</div>
                </div>
              </div>
              \${isPrimary ? '<span class="text-xs font-medium text-[var(--success)]">PRIMARY</span>' : ''}
            </div>
          \`;
        }).join('');
        
        return \`
          <div class="mb-4">
            <h4 class="font-medium text-[var(--foreground)] mb-2">User: \${user.first_name} \${user.last_name}</h4>
            <p class="text-sm text-[var(--muted-foreground)]">Primary role cannot be removed. Assign additional roles below.</p>
          </div>
          
          <div class="space-y-3 max-h-96 overflow-y-auto">
            \${roleCheckboxes}
          </div>
          
          <div class="flex gap-3 mt-6">
            <button onclick="closeRolesModal()" class="px-4 py-2 bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-md hover:opacity-90 transition-opacity">
              Cancel
            </button>
            <button onclick="saveUserRoles(\${user.id})" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90 transition-opacity">
              Save Roles
            </button>
          </div>
        \`;
      }
      
      function saveUserRoles(userId) {
        const checkboxes = document.querySelectorAll('#roles-modal input[type="checkbox"]:not(:disabled)');
        const selectedRoles = Array.from(checkboxes)
          .filter(cb => cb.checked)
          .map(cb => cb.value);
        
        fetch('/api/admin/users/' + userId + '/roles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roles: selectedRoles })
        })
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            closeRolesModal();
            window.location.reload();
          } else {
            alert('Error: ' + (result.message || 'Unknown error'));
          }
        })
        .catch(error => {
          alert('Network error: ' + error.message);
        });
      }
      
      function filterUsers(searchTerm) {
        const rows = document.querySelectorAll('#users-table-body tr');
        const term = searchTerm.toLowerCase();
        
        rows.forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(term) ? '' : 'none';
        });
      }
      
      function filterByRole(role) {
        const rows = document.querySelectorAll('#users-table-body tr');
        
        rows.forEach(row => {
          if (!role) {
            row.style.display = '';
          } else {
            const roleCell = row.cells[2].textContent.toLowerCase();
            row.style.display = roleCell.includes(role) ? '' : 'none';
          }
        });
      }
    `;
  }
}