import './v11-context.js';
import './app-core.js';

// Release marker. Keep the verified context/core modules unchanged.
const footerVersion = document.querySelector('#footer-version');
if (footerVersion) footerVersion.textContent = 'v1.2.0';
