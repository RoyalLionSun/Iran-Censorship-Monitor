import './v11-context.js';
import './v13-context.js';
import './app-core.js';

// Release marker. v1.3 adds topology/RPKI context without changing censorship assessment semantics.
const footerVersion = document.querySelector('#footer-version');
if (footerVersion) footerVersion.textContent = 'v1.3.0';
