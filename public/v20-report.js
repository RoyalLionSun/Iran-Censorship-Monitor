import { getLanguage, t } from './i18n.js';

// Report export: the Overview as a Word document (.docx, built here without libraries) or as a
// PDF through the browser's own "Save as PDF" (the only way that sets Farsi correctly without
// shipping fonts and a text-shaping engine). Both take their text from the rendered Overview,
// so wording, language and figures are exactly what the reader sees.

// Text of an element with its parts separated ("Partly" + "638 tests", not "Partly638 tests"),
// without the invisible direction marks the page puts around Latin names.
function text(element) {
  if (!element) return '';
  const parts = (node) => (node.nodeType === 3 ? node.textContent
    : node.nodeType === 1 && !node.classList?.contains('visually-hidden') ? [...node.childNodes].map(parts).join(' ') : '');
  return parts(element).replace(/[⁦-⁩]/g, '').replace(/\s+/g, ' ').replace(/ ([,.;:)])/g, '$1').replace(/\( /g, '(').trim();
}
const all = (selector, root = document) => [...root.querySelectorAll(selector)];

// ---------------------------------------------------------------- report model

export function collectReport(root = document) {
  const board = root.querySelector('#current-situation');
  if (!board || !root.querySelector('#situation-headline')) return null;
  const sections = [];
  const changes = root.querySelector('.changes-board');
  if (changes) {
    sections.push({ title: text(changes.querySelector('h2')), paragraphs: all('header p, p, li', changes).filter((node) => !node.closest('h2')).map(text).filter(Boolean) });
  }
  const tiles = all('.service-tile', root);
  if (tiles.length) {
    const board = root.querySelector('.service-board');
    sections.push({
      title: text(board?.querySelector('h2')), paragraphs: [text(board?.querySelector('header p'))].filter(Boolean),
      table: {
        head: [t('report.service'), t('report.status'), t('report.details')],
        rows: tiles.map((tile) => [text(tile.querySelector('h3')), text(tile.querySelector('.service-tile-status')), all('li', tile).map(text).join('\n')]),
        statusColumn: 1, statuses: tiles.map((tile) => tile.dataset.status),
      },
    });
  }
  const row = all('#status-row > div', root);
  if (row.length) {
    sections.push({
      title: t('report.connection'),
      table: { head: [t('report.indicator'), t('report.value'), t('report.details')], rows: row.map((item) => [text(item.querySelector('dt')), text(item.querySelector('dd')), text(item.querySelector('small'))]) },
    });
  }
  const more = root.querySelector('.more-services');
  if (more) {
    sections.push({
      title: text(more.querySelector('h2')), paragraphs: [text(more.querySelector('header p'))].filter(Boolean),
      table: {
        head: [t('report.group'), t('report.results')],
        rows: all('.more-group', more).map((group) => [text(group.querySelector('h3')),
          [all('.more-chip', group).map((chip) => [chip.querySelector('.more-chip-name'), chip.querySelector('.more-chip-status'), chip.querySelector('.more-chip-app')].map(text).filter(Boolean).join(': ')).join(' · '),
            text(group.querySelector('.vpn-use span'))].filter(Boolean).join('\n')]),
      },
    });
  }
  const access = root.querySelector('#access-table');
  if (access) {
    const accessBoard = root.querySelector('.access-board');
    sections.push({
      title: text(accessBoard?.querySelector('h2')), paragraphs: [text(accessBoard?.querySelector('header p')), text(accessBoard?.querySelector('.access-legend'))].filter(Boolean),
      table: {
        head: all('thead th', access).map(text),
        rows: all('tbody tr', access).map((tr) => all('th, td', tr).map((td) => (td.classList.contains('access-cell') ? (td.querySelector('[aria-hidden="true"]')?.textContent ?? '·') : text(td)))),
      },
    });
  }
  for (const id of ['#user-meaning', '#current-unknowns']) {
    const panel = root.querySelector(id);
    if (panel && text(panel)) sections.push({ title: text(panel.querySelector('h2')), paragraphs: all('p, li', panel).map(text).filter(Boolean) });
  }
  return {
    language: getLanguage(), rtl: getLanguage() === 'fa',
    title: 'Iran Censorship Monitor',
    scope: text(root.querySelector('.situation-scope')),
    headline: text(root.querySelector('#situation-headline')),
    lede: text(root.querySelector('.situation-lede')),
    sections,
    footer: t('report.footer', { date: new Date().toISOString().replace('T', ' ').slice(0, 16) }),
    url: typeof location === 'undefined' ? '' : location.href,
  };
}

// ---------------------------------------------------------------- .docx

const xml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))
  // Characters XML 1.0 forbids would make Word refuse the file.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const STATUS_COLOR = { blocked: 'C62828', restricted: 'E65100', partial: 'E65100', reachable: '2E7D32', unclear: '616161', untested: '616161' };

function run(value, { bold = false, color = null, size = null, rtl = false } = {}) {
  const lines = String(value ?? '').split('\n');
  const props = `${bold ? '<w:b/><w:bCs/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ''}${rtl ? '<w:rtl/>' : ''}`;
  return lines.map((line, index) => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(line)}</w:t></w:r>`).join('');
}

function paragraph(value, { style = null, rtl = false, ...runOptions } = {}) {
  const props = `${style ? `<w:pStyle w:val="${style}"/>` : ''}${rtl ? '<w:bidi/>' : ''}`;
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${run(value, { rtl, ...runOptions })}</w:p>`;
}

