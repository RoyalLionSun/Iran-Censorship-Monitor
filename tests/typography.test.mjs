import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../public/v19.css', import.meta.url), 'utf8');

// Readability floors: sizes may grow, never fall below these.
function size(pattern) {
  const match = css.match(pattern);
  assert.ok(match, `no rule for ${pattern}`);
  return Number(match[1]);
}

test('v1.9 keeps English dashboard text above the readability floor', () => {
  assert.ok(size(/body\s*\{\s*font-size:\s*([\d.]+)px;/) >= 16);
  assert.ok(size(/\.panel-note\s*\{\s*font-size:\s*([\d.]+)px;/) >= 14);
  assert.ok(size(/\.kpi-head\s*\{\s*font-size:\s*([\d.]+)px;/) >= 12.5);
  assert.ok(size(/table\s*\{\s*font-size:\s*([\d.]+)px;/) >= 14);
  assert.ok(size(/th\s*\{\s*font-size:\s*([\d.]+)px;/) >= 12);
});

test('v1.9 Farsi uses Vazirmatn for Persian letters, a Windows fallback and a larger text floor', () => {
  assert.match(css, /--fa-sans:\s*"Vazirmatn",\s*"Segoe UI Variable Text",\s*"Segoe UI",\s*"Noto Sans Arabic",\s*Tahoma/);
  // The Persian font loads only for Persian characters, so English pages never fetch it.
  assert.match(css, /@font-face\s*\{\s*font-family:\s*"Vazirmatn";[\s\S]*?unicode-range:\s*U\+0600-06FF/);
  assert.ok(size(/html\[lang="fa"\]\s+body\s*\{[\s\S]*?font-size:\s*([\d.]+)px;/) >= 17);
  assert.match(css, /html\[lang="fa"\]\s+body\s*\{[\s\S]*?line-height:\s*1\.85;/);
  assert.ok(size(/html\[lang="fa"\]\s+\.panel-note,[\s\S]*?\.plain-meaning span\s*\{\s*font-size:\s*([\d.]+)px;/) >= 15);
  assert.ok(size(/html\[lang="fa"\]\s+\.situation-primary p\s*\{\s*font-size:\s*([\d.]+)px;/) >= 17);
  assert.match(css, /html\[lang="fa"\]\s+\.situation-primary h1\s*\{[\s\S]*?font-size:\s*clamp\(26px,\s*2\.25vw,\s*36px\);/);
});

test('technical LTR fields keep the monospace safety boundary in Farsi mode', () => {
  assert.match(css, /html\[lang="fa"\]\s+\.technical-direction,[\s\S]*?\.chart text\s*\{\s*font-family:\s*var\(--mono\);\s*\}/);
});
