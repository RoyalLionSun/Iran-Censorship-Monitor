// Monthly report page: the "Save as PDF" button opens the browser's print dialog.
document.querySelector('[data-print]')?.addEventListener('click', () => window.print());
