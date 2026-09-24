import { translator } from './feed.mjs';
import { blockedSince } from './history.mjs';

// Monthly report as a page of its own (/report?month=YYYY-MM, &lang=fa), readable on a phone,
// shareable and printable to PDF: the month's findings for all of Iran in the page's wording.

const SERVICES = ['instagram', 'whatsapp', 'telegram', 'youtube', 'x', 'facebook'];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function monthRange(month, today = new Date().toISOString().slice(0, 10)) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month ?? ''))) return null;
  const since = `${month}-01`;
  const next = new Date(`${since}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = new Date(next.getTime() - 86_400_000).toISOString().slice(0, 10);
  if (since > today || since < '2022-01-01') return null;
  return { month, since, until: last < today ? last : today, complete: last < today };
}

export function recentMonths(count = 12, today = new Date().toISOString().slice(0, 10)) {
  const out = [];
  const date = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  for (let index = 0; index < count; index += 1) {
    out.push(date.toISOString().slice(0, 7));
    date.setUTCMonth(date.getUTCMonth() - 1);
  }
  return out;
}

function page({ lang, title, body }) {
  const dir = lang === 'fa' ? 'rtl' : 'ltr';
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#13243e">
<title>${esc(title)}</title>
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png">
<link rel="stylesheet" href="/report-page.css">
<script type="module" src="/report-page.js"></script>
</head>
<body>
<header class="band"><a class="band-handle" href="/" dir="ltr">@RoyalLionSun</a><a class="band-title" href="/" dir="ltr">Iran Censorship Monitor</a><img src="/brand/logo-128.png" width="52" height="52" alt=""></header>
<main>
${body}
</main>
</body>
</html>
`;
}

