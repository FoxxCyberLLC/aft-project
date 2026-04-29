// Admin System Management Interface
import { ComponentBuilder } from '../components/ui/server-components';
import { AdminNavigation, type AdminUser } from './admin-nav';

async function renderSystemPage(user: AdminUser): Promise<string> {
  const systemInfo = {
    version: 'AFT v1.0.0',
    buildDate: '2025-09-11',
    author: 'Jeremiah Price',
    runtime: `Bun ${process.version}` || 'Unknown',
    platform: process.platform || 'Unknown',
    uptime: process.uptime ? `${Math.floor(process.uptime() / 60)} minutes` : 'Unknown',
    nodeEnv: process.env.NODE_ENV || 'development',
  };

  const configCards = [
    {
      title: 'Security Configuration',
      description: 'Manage security settings and policies',
      action: { label: 'Configure', onClick: 'window.location.href="/admin/security/settings"' },
      status: 'Secure',
    },
    {
      title: 'Database Settings',
      description: 'Database connection and maintenance',
      action: { label: 'Manage', onClick: 'showDatabaseSettings()' },
      status: 'Connected',
    },
    {
      title: 'Email Configuration',
      description: 'SMTP and notification settings',
      action: { label: 'Configure', onClick: 'showEmailSettings()' },
      status: 'Not Configured',
    },
    {
      title: 'Backup & Recovery',
      description: 'System backup and recovery options',
      action: { label: 'Manage', onClick: 'showBackupSettings()' },
      status: 'Manual',
    },
  ];

  const configCardsHtml = configCards
    .map(
      (card) => `
    <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
      <h3 class="text-lg font-semibold text-[var(--foreground)] mb-2">${card.title}</h3>
      <p class="text-[var(--muted-foreground)] text-sm mb-4">${card.description}</p>
      <div class="flex justify-between items-center">
        <span class="text-xs px-2 py-1 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
          Status: ${card.status}
        </span>
        ${ComponentBuilder.secondaryButton({
          children: card.action.label,
          onClick: card.action.onClick,
          size: 'sm',
        })}
      </div>
    </div>
  `,
    )
    .join('');

  const content = `
    <div class="space-y-8">
      <!-- System Information -->
      <div>
        <h2 class="text-xl font-semibold text-[var(--foreground)] mb-4">System Information</h2>
        <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div class="text-sm font-medium text-[var(--muted-foreground)]">Version</div>
              <div class="text-lg font-mono text-[var(--foreground)]">${systemInfo.version}</div>
            </div>
            <div>
              <div class="text-sm font-medium text-[var(--muted-foreground)]">Build Date</div>
              <div class="text-lg font-mono text-[var(--foreground)]">${systemInfo.buildDate}</div>
            </div>
            <div>
              <div class="text-sm font-medium text-[var(--muted-foreground)]">Author</div>
              <div class="text-lg font-mono text-[var(--foreground)]">${systemInfo.author}</div>
            </div>
            <div>
              <div class="text-sm font-medium text-[var(--muted-foreground)]">Runtime</div>
              <div class="text-lg font-mono text-[var(--foreground)]">${systemInfo.runtime}</div>
            </div>
            <div>
              <div class="text-sm font-medium text-[var(--muted-foreground)]">Uptime</div>
              <div class="text-lg font-mono text-[var(--foreground)]">${systemInfo.uptime}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Configuration Cards -->
      <div>
        <h2 class="text-xl font-semibold text-[var(--foreground)] mb-4">System Configuration</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          ${configCardsHtml}
        </div>
      </div>

      <!-- System Actions -->
      <div>
        <h2 class="text-xl font-semibold text-[var(--foreground)] mb-4">System Actions</h2>
        <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
          <div class="flex flex-wrap gap-4">
            ${ComponentBuilder.secondaryButton({
              children: 'Clear Cache',
              onClick: 'clearSystemCache()',
              size: 'md',
            })}
            ${ComponentBuilder.secondaryButton({
              children: 'Export Logs',
              onClick: 'exportSystemLogs()',
              size: 'md',
            })}
            ${ComponentBuilder.secondaryButton({
              children: 'System Health Check',
              onClick: 'runHealthCheck()',
              size: 'md',
            })}
            ${ComponentBuilder.destructiveButton({
              children: 'Restart System',
              onClick: 'confirmSystemRestart()',
              size: 'md',
            })}
          </div>
        </div>
      </div>
    </div>

    <!-- Settings Modal -->
    <div id="settings-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50">
      <div class="bg-[var(--card)] rounded-lg p-6 w-full max-w-2xl mx-4 border border-[var(--border)]">
        <div class="flex justify-between items-center mb-4">
          <h3 id="modal-title" class="text-lg font-semibold text-[var(--foreground)]">Settings</h3>
          <button onclick="closeSettingsModal()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            ✕
          </button>
        </div>
        
        <div id="modal-content">
          <!-- Dynamic content loaded here -->
        </div>
      </div>
    </div>
  `;

  return AdminNavigation.renderLayout(
    'System Settings',
    'Configure system parameters and maintenance',
    user,
    '/admin/system',
    content,
  );
}

