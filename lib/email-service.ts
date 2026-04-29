import { getDb } from './database-bun';
import { escapeHtml } from './formatters';
import { SMTPClient } from './smtp-client';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from: string;
  replyTo?: string;
}

interface NotificationData {
  requestNumber: string;
  requestorName: string;
  transferType: string;
  classification: string;
  dtaName?: string;
  nextApprover?: string;
  notes?: string;
  rejectionReason?: string;
}

class EmailService {
  private smtpClient: SMTPClient | null = null;
  private config: EmailConfig;
  private db = getDb();

  constructor() {
    this.config = this.loadConfig();
    this.initializeSMTPClient();
  }

  private loadConfig(): EmailConfig {
    const env = process.env;
    return {
      host: env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(env.SMTP_PORT || '587', 10),
      secure: env.SMTP_SECURE === 'true',
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            }
          : undefined,
      from: env.SMTP_FROM || 'AFT System <noreply@aft-system.mil>',
      replyTo: env.SMTP_REPLY_TO || 'aft-support@aft-system.mil',
    };
  }

  private initializeSMTPClient() {
    try {
      this.smtpClient = new SMTPClient({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: this.config.auth,
      });

      console.log(
        `Email service initialized with SMTP server: ${this.config.host}:${this.config.port}`,
      );
    } catch (error) {
      console.error('Failed to initialize SMTP client:', error);
    }
  }

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
    text?: string,
  ): Promise<boolean> {
    if (!this.smtpClient) {
      console.error('SMTP client not initialized');
      return false;
    }

    try {
      const result = await this.smtpClient.sendMail({
        from: this.config.from,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
        headers: {
          'Reply-To': this.config.replyTo || this.config.from,
          'X-Mailer': 'AFT System Notification Service',
        },
      });

      console.log(`Email sent successfully to ${to}: ${result.messageId}`);

      this.db
        .query(`
        INSERT INTO notification_log (recipient, subject, status, message_id, created_at)
        VALUES (?, ?, 'sent', ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
      `)
        .run(to, subject, result.messageId);

      return true;
    } catch (error) {
      console.error(`Failed to send email to ${to}:`, error);

      this.db
        .query(`
        INSERT INTO notification_log (recipient, subject, status, error, created_at)
        VALUES (?, ?, 'failed', ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
      `)
        .run(to, subject, String(error));

      return false;
    }
  }

  async notifyDTASelection(
    _requestId: number,
    dtaEmail: string,
    data: NotificationData,
  ): Promise<boolean> {
    const subject = `AFT Request ${data.requestNumber} - DTA Assignment`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">AFT Request - DTA Assignment</h2>
        <p>You have been selected as the Data Transfer Agent for the following request:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Request Number:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.requestNumber)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Requestor:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.requestorName)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Transfer Type:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.transferType)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Classification:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.classification)}</td>
          </tr>
        </table>

        <p><strong>Action Required:</strong> Please log into the AFT system to review the request details.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666;">
          This is an automated message from the AFT System. Please do not reply to this email.
        </p>
      </div>
    `;

    return await this.sendEmail(dtaEmail, subject, html);
  }

  async notifyNextApprover(
    _requestId: number,
    status: string,
    approverEmail: string,
    data: NotificationData,
  ): Promise<boolean> {
    const roleMap: Record<string, string> = {
      pending_approver: 'ISSM/ISSO Approval',
      pending_cpso: 'CPSO Approval',
      pending_dta: 'DTA Assignment',
      pending_sme_signature: 'SME Two-Person Integrity Signature',
      pending_media_custodian: 'Media Custodian Processing',
    };

    const roleName = roleMap[status] || 'Review';
    const subject = `AFT Request ${data.requestNumber} - ${roleName} Required`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">AFT Request - ${escapeHtml(roleName)} Required</h2>
        <p>A new AFT request requires your attention:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Request Number:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.requestNumber)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Requestor:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.requestorName)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Transfer Type:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.transferType)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Classification:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.classification)}</td>
          </tr>
          ${
            data.dtaName
              ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Assigned DTA:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.dtaName)}</td>
          </tr>
          `
              : ''
          }
        </table>

        ${data.notes ? `<p><strong>Previous Approver Notes:</strong><br>${escapeHtml(data.notes)}</p>` : ''}

        <p><strong>Action Required:</strong> Please log into the AFT system to review and ${status.includes('signature') ? 'sign' : 'approve'} this request.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666;">
          This is an automated message from the AFT System. Please do not reply to this email.
        </p>
      </div>
    `;

    return await this.sendEmail(approverEmail, subject, html);
  }

  async notifyRequestApproved(
    _requestId: number,
    requestorEmail: string,
    data: NotificationData,
  ): Promise<boolean> {
    const subject = `AFT Request ${data.requestNumber} - Approved`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">AFT Request Approved</h2>
        <p>Your AFT request has been approved and is proceeding through the workflow:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Request Number:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.requestNumber)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Current Status:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">Approved by ${escapeHtml(data.nextApprover || '')}</td>
          </tr>
          ${
            data.dtaName
              ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Assigned DTA:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.dtaName)}</td>
          </tr>
          `
              : ''
          }
        </table>

        ${data.notes ? `<p><strong>Approver Notes:</strong><br>${escapeHtml(data.notes)}</p>` : ''}

        <p>You will receive additional notifications as your request progresses through the approval process.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666;">
          This is an automated message from the AFT System. Please do not reply to this email.
        </p>
      </div>
    `;

    return await this.sendEmail(requestorEmail, subject, html);
  }

  async notifyRequestRejected(
    _requestId: number,
    requestorEmail: string,
    data: NotificationData,
  ): Promise<boolean> {
    const subject = `AFT Request ${data.requestNumber} - Rejected`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">AFT Request Rejected</h2>
        <p>Your AFT request has been rejected:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Request Number:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.requestNumber)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Rejected By:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.nextApprover || '')}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Reason:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.rejectionReason || 'No reason provided')}</td>
          </tr>
        </table>

        ${data.notes ? `<p><strong>Additional Notes:</strong><br>${escapeHtml(data.notes)}</p>` : ''}

        <p><strong>Next Steps:</strong> Please review the rejection reason and submit a new request with the necessary corrections.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666;">
          This is an automated message from the AFT System. Please do not reply to this email.
        </p>
      </div>
    `;

    return await this.sendEmail(requestorEmail, subject, html);
  }

  async notifyRequestCompleted(
    _requestId: number,
    requestorEmail: string,
    data: NotificationData,
  ): Promise<boolean> {
    const subject = `AFT Request ${data.requestNumber} - Completed`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">AFT Request Completed</h2>
        <p>Your AFT request has been successfully completed:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Request Number:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.requestNumber)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Transfer Type:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.transferType)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>DTA:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.dtaName || 'N/A')}</td>
          </tr>
        </table>

        ${data.notes ? `<p><strong>Completion Notes:</strong><br>${escapeHtml(data.notes)}</p>` : ''}

        <p>All required signatures have been obtained and the transfer has been completed successfully.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666;">
          This is an automated message from the AFT System. Please do not reply to this email.
        </p>
      </div>
    `;

    return await this.sendEmail(requestorEmail, subject, html);
  }

  async testConnection(): Promise<boolean> {
    if (!this.smtpClient) {
      console.error('SMTP client not initialized');
      return false;
    }

    try {
      const verified = await this.smtpClient.verify();
      if (verified) {
        console.log('SMTP connection verified successfully');
      }
      return verified;
    } catch (error) {
      console.error('SMTP connection test failed:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();

export async function getNextApproverEmails(status: string): Promise<string[]> {
  const db = getDb();

  // user_roles.role is stored lowercase (matching the UserRole constants).
  const roleMap: Record<string, string> = {
    pending_approver: 'approver',
    pending_cpso: 'cpso',
    pending_dta: 'dta',
    pending_sme_signature: 'sme',
    pending_media_custodian: 'media_custodian',
  };

  const role = roleMap[status];
  if (!role) return [];

  const users = (await db
    .query(`
    SELECT DISTINCT u.email
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    WHERE ur.role = ? AND ur.is_active = TRUE AND u.is_active = TRUE
  `)
    .all(role)) as Array<{ email: string }>;

  return users.map((u) => u.email);
}
