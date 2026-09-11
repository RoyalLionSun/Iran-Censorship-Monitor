import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../public/v19.css', import.meta.url), 'utf8');

test('v1.9 keeps English dashboard text above the readability floor', () => {
  assert.match(css, /body\s*\{\s*font-size:\s*16px;/);
  assert.match(css, /\.panel-note\s*\{\s*font-size:\s*14px;/);
  assert.match(css, /\.kpi-head\s*\{\s*font-size:\s*12\.5px;/);
  assert.match(css, /table\s*\{\s*font-size:\s*14px;/);
  assert.match(css, /th\s*\{\s*font-size:\s*12px;/);
});

test('v1.9 Farsi uses a Persian-capable Windows-first stack and larger text floor', () => {
  assert.match(css, /--fa-sans:\s*"Segoe UI Variable Text",\s*"Segoe UI",\s*"Noto Sans Arabic",\s*Tahoma/);
  assert.match(css, /html\[lang="fa"\]\s+body\s*\{[\s\S]*?font-size:\s*17px;[\s\S]*?line-height:\s*1\.85;/);
  assert.match(css, /html\[lang="fa"\]\s+\.panel-note,[\s\S]*?\.plain-meaning span\s*\{\s*font-size:\s*15px;/);
  assert.match(css, /html\[lang="fa"\]\s+\.situation-primary p\s*\{\s*font-size:\s*17px;/);
  assert.match(css, /html\[lang="fa"\]\s+\.situation-primary h1\s*\{[\s\S]*?font-size:\s*clamp\(26px,\s*2\.25vw,\s*36px\);/);
});

test('technical LTR fields keep the monospace safety boundary in Farsi mode', () => {
  assert.match(css, /html\[lang="fa"\]\s+\.technical-direction,[\s\S]*?\.chart text\s*\{\s*font-family:\s*var\(--mono\);\s*\}/);
});
