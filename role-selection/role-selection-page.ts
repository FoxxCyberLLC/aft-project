// Role Selection Page - Multi-role user role selection interface
import { ComponentBuilder } from '../components/ui/server-components';
import { getRoleDescription, getRoleDisplayName, type UserRoleType } from '../lib/database-bun';

export interface UserRole {
  role: UserRoleType;
  isPrimary: boolean;
}

function render(userEmail: string, userName: string, availableRoles: UserRole[]): string {
  const roleCards = availableRoles
    .map((userRole) => {
      const displayName = getRoleDisplayName(userRole.role);
      const description = getRoleDescription(userRole.role);
      const isPrimary = userRole.isPrimary;

      return `
      <div class="role-card ${isPrimary ? 'primary-role' : ''}" data-role="${userRole.role}">
        <div class="role-header">
          <h3>${displayName}</h3>
          ${isPrimary ? '<span class="primary-badge">Primary</span>' : ''}
        </div>
        <p class="role-description">${description}</p>
        <div class="role-actions">
          ${ComponentBuilder.primaryButton({
            children: `Select ${displayName}`,
            onClick: `selectRole('${userRole.role}')`,
            size: 'md',
          })}
        </div>
      </div>
    `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AFT - Role Selection</title>
  <link rel="stylesheet" href="/globals.css">
  <style>
      .role-selection-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--muted);
          padding: 2rem;
      }
      
      .role-selection-box {
          background: var(--card);
          border-radius: calc(var(--radius) * 2);
          padding: 3rem;
          box-shadow: var(--shadow-xl);
          border: 1px solid var(--border);
          max-width: 900px;
          width: 100%;
      }
      
      .role-selection-header {
          text-align: center;
          margin-bottom: 3rem;
      }
      
      .role-selection-header h1 {
          font-size: 2rem;
          color: var(--primary);
          font-weight: 700;
          margin-bottom: 0.5rem;
      }
      
      .role-selection-header p {
          color: var(--muted-foreground);
          font-size: 1rem;
      }
      
      .user-info {
          text-align: center;
          margin-bottom: 2rem;
          padding: 1rem;
          background: var(--muted);
          border-radius: var(--radius);
      }
      
      .user-info h2 {
          color: var(--foreground);
          font-size: 1.25rem;
          margin-bottom: 0.25rem;
      }
      
      .user-info p {
          color: var(--muted-foreground);
          font-size: 0.875rem;
      }
      
      .roles-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
      }
      
      .role-card {
          background: var(--card);
          border: 2px solid var(--border);
          border-radius: calc(var(--radius) * 1.5);
          padding: 2rem;
          text-align: center;
          transition: all 0.3s ease;
          cursor: pointer;
      }
      
      .role-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-lg);
          border-color: var(--primary);
      }
      
      .role-card.primary-role {
          border-color: var(--success);
          background: linear-gradient(135deg, var(--card) 0%, rgba(34, 197, 94, 0.05) 100%);
      }
      
      .role-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
      }
      
      .role-header h3 {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--foreground);
      }
      
      .primary-badge {
          background: var(--success);
          color: var(--success-foreground);
          padding: 0.25rem 0.75rem;
          border-radius: 1rem;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
      }
      
      .role-description {
          color: var(--muted-foreground);
          font-size: 0.875rem;
          line-height: 1.5;
          margin-bottom: 1.5rem;
      }
      
      .role-actions {
          display: flex;
          justify-content: center;
      }
      
      .role-actions button {
          background: var(--primary);
          color: var(--primary-foreground);
          border: 1px solid var(--primary);
          border-radius: var(--radius);
          padding: 0.625rem 1rem; /* 10px 16px */
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: var(--shadow-sm);
          font-family: var(--font-sans);
      }

      .role-actions button:hover {
          background: rgb(37, 99, 235);
          transform: translateY(-1px);
          box-shadow: var(--shadow-md);
      }

      .role-actions button:focus {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
      }
      
      .security-notice {
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid var(--primary);
          border-radius: var(--radius);
          padding: 1rem;
          text-align: center;
          margin-top: 2rem;
      }
      
      .security-notice h4 {
          color: var(--primary);
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
      }
      
      .security-notice p {
          color: var(--muted-foreground);
          font-size: 0.75rem;
      }
      
      .logout-link {
          text-align: center;
          margin-top: 2rem;
      }
      
      .logout-link a {
          color: var(--muted-foreground);
          text-decoration: none;
          font-size: 0.875rem;
      }
      
      .logout-link a:hover {
          color: var(--primary);
          text-decoration: underline;
      }
      
      @media (max-width: 768px) {
          .role-selection-box {
              padding: 2rem;
              margin: 1rem;
          }
          
          .roles-grid {
              grid-template-columns: 1fr;
          }
      }
  </style>
</head>
<body>
  <div class="role-selection-container">
      <div class="role-selection-box">
          <div class="role-selection-header">
              <h1>Select Your Role</h1>
              <p>Choose the role you want to use for this session</p>
          </div>
          
          <div class="user-info">
              <h2>${userName}</h2>
              <p>${userEmail}</p>
          </div>
          
          <div class="roles-grid">
              ${roleCards}
          </div>
          
          <div class="security-notice">
              <h4>🔒 Security Notice</h4>
              <p>Your selected role determines your access level and available features. You can switch roles during your session if needed.</p>
          </div>
          
          <div class="logout-link">
              <a href="/logout">Not ${userName.split(' ')[0]}? Sign out</a>
          </div>
      </div>
  </div>
  
  <script>
      async function selectRole(role) {
          try {
              const response = await fetch('/api/select-role', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ role })
              });
              
              const result = await response.json();
              
              if (result.success) {
                  // Redirect to appropriate dashboard based on role
                  const dashboardUrl = getRoleDashboardUrl(role);
                  window.location.href = dashboardUrl;
              } else {
                  alert('Failed to select role: ' + (result.message || 'Unknown error'));
              }
          } catch (error) {
              alert('Network error. Please try again.');
              console.error('Role selection error:', error);
          }
      }
      
      function getRoleDashboardUrl(role) {
          switch (role) {
              case 'admin':
                  return '/admin';
              case 'requestor':
                  return '/requestor';
              case 'dao':
                  return '/dashboard/dao';
              case 'approver':
                  return '/dashboard/approver';
              case 'cpso':
                  return '/cpso';
              case 'dta':
                  return '/dashboard/dta';
              case 'sme':
                  return '/dashboard/sme';
              case 'media_custodian':
                  return '/media-custodian';
              default:
                  return '/dashboard';
          }
      }
      
      // Add click handlers to role cards
      document.addEventListener('DOMContentLoaded', function() {
          const roleCards = document.querySelectorAll('.role-card');
          roleCards.forEach(card => {
              card.addEventListener('click', function() {
                  const role = dataset.role;
                  if (role) {
                      selectRole(role);
                  }
              });
          });
      });
  </script>
</body>
</html>`;
}

export const RoleSelectionPage = {
  render,
};
