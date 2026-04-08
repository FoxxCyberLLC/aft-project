// CPSO Reports Page - Analytics and reporting for CPSO activities
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { CPSONavigation, type CPSOUser } from "./cpso-nav";
import { getDb } from "../lib/database-bun";
import { ChartBarIcon, TrendingUpIcon, PieChartIcon, DownloadIcon, CalendarIcon } from "../components/icons";

export class CPSOReportsPage {
  static async render(user: CPSOUser): Promise<string> {
    const db = getDb();
    
    // CPSO actions are recorded against the shared approver_email column
    // when the request advances out of pending_cpso. Statuses moved past
    // pending_cpso ('pending_dta' and beyond, plus 'rejected' / 'approved')
    // count as CPSO-acted requests.
    const cpsoAdvancedStatuses = ['approved', 'rejected', 'pending_dta', 'active_transfer', 'pending_sme_signature', 'pending_media_custodian', 'completed', 'disposed'];
    const advancedStatusList = cpsoAdvancedStatuses.map(() => '?').join(',');

    const stats = {
      total: await db.query(`
        SELECT COUNT(*) as count FROM aft_requests
        WHERE approver_email = ? AND status IN (${advancedStatusList})
      `).get(user.email, ...cpsoAdvancedStatuses) as any,

      approved: await db.query(`
        SELECT COUNT(*) as count FROM aft_requests
        WHERE approver_email = ? AND status NOT IN ('rejected', 'cancelled')
          AND status IN (${advancedStatusList})
      `).get(user.email, ...cpsoAdvancedStatuses) as any,

      rejected: await db.query(`
        SELECT COUNT(*) as count FROM aft_requests
        WHERE approver_email = ? AND status = 'rejected'
      `).get(user.email) as any,

      avgProcessingTime: await db.query(`
        SELECT AVG((updated_at - created_at) / 3600.0) as hours
        FROM aft_requests
        WHERE approver_email = ? AND status IN (${advancedStatusList})
      `).get(user.email, ...cpsoAdvancedStatuses) as any
    };

    // Get monthly breakdown
    const monthlyData = await db.query(`
      SELECT
        to_char(to_timestamp(updated_at), 'YYYY-MM') as month,
        COUNT(CASE WHEN status NOT IN ('rejected', 'cancelled') THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
      FROM aft_requests
      WHERE approver_email = ? AND status IN (${advancedStatusList})
      GROUP BY month
      ORDER BY month DESC
      LIMIT 6
    `).all(user.email, ...cpsoAdvancedStatuses) as any[];

    // Get system breakdown
    const systemData = await db.query(`
      SELECT
        source_system,
        dest_system,
        COUNT(*) as count
      FROM aft_requests
      WHERE approver_email = ? AND status IN (${advancedStatusList})
      GROUP BY source_system, dest_system
      ORDER BY count DESC
      LIMIT 10
    `).all(user.email, ...cpsoAdvancedStatuses) as any[];

    const approvalRate = stats.total?.count ? 
      Math.round((stats.approved?.count / stats.total?.count) * 100) : 0;

    const content = `
      <div class="space-y-6">
        <!-- Key Metrics -->
        <div>
          <h3 class="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
            ${TrendingUpIcon({ size: 20 })}
            CPSO Review Metrics
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            ${this.renderMetricCard('Total Processed', stats.total?.count || 0, 'primary')}
            ${this.renderMetricCard('Approved', stats.approved?.count || 0, 'success')}
            ${this.renderMetricCard('Rejected', stats.rejected?.count || 0, 'destructive')}
            ${this.renderMetricCard('Avg. Processing', `${Math.round(stats.avgProcessingTime?.hours || 0)}h`, 'warning')}
          </div>
        </div>

        <!-- Approval Rate Chart -->
        <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
              ${PieChartIcon({ size: 20 })}
              CPSO Approval Rate
            </h3>
            <span class="text-2xl font-bold text-[var(--success)]">${approvalRate}%</span>
          </div>
          <div class="relative h-4 bg-[var(--muted)] rounded-full overflow-hidden">
            <div 
              class="absolute top-0 left-0 h-full bg-[var(--success)] transition-all duration-500"
              style="width: ${approvalRate}%"
            ></div>
          </div>
          <div class="flex justify-between mt-2 text-sm text-[var(--muted-foreground)]">
            <span>Approved: ${stats.approved?.count || 0}</span>
            <span>Rejected: ${stats.rejected?.count || 0}</span>
          </div>
        </div>

        <!-- Monthly Trends -->
        <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
          <h3 class="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
            ${ChartBarIcon({ size: 20 })}
            Monthly CPSO Review Trends
          </h3>
          ${monthlyData.length > 0 ? `
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-[var(--border)]">
                    <th class="text-left py-2 text-sm font-medium text-[var(--muted-foreground)]">Month</th>
                    <th class="text-right py-2 text-sm font-medium text-[var(--muted-foreground)]">Approved</th>
                    <th class="text-right py-2 text-sm font-medium text-[var(--muted-foreground)]">Rejected</th>
                    <th class="text-right py-2 text-sm font-medium text-[var(--muted-foreground)]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${monthlyData.map((month: any) => `
                    <tr class="border-b border-[var(--border)]">
                      <td class="py-2 text-sm text-[var(--foreground)]">${this.formatMonth(month.month)}</td>
                      <td class="text-right py-2 text-sm text-[var(--success)]">${month.approved}</td>
                      <td class="text-right py-2 text-sm text-[var(--destructive)]">${month.rejected}</td>
                      <td class="text-right py-2 text-sm font-semibold text-[var(--foreground)]">${month.approved + month.rejected}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <p class="text-center text-[var(--muted-foreground)] py-4">No data available</p>
          `}
        </div>

        <!-- System Transfer Analysis -->
        <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
          <h3 class="text-lg font-semibold text-[var(--foreground)] mb-4">Top Transfer Routes</h3>
          ${systemData.length > 0 ? `
            <div class="space-y-3">
              ${systemData.map((route: any) => `
                <div class="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                  <div class="flex-1">
                    <span class="text-sm font-medium text-[var(--foreground)]">
                      ${route.source_system} → ${route.dest_system}
                    </span>
                  </div>
                  <span class="text-sm font-semibold text-[var(--primary)]">${route.count} transfers</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <p class="text-center text-[var(--muted-foreground)] py-4">No transfer data available</p>
          `}
        </div>

        <!-- Export Actions -->
        <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
          <h3 class="text-lg font-semibold text-[var(--foreground)] mb-4">Generate Reports</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${this.renderReportButton('Monthly Summary', 'generateReport("monthly")')}
            ${this.renderReportButton('Quarterly Report', 'generateReport("quarterly")')}
            ${this.renderReportButton('Annual Report', 'generateReport("annual")')}
          </div>
        </div>
      </div>
    `;

    return CPSONavigation.renderLayout(
      'Reports & Analytics',
      'CPSO review metrics and performance insights',
      user,
      '/cpso/reports',
      content
    );
  }

  private static renderMetricCard(label: string, value: string | number, variant: 'primary' | 'success' | 'destructive' | 'warning'): string {
    const colors = {
      primary: 'var(--primary)',
      success: 'var(--success)',
      destructive: 'var(--destructive)',
      warning: 'var(--warning)'
    };

    return `
      <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
        <p class="text-sm text-[var(--muted-foreground)] mb-1">${label}</p>
        <p class="text-2xl font-bold" style="color: ${colors[variant] || colors.primary}">${value}</p>
      </div>
    `;
  }

  private static renderReportButton(label: string, onClick: string): string {
    return `
      <button 
        onclick="${onClick}"
        class="flex items-center justify-center gap-2 px-4 py-3 bg-[var(--muted)] text-[var(--foreground)] rounded-md hover:bg-[var(--muted)]/80 transition-colors"
      >
        ${DownloadIcon({ size: 16 })}
        ${label}
      </button>
    `;
  }

  private static formatMonth(monthStr: string | undefined): string {
    if (!monthStr) return 'N/A';
    const parts = monthStr.split('-').map(s => parseInt(s, 10));
    const year = parts[0];
    const month = parts[1];

    if (year === undefined || month === undefined || isNaN(year) || isNaN(month)) {
        return 'Invalid Date';
    }
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  }

  static getScript(): string {
    return `
      function generateReport(type) {
        const button = event.target;
        button.disabled = true;
        button.innerHTML = 'Generating...';
        
        fetch('/api/cpso/reports/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type })
        })
        .then(response => response.text())
        .then(html => {
          const reportWindow = window.open('', '_blank');
          reportWindow.document.write(html);
          reportWindow.document.close();

          button.disabled = false;
          const originalContent = button.querySelector('span:last-child').textContent;
          if (originalContent) {
            button.innerHTML = button.innerHTML.replace('Generating...', originalContent);
          }
        })
        .catch(error => {
          alert('Error generating report: ' + error);
          button.disabled = false;
          button.innerHTML = button.innerHTML.replace('Generating...', type.charAt(0).toUpperCase() + type.slice(1) + ' Report');
        });
      }
    `;
  }
}