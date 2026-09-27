import { translator } from './feed.mjs';
import { blockedSince } from './history.mjs';
import { MORE_SERVICE_GROUPS } from '../public/service-findings.js';

// Weekly and monthly reports as pages of their own (/report?week=YYYY-MM-DD or ?month=YYYY-MM,
// &lang=fa), readable on a phone, shareable and printable to PDF: the period's findings for all of
// Iran in the page's wording.

const SERVICES = ['instagram', 'whatsapp', 'telegram', 'youtube', 'x', 'facebook'];
// Farsi names of the further services, as on the dashboard.
const MORE_NAMES_FA = new Map(MORE_SERVICE_GROUPS.flatMap((group) => group.services).filter((service) => service.nameFa).map((service) => [service.id, service.nameFa]));
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

// Weeks run Saturday to Friday, the working week in Iran; a week is named by its Saturday.
const DAY_MS = 86_400_000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export function weekRange(week, today = new Date().toISOString().slice(0, 10)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(week ?? ''))) return null;
  const start = Date.parse(`${week}T00:00:00Z`);
  if (!Number.isFinite(start) || isoDay(start) !== week || new Date(start).getUTCDay() !== 6) return null;
  const last = isoDay(start + 6 * DAY_MS);
  if (week > today || week < '2022-01-01') return null;
  return { week, since: week, until: last < today ? last : today, complete: last < today };
}

export function recentWeeks(count = 8, today = new Date().toISOString().slice(0, 10)) {
  const now = Date.parse(`${today}T00:00:00Z`);
  const saturday = now - ((new Date(now).getUTCDay() + 1) % 7) * DAY_MS;
  return Array.from({ length: count }, (_, index) => isoDay(saturday - index * 7 * DAY_MS));
}