export function renderMonthlyReport({ interpretation, history, outages = [], range, lang = 'en', dashboardUrl }) {
  const tr = translator(lang);
  const t = tr.t;
  const services = interpretation?.services ?? {};
  const items = services.items ?? [];
  const title = `${t('monthly.title')} · ${tr.day(range.since)} – ${tr.day(range.until)}`;
  const head = interpretation?.summary?.headline;
  const names = (head?.services ?? []).map(tr.brand);
  const headline = head && names.length && head.state === 'services-blocked'
    ? tr.plural('board.headline.services-blocked', names.length, { services: tr.list(names) })
    : head ? t(`board.headline.${head.state}`) : t('monthly.noData');
  const statusText = (status) => { const key = `board.status.${status}`; const text = t(key); return text === key ? status : text; };
  const rows = SERVICES.map((id) => {
    const item = items.find((entry) => entry.id === id);
    const web = item?.web?.measurements ? t('monthly.website', { confirmed: tr.number(item.web.confirmed), total: tr.number(item.web.measurements) }) : '—';
    const app = item?.app?.measurements ? t('monthly.app', { count: tr.number(item.app.anomalies), total: tr.number(item.app.measurements) })
      : item?.appServers?.measurements ? t('monthly.appServers', { failed: tr.number(item.appServers.confirmed + item.appServers.anomalous), total: tr.number(item.appServers.measurements) }) : '—';
    const months = history?.services?.find((service) => service.id === id)?.months?.filter((entry) => entry.month <= range.month) ?? [];
    const since = months.length ? blockedSince(months) : null;
    const sinceText = since ? t(since.fromStart ? 'board.history.sinceStart' : 'board.history.since', { month: tr.month(since.month) }) : '—';
    return `<tr><th scope="row">${esc(tr.brand(id))}</th><td class="status" data-status="${esc(item?.status ?? 'unavailable')}">${esc(statusText(item?.status ?? 'unavailable'))}</td><td>${esc(web)}</td><td>${esc(app)}</td><td>${esc(sinceText)}</td></tr>`;
  }).join('');
  const changes = services.changes;
  const change = (entry) => `${entry.name} (${t(`board.more.status.${entry.from}`)} → ${t(`board.more.status.${entry.to}`)})`;
  const changeLines = changes?.outageOverlap ? [t('monthly.changesOutage')]
    : changes?.compared ? [
      ...(!changes.worse.length && !changes.better.length ? [t('board.changes.none')] : []),
      ...(changes.worse.length ? [`${t('board.changes.worse')}: ${tr.join(changes.worse.map(change))}`] : []),
      ...(changes.better.length ? [`${t('board.changes.better')}: ${tr.join(changes.better.map(change))}`] : []),
    ] : [t('monthly.changesNone')];
  const more = (services.more ?? []).map((group) => {
    const tested = group.services.filter((service) => service.scope);
    const blocked = tested.filter((service) => service.status === 'blocked');
    return `<li><b>${esc(t(`board.more.group.${group.id}`))}</b>: ${esc(t('monthly.moreLine', { blocked: tr.number(blocked.length), total: tr.number(tested.length) }))}${blocked.length ? ` — ${esc(tr.join(blocked.map((service) => service.name)))}` : ''}</li>`;
  }).join('');
  const access = services.networkBreakdown?.access ?? [];
  const level = (name) => access.filter((entry) => entry.level === name).length;
  const monthStart = Date.parse(`${range.since}T00:00:00Z`);
  const monthEnd = Date.parse(`${range.until}T23:59:59Z`);
  const shutdowns = outages.filter((outage) => Date.parse(outage.start) <= monthEnd && (!outage.end || Date.parse(outage.end) >= monthStart));
  const vpn = services.vpnUse;
  const percent = (value) => t('board.outage.percent', { value: tr.number(value, value < 10 ? 1 : 0) });
  const body = `
<p class="kicker">${esc(t('monthly.title'))}${range.complete ? '' : ` · ${esc(t('monthly.inProgress'))}`}</p>
<h1>${esc(headline)}</h1>
<p class="scope">${esc(t('monthly.period', { from: tr.day(range.since), to: tr.day(range.until) }))}</p>
<p class="actions"><a class="button" href="${esc(dashboardUrl)}">${esc(t('monthly.open'))}</a> <button type="button" class="button" data-print>${esc(t('monthly.print'))}</button> <a class="button" href="/reports${lang === 'fa' ? '?lang=fa' : ''}">${esc(t('monthly.index.title'))}</a></p>
<section><h2>${esc(t('monthly.services'))}</h2>
<div class="scroll"><table><thead><tr><th>${esc(t('report.service'))}</th><th>${esc(t('report.status'))}</th><th>${esc(t('monthly.colWebsite'))}</th><th>${esc(t('monthly.colApp'))}</th><th>${esc(t('monthly.colSince'))}</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section><h2>${esc(t('monthly.changes'))}</h2>${changeLines.map((line) => `<p>${esc(line)}</p>`).join('')}</section>
${more ? `<section><h2>${esc(t('board.more.title'))}</h2><ul>${more}</ul></section>` : ''}
${access.length ? `<section><h2>${esc(t('monthly.access'))}</h2><p>${esc(t('monthly.accessLine', { networks: tr.number(access.length), full: tr.number(level('full')), partial: tr.number(level('partial')), blocked: tr.number(level('blocked')) }))}</p></section>` : ''}
<section><h2>${esc(t('monthly.outages'))}</h2>${shutdowns.length ? `<ul>${shutdowns.map((outage) => `<li>${esc(tr.day(outage.start))} – ${esc(outage.end ? tr.day(outage.end) : t('monthly.ongoing'))}${outage.description ? ` · ${esc(outage.description)}` : ''}</li>`).join('')}</ul>` : `<p>${esc(t('monthly.outagesNone'))}</p>`}</section>
${vpn?.current ? `<section><h2>${esc(t('monthly.vpn'))}</h2><p>${esc([t('board.vpnUse.line', { share: percent(vpn.current.share) }), vpn.yearAgo ? t('board.vpnUse.yearAgo', { share: percent(vpn.yearAgo.share) }) : ''].filter(Boolean).join(' · '))}</p></section>` : ''}
<footer><p>${esc(t('monthly.sources'))}</p><p>${esc(t('monthly.method'))}</p></footer>`;
  return page({ lang, title, body });
}

export function renderReportIndex({ lang = 'en', months, today }) {
  const tr = translator(lang);
  const t = tr.t;
  const body = `
<p class="kicker">Iran Censorship Monitor</p>
<h1>${esc(t('monthly.index.title'))}</h1>
<p class="scope">${esc(t('monthly.index.note'))}</p>
<p class="actions"><a class="button" href="/reports${lang === 'fa' ? '' : '?lang=fa'}">${lang === 'fa' ? 'English' : 'فارسی'}</a></p>
<ul class="months">${months.map((month) => {
    const range = monthRange(month, today);
    return range ? `<li><a href="/report?month=${month}${lang === 'fa' ? '&amp;lang=fa' : ''}">${esc(tr.day(range.since))} – ${esc(tr.day(range.until))}</a>${range.complete ? '' : ` <span>${esc(t('monthly.inProgress'))}</span>`}</li>` : '';
  }).join('')}</ul>`;
  return page({ lang, title: t('monthly.index.title'), body });
}
