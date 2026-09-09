import PDFDocument from 'pdfkit';
import path from 'node:path';
import type { NormalizedOfficialDocument } from './official-document-types';

const A4 = { width: 595.28, height: 841.89 };
const content = { left: 75.12, right: 520.08, top: 172.8, bottom: 690 };
const regularFont = path.join(process.cwd(), 'src/assets/fonts/Manjari-Regular.ttf');
const boldFont = path.join(process.cwd(), 'src/assets/fonts/Manjari-Bold.ttf');
const letterhead = path.join(process.cwd(), 'public/documents/letterhead/BSmile_Letterhead_Blank_A4_300dpi.png');

export type OfficialReportColumn = { key: string; label: string; align?: 'left' | 'right' | 'center'; weight?: number };
export type OfficialReportInput = {
  heading: string;
  filename: string;
  columns: OfficialReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  period?: string;
  filters?: string[];
  totals?: Array<{ label: string; value: string }>;
  details?: Array<{ label: string; value: string }>;
};

function formattedDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function metadataRows(input: NormalizedOfficialDocument) {
  if (input.documentType === 'offer_letter') return [
    ['Date of issue', formattedDate(input.issueDate)],
    ['Candidate', input.relatedName || ''],
    ['Position', input.position || ''],
    ['Department', input.department || ''],
    ['Joining date', formattedDate(input.joiningDate)],
    ['Compensation', input.compensation || ''],
  ].filter(([, value]) => value);
  if (input.documentType === 'policy') return [
    ['Effective date', formattedDate(input.issueDate)],
    ['Category', input.policyCategory || 'General'],
  ];
  return [['Date', formattedDate(input.issueDate)], ['Related to', input.relatedName || '']].filter(([, value]) => value);
}

export async function generateOfficialDocument(input: NormalizedOfficialDocument) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    size: 'A4',
    margins: { top: content.top, right: A4.width - content.right, bottom: A4.height - content.bottom, left: content.left },
    info: { Title: `${input.heading} - ${input.relatedName || input.title || 'BSmile'}`, Author: 'BSmile - The Mind Studio', Subject: input.typeLabel },
    compress: true,
    tagged: true,
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.registerFont('Noto', regularFont);
  doc.registerFont('Noto-Bold', boldFont);

  let pageNumber = 0;
  const decoratePage = () => {
    pageNumber += 1;
    doc.image(letterhead, 0, 0, { width: A4.width, height: A4.height });
    doc.fillColor('#26384d').font('Noto-Bold').fontSize(pageNumber === 1 ? 16 : 9);
    if (pageNumber > 1) doc.text(`${input.heading} - CONTINUED`, content.left, content.top, { width: content.right - content.left, align: 'right' });
    const flowBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 90;
    doc.fillColor('#5d6c75').font('Noto').fontSize(7).text(`Page ${pageNumber}`, content.right - 55, content.bottom + 9, { width: 55, align: 'right', lineBreak: false });
    doc.page.margins.bottom = flowBottomMargin;
    doc.fillColor('#26384d');
    doc.x = content.left;
    doc.y = pageNumber === 1 ? content.top : content.top + 22;
  };
  doc.on('pageAdded', decoratePage);
  doc.addPage();

  const isOfferLetter = input.documentType === 'offer_letter';
  doc.font('Noto-Bold').fontSize(isOfferLetter ? 19 : 16).fillColor('#26384d').text(input.heading, { align: 'center', characterSpacing: isOfferLetter ? 0.45 : 0.7 });
  doc.moveDown(0.55);
  if (input.title) {
    doc.font('Noto-Bold').fontSize(11).fillColor('#26384d').text(input.title, { align: 'center' });
    doc.moveDown(0.7);
  }
  const rows = metadataRows(input);
  if (rows.length) {
    const labelWidth = 100;
    for (const [label, value] of rows) {
      const y = doc.y;
      doc.font('Noto-Bold').fontSize(isOfferLetter ? 10 : 8.5).fillColor('#52626d').text(`${label}:`, content.left, y, { width: labelWidth });
      doc.font('Noto').fontSize(isOfferLetter ? 10.5 : 8.5).fillColor('#26384d').text(value, content.left + labelWidth, y, { width: content.right - content.left - labelWidth });
      doc.y = Math.max(doc.y, y + (isOfferLetter ? 16 : 14));
    }
    doc.moveDown(0.65);
    doc.strokeColor('#b8d9d5').lineWidth(0.6).moveTo(content.left, doc.y).lineTo(content.right, doc.y).stroke();
    doc.moveDown(0.85);
  }

  const paragraphs = input.body.replace(/\r\n/g, '\n').split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  doc.x = content.left;
  doc.font('Noto').fontSize(isOfferLetter ? 10.75 : 10).fillColor('#263238');
  for (const paragraph of paragraphs) {
    doc.text(paragraph, { width: content.right - content.left, align: 'left', lineGap: isOfferLetter ? 3.4 : 3, paragraphGap: isOfferLetter ? 8 : 7 });
  }
  if (input.signatoryName || input.signatoryTitle) {
    if (doc.y > content.bottom - 92) doc.addPage();
    doc.moveDown(1.4);
    doc.font('Noto').fontSize(9).text('For BSmile - The Mind Studio');
    doc.moveDown(2.3);
    if (input.signatoryName) doc.font('Noto-Bold').fontSize(isOfferLetter ? 10.5 : 9).text(input.signatoryName);
    if (input.signatoryTitle) doc.font('Noto').fillColor('#52626d').text(input.signatoryTitle);
  }
  doc.end();
  const buffer = await completed;
  return { buffer, pageCount: pageNumber };
}

