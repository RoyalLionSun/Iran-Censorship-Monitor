import './v11-context.js';
import './v13-context.js';
import './v14-context.js';
import './app-core.js';

// Production release marker.
const footerVersion = document.querySelector('#footer-version');
if (footerVersion) footerVersion.textContent = 'v1.4.0';