function table({ head, rows, statusColumn = null, statuses = [] }, rtl) {
  const cell = (value, options = {}) => `<w:tc><w:tcPr>${options.header ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EEF7"/>' : ''}</w:tcPr>${paragraph(value, { rtl, bold: options.header || options.bold, color: options.color })}</w:tc>`;
  const header = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${head.map((value) => cell(value, { header: true })).join('')}</w:tr>`;
  const body = rows.map((cells, index) => `<w:tr>${cells.map((value, column) => cell(value, column === statusColumn ? { bold: true, color: STATUS_COLOR[statuses[index]] ?? null } : column === 0 ? { bold: true } : {})).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblStyle w:val="ReportTable"/><w:tblW w:w="5000" w:type="pct"/>${rtl ? '<w:bidiVisual/>' : ''}</w:tblPr>${header}${body}</w:tbl>${paragraph('')}`;
}

export function buildDocxParts(report) {
  const rtl = report.rtl;
  const body = [
    paragraph(report.title, { style: 'Title', rtl: false }),
    paragraph(report.scope, { style: 'Subtitle', rtl }),
    paragraph(report.headline, { style: 'Heading1', rtl }),
    paragraph(report.lede, { rtl }),
    ...report.sections.flatMap((section) => [
      paragraph(section.title, { style: 'Heading2', rtl }),
      ...(section.paragraphs ?? []).map((line) => paragraph(line, { rtl })),
      ...(section.table?.rows?.length ? [table(section.table, rtl)] : []),
    ]),
    paragraph(report.footer, { style: 'Footer', rtl }),
    paragraph(report.url, { style: 'Footer', rtl: false }),
  ].join('');
  const font = rtl ? 'Tahoma' : 'Calibri';
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="Tahoma" w:eastAsia="${font}"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="${rtl ? 'fa-IR' : 'en-GB'}" w:bidi="fa-IR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="13243E"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:color w:val="5B6B80"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="C62828"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="1F63A8"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="5B6B80"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="ReportTable"><w:name w:val="Report Table"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="C9D3E0"/><w:left w:val="single" w:sz="4" w:color="C9D3E0"/><w:bottom w:val="single" w:sz="4" w:color="C9D3E0"/><w:right w:val="single" w:sz="4" w:color="C9D3E0"/><w:insideH w:val="single" w:sz="4" w:color="C9D3E0"/><w:insideV w:val="single" w:sz="4" w:color="C9D3E0"/></w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>${rtl ? '<w:bidi/>' : ''}</w:sectPr></w:body></w:document>`;
  return {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'word/document.xml': document,
    'word/styles.xml': styles,
  };
}

// A ZIP container with stored (uncompressed) entries: all a .docx needs, in a few lines.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipStore(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true);
    entry.setUint32(16, crc, true); entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true); entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function fileName(extension) {
  return `iran-censorship-monitor-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function exportDocx() {
  const report = collectReport();
  if (!report) return false;
  download(zipStore(buildDocxParts(report)), fileName('docx'));
  return true;
}

// ---------------------------------------------------------------- PDF (print layout)

// The report as a print document (headings, tables, status colours from report-print.css).
export function renderPrintDocument(doc, report) {
  doc.documentElement.lang = report.language;
  doc.documentElement.dir = report.rtl ? 'rtl' : 'ltr';
  doc.title = fileName('pdf').replace(/\.pdf$/, '');
  const add = (parent, tag, value, className = '') => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    parent.append(node);
    return node;
  };
  const body = doc.body;
  const header = add(body, 'header', undefined, 'report-head');
  add(header, 'p', report.title, 'report-title').dir = 'ltr';
  add(header, 'p', report.scope, 'report-scope');
  add(body, 'h1', report.headline);
  add(body, 'p', report.lede, 'report-lede');
  for (const section of report.sections) {
    add(body, 'h2', section.title);
    for (const line of section.paragraphs ?? []) add(body, 'p', line);
    if (!section.table?.rows?.length) continue;
    const tableNode = add(body, 'table');
    const headRow = add(add(tableNode, 'thead'), 'tr');
    for (const value of section.table.head) add(headRow, 'th', value);
    const tbody = add(tableNode, 'tbody');
    section.table.rows.forEach((cells, index) => {
      const tr = add(tbody, 'tr');
      cells.forEach((value, column) => {
        const td = add(tr, 'td', value);
        if (column === section.table.statusColumn) td.dataset.status = section.table.statuses?.[index] ?? '';
      });
    });
  }
  const footer = add(body, 'footer', undefined, 'report-foot');
  add(footer, 'p', report.footer);
  add(footer, 'p', report.url).dir = 'ltr';
}

// A hidden frame holds the report in its own print layout (report-print.css from this site, so
// the page's content security policy allows it) and opens the browser's print dialog, where
// "Save as PDF" writes the file.
export function exportPdf() {
  const report = collectReport();
  if (!report) return false;
  document.querySelector('#report-print-frame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'report-print-frame';
  frame.className = 'report-print-frame';
  frame.setAttribute('aria-hidden', 'true');
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"><title></title><link rel="stylesheet" href="/report-print.css"></head><body></body></html>');
  doc.close();
  renderPrintDocument(doc, report);
  const print = () => { frame.contentWindow.focus(); frame.contentWindow.print(); };
  const sheet = doc.querySelector('link[rel="stylesheet"]');
  if (sheet && !sheet.sheet) sheet.addEventListener('load', print, { once: true });
  else print();
  return true;
}

// ---------------------------------------------------------------- wiring

if (typeof document !== 'undefined') {
  document.querySelector('#pdf-button')?.addEventListener('click', () => exportPdf());
  document.querySelector('#docx-button')?.addEventListener('click', () => exportDocx());
}