export async function generateOfficialReport(input: OfficialReportInput) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    size: 'A4',
    margins: { top: content.top, right: A4.width - content.right, bottom: A4.height - content.bottom, left: content.left },
    info: { Title: input.heading, Author: 'BSmile - The Mind Studio', Subject: 'Official report' },
    compress: true,
    tagged: true,
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const isInvoice = input.heading === 'INVOICE';
  doc.registerFont('Noto', regularFont);
  doc.registerFont('Noto-Bold', boldFont);
  const reportRegular = isInvoice ? 'Helvetica' : 'Noto';
  const reportBold = isInvoice ? 'Helvetica-Bold' : 'Noto-Bold';

  const tableWidth = content.right - content.left;
  // PDFKit's wrapped Helvetica metrics can under-report the final painted line
  // slightly. Keep an additional invoice buffer so a row never auto-spills
  // onto an undecorated page between our explicit page breaks.
  const tableBottom = isInvoice ? 520 : content.bottom - 36;
  const fontSize = input.columns.length > 7 ? 6.3 : input.columns.length > 5 ? 7 : 7.7;
  const padding = 3.5;
  const weights = input.columns.map((column) => Math.max(0.65, Math.min(2.4, column.weight || Math.max(0.8, Math.min(1.8, column.label.length / 9)))));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const widths = weights.map((weight) => tableWidth * weight / weightTotal);
  let pageNumber = 0;
  let y = content.top;

  const decorate = () => {
    pageNumber += 1;
    doc.image(letterhead, 0, 0, { width: A4.width, height: A4.height });
    doc.page.margins.bottom = 90;
    doc.fillColor('#5d6c75').font(reportRegular).fontSize(7).text(`Page ${pageNumber}`, content.right - 55, content.bottom + 9, { width: 55, align: 'right', lineBreak: false });
    // Table pagination is handled explicitly below. Keep the normal text flow
    // above the reserved letterhead footer after drawing the page number.
    doc.page.margins.bottom = A4.height - content.bottom;
    y = content.top;
    doc.x = content.left;
    doc.y = y;
  };
  const drawHeading = (continued = false) => {
    doc.font(reportBold).fontSize(continued ? 10 : isInvoice ? 19 : 15).fillColor('#26384d').text(`${input.heading}${continued ? ' - CONTINUED' : ''}`, content.left, y, { width: tableWidth, align: continued ? 'right' : 'center' });
    y = doc.y + (continued ? 8 : 7);
    if (!continued && input.period) {
      doc.font(reportRegular).fontSize(isInvoice ? 10 : 8).fillColor('#52626d').text(input.period, content.left, y, { width: tableWidth, align: 'center' });
      y = doc.y + 5;
    }
    if (!continued && input.filters?.length) {
      doc.font(reportRegular).fontSize(isInvoice ? 10 : 7.5).fillColor('#52626d').text(input.filters.join('  |  '), content.left, y, { width: tableWidth, align: 'center' });
      y = doc.y + 8;
    }
    if (!continued && input.details?.length) {
      y += 4;
      for (const detail of input.details) {
        doc.font(reportBold).fontSize(10).fillColor('#26384d').text(`${detail.label}:`, content.left, y, { width: 92, continued: false });
        doc.font(reportRegular).fontSize(10).fillColor('#263238').text(detail.value, content.left + 96, y, { width: tableWidth - 96 });
        y = Math.max(doc.y, y + 15);
      }
      y += 8;
    }
  };
  const drawTableHeader = () => {
    const headerHeight = 24;
    doc.rect(content.left, y, tableWidth, headerHeight).fill('#dcefeb');
    let x = content.left;
    input.columns.forEach((column, index) => {
      doc.font(reportBold).fontSize(isInvoice ? 10 : fontSize).fillColor('#26384d').text(column.label, x + padding, y + 6, { width: widths[index] - padding * 2, height: headerHeight - 8, align: column.align || 'left', ellipsis: true });
      x += widths[index];
    });
    y += headerHeight;
  };
  const addTablePage = (continued: boolean) => {
    doc.addPage();
    decorate();
    drawHeading(continued);
    drawTableHeader();
  };

  addTablePage(false);
  for (const [rowIndex, row] of input.rows.entries()) {
    const bodyFontSize = isInvoice ? 10 : fontSize;
    const cellHeights = input.columns.map((column, index) => doc.font(reportRegular).fontSize(bodyFontSize).heightOfString(String(row[column.key] ?? ''), { width: widths[index] - padding * 2, lineGap: 1.5 }));
    const rowHeight = Math.max(isInvoice ? 24 : 20, Math.max(...cellHeights) + padding * 2);
    if (y + rowHeight > tableBottom) addTablePage(true);
    if (rowIndex % 2 === 1) doc.rect(content.left, y, tableWidth, rowHeight).fill('#f7faf9');
    doc.strokeColor('#d8e2e0').lineWidth(0.35).moveTo(content.left, y + rowHeight).lineTo(content.right, y + rowHeight).stroke();
    let x = content.left;
    input.columns.forEach((column, index) => {
      doc.font(reportRegular).fontSize(bodyFontSize).fillColor('#263238').text(String(row[column.key] ?? ''), x + padding, y + padding, { width: widths[index] - padding * 2, height: rowHeight - padding * 2, lineGap: 1.5, align: column.align || 'left', ellipsis: true });
      x += widths[index];
    });
    y += rowHeight;
  }
  if (!input.rows.length) {
    doc.font(reportRegular).fontSize(8).fillColor('#52626d').text('No records match this report.', content.left, y + 12, { width: tableWidth, align: 'center' });
    y = doc.y + 12;
  }
  if (input.totals?.length) {
    const totalsHeight = input.totals.length * 15 + 12;
    if (y + totalsHeight > tableBottom) {
      doc.addPage();
      decorate();
      drawHeading(true);
    }
    y += 9;
    doc.strokeColor('#8fbcb6').lineWidth(0.7).moveTo(content.left, y).lineTo(content.right, y).stroke();
    y += 7;
    for (const total of input.totals) {
      const isGrandTotal = isInvoice && total.label === 'Total';
      doc.font(reportBold).fontSize(isGrandTotal ? 13.5 : isInvoice ? 10.5 : 8).fillColor('#26384d').text(total.label, content.right - 210, y, { width: 100, align: 'right' });
      doc.font(isGrandTotal ? reportBold : reportRegular).fontSize(isGrandTotal ? 13.5 : isInvoice ? 10.5 : 8).text(total.value, content.right - 100, y, { width: 100, align: 'right' });
      y += 15;
    }
  }
  doc.end();
  return { buffer: await completed, pageCount: pageNumber };
}
