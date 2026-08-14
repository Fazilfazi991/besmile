import PDFDocument from 'pdfkit';
import path from 'node:path';
import type { NormalizedOfficialDocument } from './official-document-types';

const A4 = { width: 595.28, height: 841.89 };
const content = { left: 75.12, right: 520.08, top: 172.8, bottom: 690 };
const regularFont = path.join(process.cwd(), 'src/assets/fonts/Manjari-Regular.ttf');
const boldFont = path.join(process.cwd(), 'src/assets/fonts/Manjari-Bold.ttf');
const letterhead = path.join(process.cwd(), 'public/documents/letterhead/BSmile_Letterhead_Blank_A4_300dpi.png');
const letterheadHeader = path.join(process.cwd(), 'public/documents/letterhead/BSmile_Letterhead_Header.jpg');
const letterheadFooter = path.join(process.cwd(), 'public/documents/letterhead/BSmile_Letterhead_Footer.jpg');

export type OfficialReportColumn = { key: string; label: string; align?: 'left' | 'right' | 'center'; weight?: number };
export type OfficialReportInput = {
  heading: string;
  filename: string;
  columns: OfficialReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  period?: string;
  filters?: string[];
  totals?: Array<{ label: string; value: string }>;
};

export type MeetingMinutesPdfInput = {
  meetingTitle: string;
  meetingDate: string;
  meetingTime: string;
  hostName: string;
  participantNames: string[];
  agenda: string;
  discussionSummary: string;
  decisions: string[];
  actionItems: Array<{ action: string; owner: string; dueDate: string; status: string }>;
  additionalNotes?: string;
  generatedDate: string;
  preparedBy: string;
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

  doc.font('Noto-Bold').fontSize(16).fillColor('#26384d').text(input.heading, { align: 'center', characterSpacing: 0.7 });
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
      doc.font('Noto-Bold').fontSize(8.5).fillColor('#52626d').text(`${label}:`, content.left, y, { width: labelWidth });
      doc.font('Noto').fillColor('#26384d').text(value, content.left + labelWidth, y, { width: content.right - content.left - labelWidth });
      doc.y = Math.max(doc.y, y + 14);
    }
    doc.moveDown(0.65);
    doc.strokeColor('#b8d9d5').lineWidth(0.6).moveTo(content.left, doc.y).lineTo(content.right, doc.y).stroke();
    doc.moveDown(0.85);
  }

  const paragraphs = input.body.replace(/\r\n/g, '\n').split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  doc.x = content.left;
  doc.font('Noto').fontSize(10).fillColor('#263238');
  for (const paragraph of paragraphs) {
    doc.text(paragraph, { width: content.right - content.left, align: 'left', lineGap: 3, paragraphGap: 7 });
  }
  if (input.signatoryName || input.signatoryTitle) {
    if (doc.y > content.bottom - 92) doc.addPage();
    doc.moveDown(1.4);
    doc.font('Noto').fontSize(9).text('For BSmile - The Mind Studio');
    doc.moveDown(2.3);
    if (input.signatoryName) doc.font('Noto-Bold').text(input.signatoryName);
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
  doc.registerFont('Noto', regularFont);
  doc.registerFont('Noto-Bold', boldFont);

  const tableWidth = content.right - content.left;
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
    doc.fillColor('#5d6c75').font('Noto').fontSize(7).text(`Page ${pageNumber}`, content.right - 55, content.bottom + 9, { width: 55, align: 'right', lineBreak: false });
    // Table pagination is handled explicitly below. A lower PDFKit flow margin
    // prevents an unbranded automatic spill page near the reserved footer.
    doc.page.margins.bottom = 90;
    y = content.top;
    doc.x = content.left;
    doc.y = y;
  };
  const drawHeading = (continued = false) => {
    doc.font('Noto-Bold').fontSize(continued ? 9 : 15).fillColor('#26384d').text(`${input.heading}${continued ? ' - CONTINUED' : ''}`, content.left, y, { width: tableWidth, align: continued ? 'right' : 'center' });
    y = doc.y + (continued ? 8 : 7);
    if (!continued && input.period) {
      doc.font('Noto').fontSize(8).fillColor('#52626d').text(input.period, content.left, y, { width: tableWidth, align: 'center' });
      y = doc.y + 5;
    }
    if (!continued && input.filters?.length) {
      doc.font('Noto').fontSize(7.5).fillColor('#52626d').text(input.filters.join('  |  '), content.left, y, { width: tableWidth, align: 'center' });
      y = doc.y + 8;
    }
  };
  const drawTableHeader = () => {
    const headerHeight = 24;
    doc.rect(content.left, y, tableWidth, headerHeight).fill('#dcefeb');
    let x = content.left;
    input.columns.forEach((column, index) => {
      doc.font('Noto-Bold').fontSize(fontSize).fillColor('#26384d').text(column.label, x + padding, y + 6, { width: widths[index] - padding * 2, height: headerHeight - 8, align: column.align || 'left', ellipsis: true });
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
    const cellHeights = input.columns.map((column, index) => doc.font('Noto').fontSize(fontSize).heightOfString(String(row[column.key] ?? ''), { width: widths[index] - padding * 2, lineGap: 1 }));
    const rowHeight = Math.max(20, Math.min(58, Math.max(...cellHeights) + padding * 2));
    if (y + rowHeight > content.bottom) addTablePage(true);
    if (rowIndex % 2 === 1) doc.rect(content.left, y, tableWidth, rowHeight).fill('#f7faf9');
    doc.strokeColor('#d8e2e0').lineWidth(0.35).moveTo(content.left, y + rowHeight).lineTo(content.right, y + rowHeight).stroke();
    let x = content.left;
    input.columns.forEach((column, index) => {
      doc.font('Noto').fontSize(fontSize).fillColor('#263238').text(String(row[column.key] ?? ''), x + padding, y + padding, { width: widths[index] - padding * 2, height: rowHeight - padding * 2, lineGap: 1, align: column.align || 'left', ellipsis: true });
      x += widths[index];
    });
    y += rowHeight;
  }
  if (!input.rows.length) {
    doc.font('Noto').fontSize(8).fillColor('#52626d').text('No records match this report.', content.left, y + 12, { width: tableWidth, align: 'center' });
    y = doc.y + 12;
  }
  if (input.totals?.length) {
    const totalsHeight = input.totals.length * 15 + 12;
    if (y + totalsHeight > content.bottom) {
      doc.addPage();
      decorate();
      drawHeading(true);
    }
    y += 9;
    doc.strokeColor('#8fbcb6').lineWidth(0.7).moveTo(content.left, y).lineTo(content.right, y).stroke();
    y += 7;
    for (const total of input.totals) {
      doc.font('Noto-Bold').fontSize(8).fillColor('#26384d').text(total.label, content.right - 210, y, { width: 100, align: 'right' });
      doc.font('Noto').text(total.value, content.right - 100, y, { width: 100, align: 'right' });
      y += 15;
    }
  }
  doc.end();
  return { buffer: await completed, pageCount: pageNumber };
}

export async function generateMeetingMinutesDocument(input: MeetingMinutesPdfInput) {
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, size: 'A4', margins: { top: content.top, right: A4.width-content.right, bottom: A4.height-content.bottom, left: content.left }, info: { Title: `MINUTES OF MEETING - ${input.meetingTitle}`, Author: 'BSmile - The Mind Studio', Subject: 'Minutes of Meeting' }, compress: true, tagged: true });
  const chunks: Buffer[]=[];doc.on('data',chunk=>chunks.push(Buffer.from(chunk)));const completed=new Promise<Buffer>((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});doc.registerFont('Noto',regularFont);doc.registerFont('Noto-Bold',boldFont);
  const width=content.right-content.left;const flowBottom=content.bottom-30;let pageNumber=0;let explicitPage=false;
  doc.on('pageAdded',()=>{if(!explicitPage)throw new Error('Unexpected automatic MoM PDF page')});
  const addPage=()=>{explicitPage=true;doc.addPage();explicitPage=false;pageNumber+=1;doc.x=content.left;doc.y=pageNumber===1?content.top:content.top+24};
  const ensure=(height:number)=>{if(doc.y+height>flowBottom)addPage()};
  const wrapLines=(value:string,maxWidth:number,fontSize:number)=>{doc.font('Noto').fontSize(fontSize);const lines:string[]=[];let line='';for(const word of value.trim().split(/\s+/)){const candidate=line?`${line} ${word}`:word;if(doc.widthOfString(candidate)<=maxWidth){line=candidate;continue}if(line)lines.push(line);line=word}if(line)lines.push(line);return lines.length?lines:['-']};
  const flowText=(value:string,fontSize=9,color='#263238')=>{const lineHeight=fontSize*1.45;for(const original of value.replace(/\r\n/g,'\n').split(/\n{2,}/).map(part=>part.trim()).filter(Boolean)){for(const text of wrapLines(original,width,fontSize)){ensure(lineHeight+4);doc.font('Noto').fontSize(fontSize).fillColor(color).text(text,content.left,doc.y,{lineBreak:false});doc.y+=lineHeight;doc.x=content.left}doc.y+=6;doc.x=content.left}};
  const section=(heading:string,value:string)=>{if(!value.trim())return;ensure(35);doc.font('Noto-Bold').fontSize(10).fillColor('#087b78').text(heading.toUpperCase(),content.left,doc.y,{width});doc.y+=18;doc.x=content.left;flowText(value);doc.y+=3};
  addPage();doc.font('Noto-Bold').fontSize(16).fillColor('#26384d').text('MINUTES OF MEETING',content.left,doc.y,{width,align:'center',characterSpacing:.7});doc.y+=28;doc.font('Noto-Bold').fontSize(11).text(input.meetingTitle,content.left,doc.y,{width,align:'center'});doc.y+=30;
  for(const [label,value] of [['Date',input.meetingDate],['Time',input.meetingTime],['Host',input.hostName],['Participants',input.participantNames.join(', ')],['Generated',input.generatedDate],['Prepared by',input.preparedBy]]){const rowHeight=Math.max(14,doc.font('Noto').fontSize(8.5).heightOfString(value,{width:width-90}));ensure(rowHeight+3);const y=doc.y;doc.font('Noto-Bold').fillColor('#52626d').text(`${label}:`,content.left,y,{width:90});doc.font('Noto').fillColor('#26384d').text(value,content.left+90,y,{width:width-90});doc.y=y+rowHeight+3;doc.x=content.left}
  ensure(18);doc.strokeColor('#b8d9d5').lineWidth(.6).moveTo(content.left,doc.y).lineTo(content.right,doc.y).stroke();doc.y+=18;section('Agenda',input.agenda);section('Discussion Summary',input.discussionSummary);
  if(input.decisions.length){ensure(35);doc.font('Noto-Bold').fontSize(10).fillColor('#087b78').text('DECISIONS',content.left,doc.y,{width});doc.y+=18;input.decisions.forEach((decision,index)=>flowText(`${index+1}. ${decision}`));doc.y+=3}
  if(input.actionItems.length){ensure(55);doc.font('Noto-Bold').fontSize(10).fillColor('#087b78').text('ACTION ITEMS',content.left,doc.y,{width});doc.y+=20;const widths=[width*.5,width*.2,width*.17,width*.13];const labels=['Action','Owner','Due date','Status'];const header=()=>{ensure(24);const y=doc.y;doc.rect(content.left,y,width,22).fill('#dcefeb');let x=content.left;labels.forEach((label,index)=>{doc.font('Noto-Bold').fontSize(7).fillColor('#26384d').text(label,x+3,y+6,{lineBreak:false});x+=widths[index]});doc.y=y+22;doc.x=content.left};header();for(const [rowIndex,item] of input.actionItems.entries()){const values=[item.action,item.owner,item.dueDate,item.status];const cellLines=values.map((value,index)=>wrapLines(value||'-',widths[index]-6,7));const rowHeight=Math.max(22,Math.max(...cellLines.map(lines=>lines.length*9))+8);if(doc.y+rowHeight>flowBottom){addPage();header()}const y=doc.y;if(rowIndex%2===1)doc.rect(content.left,y,width,rowHeight).fill('#f7faf9');doc.strokeColor('#d8e2e0').lineWidth(.35).moveTo(content.left,y+rowHeight).lineTo(content.right,y+rowHeight).stroke();let x=content.left;cellLines.forEach((lines,index)=>{lines.forEach((text,lineIndex)=>doc.font('Noto').fontSize(7).fillColor('#263238').text(text,x+3,y+4+lineIndex*9,{lineBreak:false}));x+=widths[index]});doc.y=y+rowHeight;doc.x=content.left}doc.y+=15}
  if(input.additionalNotes)section('Additional Notes',input.additionalNotes);ensure(70);doc.y+=8;doc.font('Noto').fontSize(8.5).fillColor('#52626d').text('Prepared by',content.left,doc.y,{width});doc.y+=38;doc.font('Noto-Bold').fontSize(9).fillColor('#26384d').text(input.preparedBy,content.left,doc.y,{width});
  for(let index=0;index<pageNumber;index+=1){doc.switchToPage(index);doc.image(letterheadHeader,0,0,{width:A4.width,height:content.top});doc.image(letterheadFooter,0,content.bottom,{width:A4.width,height:A4.height-content.bottom});doc.page.margins.bottom=90;doc.fillColor('#5d6c75').font('Noto').fontSize(7).text(`Page ${index+1}`,content.right-55,content.bottom+9,{width:55,align:'right',lineBreak:false});if(index>0)doc.font('Noto-Bold').fontSize(9).fillColor('#26384d').text('MINUTES OF MEETING - CONTINUED',content.left,content.top,{width,align:'right',lineBreak:false})}
  doc.end();return {buffer:await completed,pageCount:pageNumber};
}