export function page({ lang, title, body }) {
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
<header class="band"><a class="band-handle" href="/" dir="ltr">@RoyalLionSun</a><a class="band-title" href="/" dir="ltr">Iran Censorship Monitor</a><img src="/brand/logo-128.webp" width="52" height="52" alt=""></header>
<main>
${body}
</main>
</body>
</html>
`;
}

// How a shutdown in the month unfolded, in Tehran time, as on the dashboard.
const ANATOMY_DAY_KINDS = new Set(['reach-day-after', 'routes-v6-missing', 'routes-v4-missing']);
function anatomySection(anatomy, tr, percent) {
  const t = tr.t;
  if (!anatomy || (!anatomy.onset?.length && !anatomy.restoration?.length)) return '';
  const tehran = (value, options) => new Intl.DateTimeFormat(tr.locale, { ...options, timeZone: 'Asia/Tehran' }).format(Date.parse(value));
  const day = (value) => tehran(value, { day: 'numeric', month: 'short', year: 'numeric' });
  const time = (value) => tehran(value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const layer = (kind) => ({ traffic: 'traffic', reach: 'reach' }[kind.split('-')[0]] ?? 'routes');
  const when = (event) => (event.kind === 'routes-v4-kept' ? t('board.anatomy.firstDay')
    : ANATOMY_DAY_KINDS.has(event.kind) ? day(event.to)
      : t('board.anatomy.when', { day: day(event.to), time: `\u2066${time(event.from)}–${time(event.to)}\u2069` }));
  const row = (event) => `<tr><td>${esc(when(event))}</td><td>${esc(t(`board.anatomy.${event.kind}`, { before: tr.number(event.before ?? 0), after: tr.number(event.after ?? 0), percent: percent(event.percent ?? 0) }))}<br><small>${esc(t(`board.anatomy.source.${layer(event.kind)}`))}</small></td></tr>`;
  const phase = (label, events) => (events?.length ? `<tr><th colspan="2" scope="rowgroup">${esc(label)}</th></tr>${events.map(row).join('')}` : '');
  const networks = anatomy.networks?.networks ?? [];
  // A network that kept access names its registrant as registered then, and the network's name then
  // when it differs.
  const isolate = (value) => `\u2066${value}\u2069`;
  const sameName = (a, b) => String(a ?? '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() === String(b ?? '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  const registrant = (entry) => (entry.registrantAsOf
    ? t('board.anatomy.networks.registrantAt', { asn: isolate(entry.asn), name: isolate(entry.registrant), date: tr.day(entry.registrantAsOf) })
      + (entry.registrantAsName && !sameName(entry.registrantAsName, entry.registrant) ? ` · ${t('board.anatomy.networks.asNameThen', { name: isolate(entry.registrantAsName) })}` : '')
    : t('board.anatomy.networks.registrant', { asn: isolate(entry.asn), name: isolate(entry.registrant) }));
  const name = (entry) => (entry.name ? `${entry.name} (${isolate(entry.asn)})`
    : entry.registrant ? registrant(entry)
    : t('board.anatomy.networks.private', { asn: isolate(entry.asn) }));
  const before = (entry) => (entry.before !== null ? percent(entry.before) : entry.beforeBelow !== null ? (entry.beforeBelow < 0.1 ? t('board.outage.belowTenth') : t('board.anatomy.networks.below', { value: percent(entry.beforeBelow) })) : '—');
  return `<section><h2>${esc(t('board.anatomy.title'))}</h2><p>${esc(t('board.anatomy.note'))}</p>
<div class="scroll"><table><tbody>${phase(t('board.anatomy.start'), anatomy.onset)}${phase(t('board.anatomy.end'), anatomy.restoration)}</tbody></table></div>
${networks.length ? `<h3>${esc(t('board.anatomy.networks.title'))}</h3><p>${esc(t('board.anatomy.networks.note', { from: tr.day(anatomy.networks.from), to: tr.day(new Date(Date.parse(anatomy.networks.to) - 1).toISOString()) }))}</p>
<div class="scroll"><table><thead><tr><th>${esc(t('board.anatomy.networks.network'))}</th><th>${esc(t('board.anatomy.networks.during'))}</th><th>${esc(t('board.anatomy.networks.before'))}</th></tr></thead><tbody>${networks.map((entry) => `<tr><th scope="row">${esc(name(entry))}</th><td>${esc(percent(entry.share))}</td><td>${esc(before(entry))}</td></tr>`).join('')}</tbody></table></div>${anatomy.networks.foreignLeftOut ? `<p>${esc(tr.plural('board.anatomy.networks.foreign', anatomy.networks.foreignLeftOut))}</p>` : ''}` : ''}</section>`;
}

export function renderMonthlyReport({ interpretation, history, outages = [], range, lang = 'en', dashboardUrl }) {
  const tr = translator(lang);
  const kind = range.week ? 'weekly' : 'monthly';
  const t = (key, vars) => (['monthly.title', 'monthly.inProgress', 'monthly.noData', 'monthly.open', 'monthly.outagesNone'].includes(key) ? tr.t(key.replace('monthly.', `${kind}.`), vars) : tr.t(key, vars));
  const services = interpretation?.services ?? {};
  const items = services.items ?? [];
  const title = `${t('monthly.title')}${tr.sep}${tr.day(range.since)} – ${tr.day(range.until)}`;
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
    const months = history?.services?.find((service) => service.id === id)?.months?.filter((entry) => entry.month <= range.until.slice(0, 7)) ?? [];
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
    return `<li><b>${esc(t(`board.more.group.${group.id}`))}</b>: ${esc(t('monthly.moreLine', { blocked: tr.number(blocked.length), total: tr.number(tested.length) }))}${blocked.length ? ` — ${esc(tr.join(blocked.map((service) => (lang === 'fa' && MORE_NAMES_FA.get(service.id)) || service.name)))}` : ''}</li>`;
  }).join('');
  const access = services.networkBreakdown?.access ?? [];
  const level = (name) => access.filter((entry) => entry.level === name).length;
  const monthStart = Date.parse(`${range.since}T00:00:00Z`);
  const monthEnd = Date.parse(`${range.until}T23:59:59Z`);
  const shutdowns = outages.filter((outage) => Date.parse(outage.start) <= monthEnd && (!outage.end || Date.parse(outage.end) >= monthStart));
  const vpn = services.vpnUse;
  const percent = (value) => t('board.outage.percent', { value: tr.number(value, value < 10 ? 1 : 0) });
  const body = `
<p class="kicker">${esc(t('monthly.title'))}${range.complete ? '' : `${tr.sep}${esc(t('monthly.inProgress'))}`}</p>
<h1>${esc(headline)}</h1>
<p class="scope">${esc(t('monthly.period', { from: tr.day(range.since), to: tr.day(range.until) }))}</p>
<p class="actions"><a class="button" href="${esc(dashboardUrl)}">${esc(t('monthly.open'))}</a> <button type="button" class="button" data-print>${esc(t('monthly.print'))}</button> <a class="button" href="/reports${lang === 'fa' ? '?lang=fa' : ''}">${esc(t('reports.index.title'))}</a></p>
<section><h2>${esc(t('monthly.services'))}</h2>
<div class="scroll"><table><thead><tr><th>${esc(t('report.service'))}</th><th>${esc(t('report.status'))}</th><th>${esc(t('monthly.colWebsite'))}</th><th>${esc(t('monthly.colApp'))}</th><th>${esc(t('monthly.colSince'))}</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section><h2>${esc(t('monthly.changes'))}</h2>${changeLines.map((line) => `<p>${esc(line)}</p>`).join('')}</section>
${more ? `<section><h2>${esc(t('board.more.title'))}</h2><ul>${more}</ul></section>` : ''}
${access.length ? `<section><h2>${esc(t('monthly.access'))}</h2><p>${esc(t('monthly.accessLine', { networks: tr.number(access.length), full: tr.number(level('full')), partial: tr.number(level('partial')), blocked: tr.number(level('blocked')) }))}</p></section>` : ''}
<section><h2>${esc(t('monthly.outages'))}</h2>${shutdowns.length ? `<ul>${shutdowns.map((outage) => `<li>${esc(tr.day(outage.start))} – ${esc(outage.end ? tr.day(outage.end) : t('monthly.ongoing'))}${outage.description ? `${tr.sep}${esc(outage.description)}` : ''}</li>`).join('')}</ul>` : `<p>${esc(t('monthly.outagesNone'))}</p>`}</section>
${anatomySection(interpretation?.dimensions?.connectivity?.outageAnatomy, tr, percent)}
${vpn?.current ? `<section><h2>${esc(t('monthly.vpn'))}</h2><p>${esc([t('board.vpnUse.line', { share: percent(vpn.current.share) }), vpn.yearAgo ? t('board.vpnUse.yearAgo', { share: percent(vpn.yearAgo.share) }) : ''].filter(Boolean).join(tr.sep))}</p></section>` : ''}
<footer><p>${esc(t('monthly.sources'))}</p><p>${esc(t('monthly.method'))}</p></footer>`;
  return page({ lang, title, body });
}

export function renderReportIndex({ lang = 'en', months, weeks = [], today }) {
  const tr = translator(lang);
  const t = tr.t;
  const fa = lang === 'fa' ? '&amp;lang=fa' : '';
  const list = (ranges, param, progress) => `<ul class="months">${ranges.filter(Boolean).map((range) => `<li><a href="/report?${param}=${range[param]}${fa}">${esc(tr.day(range.since))} – ${esc(tr.day(range.until))}</a>${range.complete ? '' : ` <span>${esc(t(progress))}</span>`}</li>`).join('')}</ul>`;
  const body = `
<p class="kicker">Iran Censorship Monitor</p>
<h1>${esc(t('reports.index.title'))}</h1>
<p class="scope">${esc(t('reports.index.note'))}</p>
<p class="actions"><a class="button" href="/reports${lang === 'fa' ? '' : '?lang=fa'}">${lang === 'fa' ? 'English' : 'فارسی'}</a> <a class="button" href="/updates${lang === 'fa' ? '?lang=fa' : ''}">${esc(t('updates.title'))}</a></p>
${weeks.length ? `<section id="weekly"><h2>${esc(t('weekly.index.title'))}</h2>${list(weeks.map((week) => weekRange(week, today)), 'week', 'weekly.inProgress')}</section>` : ''}
<section id="monthly"><h2>${esc(t('monthly.index.title'))}</h2>${list(months.map((month) => monthRange(month, today)), 'month', 'monthly.inProgress')}</section>`;
  return page({ lang, title: t('reports.index.title'), body });
}

// Daily updates as a readable page (the same entries as the feed), with how to follow them.
export function renderUpdatesPage({ lang = 'en', entries, feedUrl, telegramUrl = '' }) {
  const tr = translator(lang);
  const t = tr.t;
  const list = entries.length ? entries.map((entry) => `<article class="update"><p class="kicker">${esc(tr.day(entry.id))}</p><h2>${esc(entry.title)}</h2>${entry.lines.map((line) => `<p>${esc(line)}</p>`).join('')}<p><a href="${esc(entry.link)}">${esc(t('updates.open'))}</a></p></article>`).join('')
    : `<p>${esc(t('updates.none'))}</p>`;
  const body = `
<p class="kicker">Iran Censorship Monitor</p>
<h1>${esc(t('updates.title'))}</h1>
<p class="scope">${esc(t('updates.note'))}</p>
<p class="actions"><a class="button" href="/updates${lang === 'fa' ? '' : '?lang=fa'}">${lang === 'fa' ? 'English' : 'فارسی'}</a> <a class="button" href="/reports${lang === 'fa' ? '?lang=fa' : ''}">${esc(t('reports.index.title'))}</a></p>
${list}
<footer><h2>${esc(t('updates.follow'))}</h2><p>${esc(t('updates.feed'))} <a href="${esc(feedUrl)}" dir="ltr">${esc(feedUrl)}</a></p>${telegramUrl ? `<p>${esc(t('updates.telegram'))} <a href="${esc(telegramUrl)}" dir="ltr">${esc(telegramUrl)}</a></p>` : ''}<p>${esc(t('monthly.sources'))}</p></footer>`;
  return page({ lang, title: t('updates.title'), body });
}

// The source catalogue (/sources): every source with where it measures from, what the dashboard
// uses it for, whether it needs a key, and how it answered for the default view. The status
// comes from the default view the server keeps warm, so the page costs no extra requests.
const SOURCE_GROUPS = [
  ['access', ['ooni', 'ripe', 'globalping']],
  ['traffic', ['radar', 'ioda', 'mlab', 'apnic-ipv6']],
  ['usage', ['tor', 'psiphon']],
  ['routing', ['ripestat', 'bgpstream', 'asrank', 'peeringdb', 'ihr']],
  ['abroad', ['censored-planet']],
  ['reports', ['pulse', 'keepiton', 'citizenlab', 'gdelt']],
];
const SOURCE_FIELD = {
  ooni: 'ooni', ripe: 'ripe', globalping: 'globalping', radar: 'radar', ioda: 'ioda', mlab: 'mlab', 'apnic-ipv6': 'apnic',
  tor: 'tor', ripestat: 'ripestat', asrank: 'asrank', peeringdb: 'peeringdb', ihr: 'ihr', 'censored-planet': 'censoredPlanet', pulse: 'pulse',
};
const STATUS_KIND = { observed: 'answered', partial: 'partial', no_data: 'noData', stale: 'stale', token_required: 'token', scope_required: 'scope', error: 'error' };

export function renderSourcesPage({ lang = 'en', sources = [], overview = null }) {
  const tr = translator(lang);
  const t = tr.t;
  const byId = new Map(sources.map((source) => [source.id, source]));
  const time = (value) => new Intl.DateTimeFormat(tr.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(Date.parse(value));
  const status = (id) => {
    const field = SOURCE_FIELD[id];
    if (!field) return t('sources.page.status.separate');
    const answer = overview?.[field];
    if (!answer) return '—';
    const kind = answer.ok === false ? 'error' : STATUS_KIND[answer.status] ?? 'answered';
    const text = t(`sources.page.status.${kind}`);
    const when = answer.staleSince ?? answer.fetchedAt;
    return when ? `${text}${tr.sep}${time(when)} UTC` : text;
  };
  const role = (source) => { const key = `source.role.${source.id}`; const text = t(key); return text === key ? source.role : text; };
  const groups = SOURCE_GROUPS.map(([group, ids]) => {
    const rows = ids.map((id) => byId.get(id)).filter(Boolean).map((source) => `<tr><th scope="row"><a href="${esc(source.url)}" rel="noreferrer">${esc(source.name)}</a>${source.docs ? `<br><small><a href="${esc(source.docs)}" rel="noreferrer">${esc(t('sources.page.docs'))}</a></small>` : ''}</th><td>${esc(role(source))}</td><td>${esc(t(source.access === 'token' ? 'sources.page.key.yes' : 'sources.page.key.no'))}</td><td>${esc(status(source.id))}</td></tr>`).join('');
    return rows ? `<section><h2>${esc(t(`sources.page.group.${group}`))}</h2><p>${esc(t(`sources.page.group.${group}.note`))}</p>
<div class="scroll"><table><thead><tr><th>${esc(t('sources.page.col.source'))}</th><th>${esc(t('sources.page.col.what'))}</th><th>${esc(t('sources.page.col.key'))}</th><th>${esc(t('sources.page.col.status'))}</th></tr></thead><tbody>${rows}</tbody></table></div></section>` : '';
  }).join('');
  const view = overview?.input ? t('sources.page.view', { network: overview.input.asn ? (overview.asnProfile?.name ? `${overview.asnProfile.name} (\u2066${overview.input.asn}\u2069)` : overview.input.asn) : t('sources.page.allIran'), from: tr.day(overview.input.since), to: tr.day(overview.input.until) }) : t('sources.page.noView');
  const body = `
<p class="kicker">Iran Censorship Monitor</p>
<h1>${esc(t('sources.page.title'))}</h1>
<p class="scope">${esc(t('sources.page.intro'))}</p>
<p class="actions"><a class="button" href="/${lang === 'fa' ? '?lang=fa' : ''}">${esc(t('monthly.open.dashboard'))}</a> <a class="button" href="/sources${lang === 'fa' ? '' : '?lang=fa'}">${lang === 'fa' ? 'English' : 'فارسی'}</a></p>
<p>${esc(view)}</p>
${groups}
<footer><p>${esc(t('sources.page.footer'))}</p></footer>`;
  return page({ lang, title: t('sources.page.title'), body });
}

// Ways around the filter (/tools): the tools whose working OONI, Tor Metrics, Psiphon or APNIC
// measure from inside Iran, with platforms and the official download pages and channels (checked
// on the providers' own pages, 26 September 2026). It recommends nothing; it shows what got through.
const TOOLS = [
  { id: 'torbrowser', tests: ['tor', 'vanilla_tor'], sites: [['torproject', 'torproject.org'], ['torbridges', 'bridges.torproject.org']], usage: 'tor', platforms: 'desktopAndroid', official: 'https://www.torproject.org/download/', alt: 'gettor' },
  { id: 'snowflake', tests: ['torsf', 'stun'], usage: 'snowflake', platforms: 'inTor', official: 'https://snowflake.torproject.org/' },
  { id: 'psiphon', tests: ['psiphon'], sites: [['psiphon', 'psiphon.ca']], usage: 'conduit', platforms: 'psiphon', official: 'https://psiphon.ca/en/download.html', alt: 'psiphonMail' },
  { id: 'riseupvpn', tests: ['riseupvpn'], platforms: 'riseup', official: 'https://riseup.net/en/vpn' },
  { id: 'warp', usage: 'warp', platforms: 'all', official: 'https://one.one.one.one/' },
  { id: 'dns', dns: true, platforms: 'dns' },
];

export function renderToolsPage({ lang = 'en', interpretation = null, since = null, until = null }) {
  const tr = translator(lang);
  const t = tr.t;
  const services = interpretation?.services ?? null;
  const workaround = (id) => services?.workarounds?.find((item) => item.id === id);
  const site = (id) => services?.more?.flatMap((group) => group.services).find((service) => service.id === id);
  const numbers = (item) => (item.usable ? t(item.status === 'fails' ? 'board.workarounds.failed' : 'board.workarounds.worked', {
    count: tr.number(item.status === 'fails' ? item.failed : item.ok), total: tr.number(item.usable),
  }) : t('board.workarounds.none'));
  const status = (key) => `<b class="tool-status" data-status="${esc(key)}">${esc(t(`board.workarounds.status.${key}`))}</b>`;
  const measured = (tool) => {
    const lines = [];
    for (const id of tool.tests ?? []) {
      const item = workaround(id);
      if (item) lines.push(`${esc(t(`board.workarounds.tool.${id}`))}: ${status(item.status)} <small>${esc(numbers(item))}</small>`);
    }
    if (tool.dns) {
      for (const id of ['byName', 'byAddress']) {
        const group = services?.encryptedDns?.[id];
        if (group) lines.push(`${esc(t(`board.workarounds.tool.dns-${id}`))}: ${status(group.status)} <small>${esc(numbers({ status: group.status, usable: group.tested, ok: group.ok, failed: group.failed }))}</small>`);
      }
    }
    const tor = services?.torUse;
    if (tool.usage === 'tor' && tor?.date) lines.push(esc(t('tools.page.usage.tor', { date: tr.day(tor.date), direct: tr.number(tor.direct ?? 0), bridges: tr.number(tor.bridges ?? 0) })));
    const snowflake = tor?.transports?.find((item) => item.transport === 'snowflake');
    if (tool.usage === 'snowflake' && snowflake) lines.push(esc(t('tools.page.usage.snowflake', { date: tr.day(snowflake.date), users: tr.number(snowflake.users) })));
    const conduit = services?.conduit?.latest;
    if (tool.usage === 'conduit' && conduit) lines.push(esc(t('tools.page.usage.conduit', { date: tr.day(conduit.date), connections: tr.number(conduit.connections) })));
    const warp = services?.vpnUse?.current;
    if (tool.usage === 'warp' && warp) lines.push(esc(t('tools.page.usage.warp', { date: tr.day(warp.date), share: t('board.outage.percent', { value: tr.number(warp.share, warp.share < 10 ? 1 : 0) }) })));
    for (const [id, name] of tool.sites ?? []) {
      const entry = site(id);
      if (entry?.scope) lines.push(`${esc(t('tools.page.site', { name }))}: <b class="tool-status" data-status="${esc(entry.status)}">${esc(t(`board.more.status.${entry.status}`))}</b>`);
    }
    // Without the snapshot nothing is known yet; "not measured" would be wrong.
    if (!services) return '<li>—</li>';
    return lines.length ? lines.map((line) => `<li>${line}</li>`).join('') : `<li>${esc(t('tools.page.none'))}</li>`;
  };
  const rows = TOOLS.map((tool) => `<tr><th scope="row">${esc(t(`tools.page.name.${tool.id}`))}</th><td>${esc(t(`tools.page.platforms.${tool.platforms}`))}</td><td><ul class="plain">${measured(tool)}</ul></td><td>${tool.official ? `<a href="${esc(tool.official)}" rel="noreferrer" dir="ltr">${esc(new URL(tool.official).host)}</a>` : esc(t('tools.page.builtIn'))}${tool.alt ? `<br><small>${esc(t(`tools.page.alt.${tool.alt}`))}</small>` : ''}</td></tr>`).join('');
  const body = `
<p class="kicker">Iran Censorship Monitor</p>
<h1>${esc(t('tools.page.title'))}</h1>
<p class="scope">${esc(since && until ? t('tools.page.intro', { from: tr.day(since), to: tr.day(until) }) : t('tools.page.noData'))}</p>
<p class="actions"><a class="button" href="/${lang === 'fa' ? '?lang=fa' : ''}">${esc(t('monthly.open.dashboard'))}</a> <a class="button" href="/tools${lang === 'fa' ? '' : '?lang=fa'}">${lang === 'fa' ? 'English' : 'فارسی'}</a></p>
<section><div class="scroll"><table><thead><tr><th>${esc(t('tools.page.col.tool'))}</th><th>${esc(t('tools.page.col.platforms'))}</th><th>${esc(t('tools.page.col.measured'))}</th><th>${esc(t('tools.page.col.official'))}</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section><p>${esc(t('tools.page.notMeasured'))}</p></section>
<footer><p>${esc(t('tools.page.footer'))}</p></footer>`;
  return page({ lang, title: t('tools.page.title'), body });
}
