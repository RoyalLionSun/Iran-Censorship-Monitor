import { getLanguage, t } from './i18n.js';
import './v11-context.js';
import './v13-context.js';
import './v14-context.js';
import './v16-shutdown-context.js';
import './v17-asn-coverage.js';
import './v18-situation.js';
import './v19-runtime.js';
import './app-core.js';
import './v18-i18n-ui.js';
import './v20-report.js';

// Production release marker.
const footerVersion = document.querySelector('#footer-version');
if (footerVersion) footerVersion.textContent = 'v1.8.0';

// Offline copy of the last answers (sw.js): online the page always loads fresh.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Installing the page as an app (icon on the home screen, opens without browser bars). The
// button appears only where the browser offers it; Safari on iPhone gets a short guide.
{
  const button = document.querySelector('#install-button');
  const hint = document.querySelector('#install-hint');
  let prompt = null;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  const iPhone = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt = event;
    if (button) button.hidden = false;
  });
  window.addEventListener('appinstalled', () => { if (button) button.hidden = true; if (hint) hint.hidden = true; });
  if (button && iPhone && !standalone) button.hidden = false;
  button?.addEventListener('click', async () => {
    if (prompt) {
      prompt.prompt();
      await prompt.userChoice.catch(() => null);
      prompt = null;
      button.hidden = true;
    } else if (hint) {
      hint.textContent = t('ui.installIos');
      hint.hidden = !hint.hidden;
    }
  });
}

// Footer links lead to the daily updates and the weekly and monthly reports in the language
// being read.
function localizeFooterLinks() {
  const suffix = getLanguage() === 'fa' ? '?lang=fa' : '';
  const links = [
    ['#footer-daily', `/updates${suffix}`, 'ui.reports.daily'],
    ['#footer-weekly', `/reports${suffix}#weekly`, 'ui.reports.weekly'],
    ['#footer-monthly', `/reports${suffix}#monthly`, 'ui.reports.monthly'],
  ];
  for (const [selector, href, key] of links) {
    const link = document.querySelector(selector);
    if (link) { link.href = href; link.textContent = t(key); }
  }
  const label = document.querySelector('#footer-reports-label');
  if (label) label.textContent = t('ui.reports.label');
  document.querySelectorAll('.footer-sep').forEach((sep) => { sep.textContent = getLanguage() === 'fa' ? '، ' : ', '; });
}
localizeFooterLinks();
window.addEventListener('iran-monitor-languagechange', localizeFooterLinks);
