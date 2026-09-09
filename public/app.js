import './v11-context.js';
import './v13-context.js';
import './v14-context.js';
import './app-core.js';

// Production release marker remains v1.3.0 while v1.4 context work is developed on develop/v1.4.
const footerVersion = document.querySelector('#footer-version');
if (footerVersion) footerVersion.textContent = 'v1.3.0';
