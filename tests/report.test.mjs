import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

globalThis.window ??= {};
const { buildDocxParts, zipStore } = await import('../public/v20-report.js');

const report = {
  language: 'fa', rtl: true, title: 'Iran Censorship Monitor', scope: 'TCI (AS58224) · 17–23 Sep 2026', headline: 'اینستاگرام مسدود است',
  lede: 'تأییدشده با آزمون‌ها & <نمونه>', footer: 'footer', url: 'http://127.0.0.1:4174/?asn=AS58224',
  sections: [{ title: 'سرویس‌ها', paragraphs: ['یادداشت'], table: { head: ['A', 'B', 'C'], rows: [['Instagram', 'مسدود', 'line 1\nline 2']], statusColumn: 1, statuses: ['blocked'] } }],
};

test('the Word report is a valid .docx: stored ZIP entries with correct checksums and well-formed XML', async () => {
  const parts = buildDocxParts(report);
  assert.deepEqual(Object.keys(parts), ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml']);
  assert.match(parts['word/document.xml'], /&amp; &lt;نمونه&gt;/, 'text is escaped');
  assert.match(parts['word/document.xml'], /<w:bidi\/>/, 'Farsi paragraphs run right to left');
  assert.match(parts['word/document.xml'], /<w:color w:val="C62828"\/>/, 'a blocked status is red');
  const bytes = new Uint8Array(await zipStore(parts).arrayBuffer());
  const dir = await mkdtemp(join(tmpdir(), 'docx-'));
  const file = join(dir, 'report.docx');
  await writeFile(file, bytes);
  // Python's zipfile checks every CRC; its XML parser checks each part.
  const out = execFileSync('python3', ['-c', `
import zipfile, xml.dom.minidom, sys
z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
for name in z.namelist(): xml.dom.minidom.parseString(z.read(name))
print(len(z.namelist()))`, file], { encoding: 'utf8' });
  assert.equal(out.trim(), '5');
});
