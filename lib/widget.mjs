import { translator } from './feed.mjs';

// The current state of the six main services as an image other sites can embed with one line
// (an <img> works everywhere; the page itself refuses to be framed). Same wording as the page.

const SERVICES = ['instagram', 'whatsapp', 'telegram', 'youtube', 'x', 'facebook'];
const COLOR = { blocked: '#ef6d6d', restricted: '#e2bd59', reachable: '#55c78a' };
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

export function renderWidget({ interpretation, history, since, until, lang = 'en' }) {
  const tr = translator(lang);
  const rtl = lang === 'fa';
  const W = 560;
  const rowH = 38;
  const top = 92;
  const H = top + SERVICES.length * rowH + 44;
  const start = rtl ? W - 24 : 24;
  const end = rtl ? 24 : W - 24;
  // With direction="rtl", SVG's "start" is already the right edge: the anchors stay the same.
  const anchorStart = 'start';
  const anchorEnd = 'end';
  const dir = rtl ? ' direction="rtl"' : '';
  const items = interpretation?.services?.items ?? [];
  const rows = SERVICES.map((id, index) => {
    const item = items.find((entry) => entry.id === id);
    const status = item?.status ?? 'unavailable';
    const statusKey = `board.status.${status}`;
    const statusText = tr.t(statusKey) === statusKey ? status : tr.t(statusKey);
    const sinceInfo = history?.services?.find((service) => service.id === id)?.since;
    const sinceText = sinceInfo ? tr.t(sinceInfo.fromStart ? 'board.history.sinceStart' : 'board.history.since', { month: tr.month(sinceInfo.month) }) : '';
    const y = top + index * rowH;
    const dotX = rtl ? W - 30 : 30;
    const nameX = rtl ? W - 46 : 46;
    const statusX = rtl ? W - 190 : 190;
    return `<g>
  <line x1="24" x2="${W - 24}" y1="${y - 13}" y2="${y - 13}" stroke="#2e4668" stroke-width="1"/>
  <circle cx="${dotX}" cy="${y + 4}" r="6" fill="${COLOR[status] ?? '#8396ae'}"/>
  <text x="${nameX}" y="${y + 9}" text-anchor="${anchorStart}"${dir} font-size="16" font-weight="700" fill="#ffffff">${esc(tr.brand(id))}</text>
  <text x="${statusX}" y="${y + 9}" text-anchor="${anchorStart}"${dir} font-size="14" font-weight="700" fill="${COLOR[status] ?? '#bccadb'}">${esc(statusText)}</text>
  <text x="${end}" y="${y + 9}" text-anchor="${anchorEnd}"${dir} font-size="12" fill="#bccadb">${esc(sinceText)}</text>
</g>`;
  }).join('\n');
  const title = lang === 'fa' ? 'پایش سانسور اینترنت ایران' : 'Iran Censorship Monitor';
  const scope = `${tr.t('ui.allIranNetworks')} · ${tr.day(since)} – ${tr.day(until)}`;
  const foot = lang === 'fa' ? 'آزمون‌های OONI از داخل شبکه‌های ایران' : 'OONI tests from inside Iranian networks';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" font-family="Segoe UI, Tahoma, Vazirmatn, Arial, sans-serif">
<defs>
  <linearGradient id="bg" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#13243e"/><stop offset="1" stop-color="#1b1e40"/></linearGradient>
  <linearGradient id="line" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#59a8ff"/><stop offset=".55" stop-color="#52c9c4"/><stop offset="1" stop-color="#a78bfa"/></linearGradient>
  <linearGradient id="gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f9e098"/><stop offset=".6" stop-color="#deac41"/><stop offset="1" stop-color="#97722e"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" rx="12" fill="url(#bg)"/>
<rect y="${H - 4}" width="${W}" height="4" fill="url(#line)"/>
<text x="${start}" y="38" text-anchor="${anchorStart}"${dir} font-size="21" font-weight="700" fill="#ffffff">${esc(title)}</text>
<text x="${start}" y="62" text-anchor="${anchorStart}"${dir} font-size="13" fill="#9ad9d5">${esc(scope)}</text>
${rows}
<text x="${start}" y="${H - 16}" text-anchor="${anchorStart}"${dir} font-size="11.5" fill="#8396ae">${esc(foot)}</text>
<text x="${end}" y="${H - 16}" text-anchor="${rtl ? 'start' : 'end'}" font-size="13" font-style="italic" fill="url(#gold)">@RoyalLionSun</text>
</svg>
`;
}
