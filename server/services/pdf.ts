import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { DbInvoice, DbUser } from '../db/database';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export function getReceiptPdfPath(invoiceId: string): string {
  // Sanitize invoiceId to prevent directory traversal
  const safeId = invoiceId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(UPLOADS_DIR, `receipt-${safeId}.pdf`);
}

export async function generateInvoicePdf(
  invoice: DbInvoice,
  client: Pick<DbUser, 'id' | 'name' | 'email'>
): Promise<string> {
  const filePath = getReceiptPdfPath(invoice.id);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
      });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // --- Header / Branding ---
      doc
        .fillColor('#0F172A')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('NEXUS CORPORATE SERVICES', 50, 50);

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#64748B')
        .text('B2B Strategic Consulting & Enterprise Advisory', 50, 78)
        .text('Suite 400, Financial District | billing@nexuscorporate.com', 50, 90);

      // Top right status box
      doc
        .roundedRect(400, 45, 145, 45, 4)
        .fillAndStroke('#DCFCE7', '#16A34A');

      doc
        .fillColor('#15803D')
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('PAID IN FULL', 415, 55);

      doc
        .fillColor('#166534')
        .fontSize(8)
        .font('Helvetica')
        .text('Verified via Stripe Core', 415, 72);

      // Divider
      doc
        .moveTo(50, 115)
        .lineTo(545, 115)
        .strokeColor('#E2E8F0')
        .lineWidth(1)
        .stroke();

      // --- Metadata Grid ---
      const metaY = 135;
      // Left Column: Bill To
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#334155')
        .text('BILLED TO:', 50, metaY);

      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#0F172A')
        .text(client.name, 50, metaY + 16);

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#475569')
        .text(`Account ID: ${client.id}`, 50, metaY + 34)
        .text(`Email: ${client.email}`, 50, metaY + 48);

      // Right Column: Invoice Details
      const rightColX = 340;
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#334155')
        .text('RECEIPT DETAILS:', rightColX, metaY);

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#475569')
        .text(`Receipt #: REC-${invoice.id}`, rightColX, metaY + 16)
        .text(`Invoice ID: ${invoice.id}`, rightColX, metaY + 30)
        .text(`Created: ${new Date(invoice.createdAt).toLocaleDateString()}`, rightColX, metaY + 44)
        .text(
          `Payment Date: ${invoice.paidAt ? new Date(invoice.paidAt).toLocaleString() : new Date().toLocaleString()}`,
          rightColX,
          metaY + 58
        );

      if (invoice.stripePaymentIntentId) {
        doc.text(`Stripe Tx: ${invoice.stripePaymentIntentId}`, rightColX, metaY + 72);
      }

      // --- Line Item Table ---
      const tableY = 240;
      // Table Header
      doc
        .rect(50, tableY, 495, 24)
        .fill('#F8FAFC');

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#475569')
        .text('DESCRIPTION / SERVICE DELIVERABLE', 60, tableY + 7)
        .text('STATUS', 380, tableY + 7)
        .text('AMOUNT', 470, tableY + 7, { width: 65, align: 'right' });

      // Table Row
      doc
        .rect(50, tableY + 24, 495, 45)
        .fillAndStroke('#FFFFFF', '#E2E8F0');

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#0F172A')
        .text(invoice.description, 60, tableY + 32, { width: 300 });

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#16A34A')
        .text('SETTLED', 380, tableY + 32);

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#0F172A')
        .text(`$${invoice.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 470, tableY + 32, {
          width: 65,
          align: 'right',
        });

      // --- Summary / Total Box ---
      const totalY = tableY + 85;
      doc
        .rect(340, totalY, 205, 55)
        .fill('#F1F5F9');

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#475569')
        .text('Total Amount Paid (USD):', 355, totalY + 12);

      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#0F172A')
        .text(`$${invoice.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 355, totalY + 28);

      // --- Watermark / Large Paid Stamp ---
      doc.save();
      doc.translate(280, 480);
      doc.rotate(-20);
      doc
        .roundedRect(-110, -35, 220, 70, 8)
        .lineWidth(4)
        .strokeColor('#16A34A');
      doc
        .fontSize(36)
        .font('Helvetica-Bold')
        .fillColor('#16A34A')
        .text('PAID', -90, -18);
      doc.restore();

      // --- Security & Verification Footer ---
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#94A3B8')
        .text(
          'VaultPay Cryptographic Financial Core. Validated via signed webhook authorization. This electronic receipt serves as binding proof of settlement for tax and accounting records.',
          50,
          720,
          { width: 495, align: 'center' }
        );

      doc.end();

      writeStream.on('finish', () => {
        resolve(filePath);
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}
