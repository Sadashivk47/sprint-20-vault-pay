import nodemailer, { Transporter } from 'nodemailer';
import fs from 'fs';
import { DbInvoice, DbUser, logAuditEvent } from '../db/database';

let transporter: Transporter | null = null;

export async function getTransporter(): Promise<Transporter> {
  if (transporter) {
    return transporter;
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && host !== 'smtp.example.com' && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
    });
    return transporter;
  }

  // Fallback to in-memory / JSON test transporter for sandboxed test environments
  try {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('[Nodemailer] Using Ethereal test email account:', testAccount.user);
  } catch (err) {
    console.warn('[Nodemailer] Falling back to direct stream transport:', err);
    transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    });
  }

  return transporter;
}

export async function sendPaymentReceiptEmail(
  invoice: DbInvoice,
  client: Pick<DbUser, 'id' | 'name' | 'email'>,
  pdfFilePath: string
): Promise<{ success: boolean; messageId?: string; previewUrl?: string | false }> {
  try {
    const mailer = await getTransporter();
    const fromAddress = process.env.EMAIL_FROM || 'Nexus Billing Core <billing@nexuscorporate.com>';

    const pdfBuffer = fs.readFileSync(pdfFilePath);

    const info = await mailer.sendMail({
      from: fromAddress,
      to: `${client.name} <${client.email}>`,
      subject: `Payment Confirmed: Receipt for Invoice ${invoice.id} ($${invoice.amount.toFixed(2)})`,
      text: `Hello ${client.name},\n\nWe have confirmed your payment of $${invoice.amount.toFixed(2)} for Invoice ${invoice.id} (${invoice.description}).\n\nYour official receipt is attached as a PDF.\n\nThank you for choosing Nexus Corporate Services.\n\nBest regards,\nNexus Corporate Services Billing Team`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">Payment Confirmation &amp; Receipt</h2>
          <p>Dear <strong>${client.name}</strong>,</p>
          <p>We are pleased to confirm that payment for <strong>Invoice ${invoice.id}</strong> has been successfully verified via Stripe.</p>
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 4px 0;"><strong>Invoice ID:</strong> ${invoice.id}</p>
            <p style="margin: 4px 0;"><strong>Description:</strong> ${invoice.description}</p>
            <p style="margin: 4px 0;"><strong>Amount Settled:</strong> $${invoice.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</p>
            <p style="margin: 4px 0;"><strong>Status:</strong> <span style="color: #16a34a; font-weight: bold;">PAID</span></p>
            <p style="margin: 4px 0;"><strong>Date:</strong> ${invoice.paidAt ? new Date(invoice.paidAt).toLocaleString() : new Date().toLocaleString()}</p>
          </div>
          <p>Your official tax receipt is attached to this email as a PDF document.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #64748b;">Nexus Corporate Services &bull; Enterprise Financial Architecture &bull; Automated Settlement Gateway</p>
        </div>
      `,
      attachments: [
        {
          filename: `Receipt-${invoice.id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`[Nodemailer] Receipt email dispatched! Preview: ${previewUrl}`);
    } else {
      console.log(`[Nodemailer] Receipt email sent to ${client.email}, Message ID: ${info.messageId}`);
    }

    logAuditEvent({
      userId: client.id,
      userRole: 'client',
      action: 'EMAIL_RECEIPT_SENT',
      resourceId: invoice.id,
      httpStatus: 200,
      reason: `Email with PDF receipt sent to ${client.email}`,
      ipAddress: null,
    });

    return {
      success: true,
      messageId: info.messageId,
      previewUrl,
    };
  } catch (error) {
    console.error('[Nodemailer] Failed to send receipt email:', error);
    logAuditEvent({
      userId: client.id,
      userRole: 'client',
      action: 'EMAIL_RECEIPT_ERROR',
      resourceId: invoice.id,
      httpStatus: 500,
      reason: error instanceof Error ? error.message : 'Unknown email dispatch error',
      ipAddress: null,
    });
    return { success: false };
  }
}
