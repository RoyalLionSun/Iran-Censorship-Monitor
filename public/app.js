import './i18n.js';
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
