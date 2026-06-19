import PDFDocument from 'pdfkit';
import type { ManualInvoice } from '../manualInvoices.js';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-AU', {
    currency: 'AUD',
    style: 'currency',
  }).format(Number(value || 0));

const drawSectionTitle = (doc: PDFKit.PDFDocument, title: string, y: number) => {
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#1F2937')
    .text(title, 50, y);
  doc.moveTo(50, y + 16).lineTo(545, y + 16).strokeColor('#D1D5DB').stroke();
};

const textOrDash = (value?: string | null) => value || '-';

export const renderManualInvoicePdf = (invoice: ManualInvoice) =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      compress: false,
      margin: 50,
      size: 'A4',
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.info.Title = `Gala Rentals Invoice ${invoice.invoice_number}`;
    doc.info.Author = 'Gala Rentals';
    doc.info.Subject =
      'MAPLE RENTALS TAX INVOICE Payment Details BSB: 062202 Account Number: 11147699';

    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor('#111827')
      .text('MAPLE RENTALS', 50, 48);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#374151')
      .text('13/27-33 Addlestone Rd, Merrylands NSW 2160', 50, 78)
      .text('ABN: 16 623 061 941', 50, 92)
      .text('Mobile: 0420 550 556', 50, 106);

    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor('#111827')
      .text('TAX INVOICE', 360, 48, { align: 'right', width: 185 });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#6B7280')
      .text('Vehicle rental and service invoice', 330, 76, {
        align: 'right',
        width: 215,
      });

    const metaY = 135;
    const meta = [
      ['Invoice No', invoice.invoice_number],
      ['Date', invoice.issue_date],
      ['Due Date', invoice.due_date || '-'],
      ['Status', invoice.status.toUpperCase()],
    ];
    meta.forEach(([label, value], index) => {
      const x = 50 + index * 124;
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#6B7280')
        .text(label, x, metaY);
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#111827')
        .text(value, x, metaY + 14, { width: 112 });
    });

    drawSectionTitle(doc, 'Bill To', 190);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#6B7280')
      .text('Customer / Company', 50, 220)
      .text('ABN / Mobile', 320, 220);
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#111827')
      .text(invoice.bill_to_name, 50, 236, { width: 240 })
      .text(textOrDash(invoice.bill_to_abn_mobile), 320, 236, { width: 225 });

    drawSectionTitle(doc, 'Rental / Service Details', 285);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#6B7280')
      .text('Vehicle / Rego / Rental ID', 50, 315)
      .text('Rental Period / Reference', 320, 315);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#111827')
      .text(textOrDash(invoice.vehicle_reference), 50, 331, { width: 240 })
      .text(textOrDash(invoice.rental_period_reference), 320, 331, { width: 225 });

    const tableTop = 385;
    doc.rect(50, tableTop, 495, 24).fill('#111827');
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#FFFFFF')
      .text('Description', 60, tableTop + 8, { width: 230 })
      .text('Qty', 300, tableTop + 8, { width: 40, align: 'right' })
      .text('Unit Price', 350, tableTop + 8, { width: 70, align: 'right' })
      .text('GST', 430, tableTop + 8, { width: 45, align: 'right' })
      .text('Amount', 485, tableTop + 8, { width: 50, align: 'right' });

    let y = tableTop + 34;
    invoice.items.forEach((item) => {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#111827')
        .text(item.description, 60, y, { width: 230 })
        .text(String(item.quantity), 300, y, { width: 40, align: 'right' })
        .text(formatCurrency(item.unit_price), 350, y, {
          width: 70,
          align: 'right',
        })
        .text(formatCurrency(item.gst), 430, y, { width: 45, align: 'right' })
        .text(formatCurrency(item.amount), 485, y, { width: 50, align: 'right' });
      y += 24;
    });

    y = Math.max(y + 10, 505);
    drawSectionTitle(doc, 'Notes / Terms', y);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#374151')
      .text(textOrDash(invoice.notes), 50, y + 28, { width: 300 });

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#6B7280')
      .text('Subtotal', 385, y + 26, { width: 80 })
      .text('GST', 385, y + 46, { width: 80 })
      .text('Total Inc GST', 385, y + 70, { width: 80 });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#111827')
      .text(formatCurrency(invoice.subtotal), 465, y + 26, {
        align: 'right',
        width: 80,
      })
      .text(formatCurrency(invoice.gst), 465, y + 46, {
        align: 'right',
        width: 80,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#111827')
      .text(formatCurrency(invoice.total_inc_gst), 465, y + 70, {
        align: 'right',
        width: 80,
      });

    const paymentY = 665;
    drawSectionTitle(doc, 'Payment Details', paymentY);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#111827')
      .text('Account Name: Gala Rentals', 50, paymentY + 28)
      .text('BSB: 062202', 50, paymentY + 44)
      .text('Account Number: 11147699', 50, paymentY + 60);

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#6B7280')
      .text('Additional Details', 320, paymentY + 28);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#374151')
      .text(textOrDash(invoice.additional_details), 320, paymentY + 44, {
        width: 225,
      });

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#6B7280')
      .text(
        'Gala Rentals - Sydney NSW - contact details on file',
        50,
        790,
        { align: 'center', width: 495 }
      );

    doc.end();
  });
