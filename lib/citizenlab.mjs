import { fetchText } from './common.mjs';

const IR_URL = 'https://raw.githubusercontent.com/citizenlab/test-lists/master/lists/ir.csv';

function csvRow(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { cells.push(current); current = ''; }
    else current += char;
  }
  cells.push(current);
  return cells;
}

export function parseCitizenLabIranList(text) {
  const lines = String(text ?? '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = csvRow(lines[0]).map((value) => value.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = csvRow(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    const url = row.url || values[0] || '';
    if (!/^https?:\/\//i.test(url)) return null;
    return {
      url,
      categoryCode: row.category_code || row.category || values[1] || null,
      categoryDescription: row.category_description || values[2] || null,
      dateAdded: row.date_added || values[3] || null,
      source: row.source || values[4] || null,
      notes: row.notes || values[5] || null,
    };
  }).filter(Boolean);
}

export async function getCitizenLabIranTargets({ category = '', search = '', limit = 200 } = {}) {
  const text = await fetchText(IR_URL, { cacheTtlMs: 6 * 60 * 60 * 1000 });
  let rows = parseCitizenLabIranList(text);
  const categoryNeedle = String(category).trim().toUpperCase();
  const searchNeedle = String(search).trim().toLowerCase();
  if (categoryNeedle) rows = rows.filter((row) => String(row.categoryCode ?? '').toUpperCase() === categoryNeedle);
  if (searchNeedle) rows = rows.filter((row) => `${row.url} ${row.categoryDescription ?? ''} ${row.notes ?? ''}`.toLowerCase().includes(searchNeedle));
  const categories = new Map();
  for (const row of rows) {
    const key = row.categoryCode || 'OTHER';
    categories.set(key, { code: key, description: row.categoryDescription ?? null, count: (categories.get(key)?.count ?? 0) + 1 });
  }
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 500));
  return {
    ok: true,
    source: 'Citizen Lab Test Lists',
    country: 'IR',
    status: rows.length ? 'observed' : 'no_data',
    totalMatched: rows.length,
    targets: rows.slice(0, safeLimit),
    categories: [...categories.values()].sort((a, b) => b.count - a.count),
    sourceUrl: IR_URL,
    fetchedAt: new Date().toISOString(),
    note: 'The Iran test list is a curated target inventory for censorship testing, not a statement that every listed URL is currently blocked.',
  };
}