function getScript(): string {
  const scriptContent = `
    (function() {
      window.showDatabaseSettings = async function() {
        document.getElementById('modal-title').textContent = 'Database Settings';
        document.getElementById('modal-content').innerHTML = 
          '<div class="space-y-4">' +
            '<p class="text-[var(--muted-foreground)]">Database connection and maintenance settings.</p>' +
            '<div class="bg-[var(--muted)] p-4 rounded-md">' +
              '<h4 class="font-medium mb-2">Connection Status</h4>' +
              '<p class="text-sm text-[var(--success)]">✓ Connected to SQLite database</p>' +
              '<p class="text-xs text-[var(--muted-foreground)] mt-1">Database file: ./data/aft.db</p>' +
            '</div>' +
            '<div class="flex gap-3">' +
              '<button onclick="runDatabaseMaintenance()" class="px-4 py-2 bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-md hover:opacity-90">Run Maintenance</button>' +
              '<button onclick="backupDatabase()" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90">Backup Database</button>' +
            '</div>' +
          '</div>';
        showSettingsModal();
      }
      
      window.showEmailSettings = async function() {
        document.getElementById('modal-title').textContent = 'Email Configuration';
        document.getElementById('modal-content').innerHTML = 
          '<div class="space-y-4">' +
            '<p class="text-[var(--muted-foreground)]">Configure SMTP settings for system notifications.</p>' +
            '<div class="space-y-3">' +
              '<div>' +
                '<label class="block text-sm font-medium mb-1">SMTP Server</label>' +
                '<input id="smtp-server" type="text" class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)]" placeholder="smtp.example.com">' +
              '</div>' +
              '<div class="grid grid-cols-2 gap-3">' +
                '<div>' +
                  '<label class="block text-sm font-medium mb-1">Port</label>' +
                  '<input id="smtp-port" type="number" class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)]" value="587">' +
                '</div>' +
                '<div>' +
                  '<label class="block text-sm font-medium mb-1">Security</label>' +
                  '<select id="smtp-security" class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)]">' +
                    '<option>TLS</option>' +
                    '<option>SSL</option>' +
                    '<option>None</option>' +
                  '</select>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="flex gap-3">' +
              '<button onclick="testEmailConfig()" class="px-4 py-2 bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-md hover:opacity-90">Test Configuration</button>' +
              '<button onclick="saveEmailConfig()" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90">Save Settings</button>' +
            '</div>' +
          '</div>';

        try {
          const response = await fetch('/api/admin/email-settings');
          const settings = await response.json();
          document.getElementById('smtp-server').value = settings.smtpServer;
          document.getElementById('smtp-port').value = settings.smtpPort;
          document.getElementById('smtp-security').value = settings.smtpSecurity;
        } catch (error) {
          console.error('Failed to load email settings:', error);
          alert('Could not load email settings.');
        }

        showSettingsModal();
      }
      
      window.showBackupSettings = async function() {
        document.getElementById('modal-title').textContent = 'Backup & Recovery';
        document.getElementById('modal-content').innerHTML = 
          '<div class="space-y-4">' +
            '<p class="text-[var(--muted-foreground)]">Configure automated backups and recovery options.</p>' +
            '<div class="space-y-2">' +
              '<label for="backup-schedule" class="block text-sm font-medium">Backup Schedule</label>' +
              '<select id="backup-schedule" class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)]">' +
                '<option value="manual">Manual</option>' +
                '<option value="daily">Daily</option>' +
                '<option value="weekly">Weekly</option>' +
              '</select>' +
              '<p class="text-xs text-[var(--muted-foreground)]">Note: A server-side process is required to run scheduled backups.</p>' +
            '</div>' +
            '<div class="flex gap-3 pt-2">' +
              '<button onclick="createBackup()" class="px-4 py-2 bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-md hover:opacity-90">Create Backup Now</button>' +
              '<button onclick="scheduleBackups()" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90">Save Schedule</button>' +
            '</div>' +
          '</div>';

        try {
          const response = await fetch('/api/admin/backup-settings');
          const settings = await response.json();
          document.getElementById('backup-schedule').value = settings['backup.schedule'] || 'manual';
        } catch (error) {
          console.error('Failed to load backup settings:', error);
        }

        showSettingsModal();
      }
      
      function showSettingsModal() {
        document.getElementById('settings-modal').classList.remove('hidden');
        document.getElementById('settings-modal').classList.add('flex');
      }
      
      window.closeSettingsModal = function() {
        document.getElementById('settings-modal').classList.add('hidden');
        document.getElementById('settings-modal').classList.remove('flex');
      }
      
      window.clearSystemCache = function() {
        if (confirm('Clear system cache? This may temporarily slow down the system.')) {
          fetch('/api/admin/clear-cache', { method: 'POST' })
            .then(response => response.json())
            .then(result => {
              alert(result.message);
            })
            .catch(error => {
              console.error('Failed to clear cache:', error);
              alert('An unexpected error occurred while clearing the cache.');
            });
        }
      }
      
      window.exportSystemLogs = function() {
        window.location.href = '/api/admin/export-logs';
      }
      
      window.runHealthCheck = async function() {
        try {
          const response = await fetch('/api/admin/health-check');
          const result = await response.json();
          
          let report = 'System Health Report:\n\n';
          if (result.success) {
            report += 'Overall Status: ' + result.status.overall + '\n';
            report += 'Database: ' + result.status.database + '\n';
          } else {
            report += 'Overall Status: ERROR\n';
            report += 'Details: ' + result.message + '\n';
          }
          
          alert(report);
          
        } catch (error) {
          console.error('Failed to run health check:', error);
          alert('An unexpected error occurred while running the health check.');
        }
      }
      
      window.confirmSystemRestart = function() {
        if (confirm('Restart the system? All users will be disconnected.')) {
          fetch('/api/admin/restart-system', { method: 'POST' })
            .then(response => response.json())
            .then(result => {
              if (result.success) {
                alert('System is restarting. The page will become unresponsive.');
                document.body.innerHTML = '<div class="h-screen w-full flex items-center justify-center text-2xl font-bold">System is restarting... Please wait a moment and then refresh the page.</div>';
              } else {
                alert('Error: ' + result.message);
              }
            })
            .catch(error => {
              console.error('Failed to restart system:', error);
              alert('An unexpected error occurred while restarting the system.');
            });
        }
      }
      
      window.runDatabaseMaintenance = async function() {
        try {
          const response = await fetch('/api/admin/run-maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
          const result = await response.json();
          alert(result.message);
        } catch (error) {
          console.error('Failed to run database maintenance:', error);
          alert('An unexpected error occurred while running maintenance.');
        } finally {
          closeSettingsModal();
        }
      }
      
      window.backupDatabase = async function() {
        try {
          const response = await fetch('/api/admin/backup-database', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
          const result = await response.json();
          if (result.success) {
            alert('Backup created successfully at: ' + result.backupPath);
          } else {
            alert('Error creating backup: ' + result.message);
          }
        } catch (error) {
          console.error('Failed to create database backup:', error);
          alert('An unexpected error occurred while creating the backup.');
        } finally {
          closeSettingsModal();
        }
      }
      
      window.testEmailConfig = async function() {
        const settings = { smtpServer: document.getElementById('smtp-server').value, smtpPort: document.getElementById('smtp-port').value, smtpSecurity: document.getElementById('smtp-security').value };
        try {
          const response = await fetch('/api/admin/test-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
          const result = await response.json();
          alert(result.message);
        } catch (error) {
          console.error('Failed to test email settings:', error);
          alert('An unexpected error occurred while testing the configuration.');
        }
      }
      
      window.saveEmailConfig = async function() {
        const settings = { smtpServer: document.getElementById('smtp-server').value, smtpPort: document.getElementById('smtp-port').value, smtpSecurity: document.getElementById('smtp-security').value };
        try {
          const response = await fetch('/api/admin/email-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
          const result = await response.json();
          alert(result.message);
          if (result.success) {
            closeSettingsModal();
          }
        } catch (error) {
          console.error('Failed to save email settings:', error);
          alert('An unexpected error occurred while saving settings.');
        }
      }
      
      window.createBackup = function() {
        backupDatabase();
      }
      
      window.scheduleBackups = function() {
        const schedule = document.getElementById('backup-schedule').value;
        const settings = { 'backup.schedule': schedule };
        fetch('/api/admin/backup-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
          .then(res => res.json())
          .then(result => {
            alert(result.message);
            if (result.success) {
              closeSettingsModal();
            }
          })
          .catch(error => {
            console.error('Failed to save backup schedule:', error);
            alert('An error occurred while saving the schedule.');
          });
      }
    })();
  `;
  return scriptContent;
}

export const AdminSystem = {
  renderSystemPage,
  getScript,
};
