import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Renders a page in headless Chromium and returns its DOM. `--dump-dom` writes the page when the
// virtual time budget is spent; on a slow or busy machine (a shared CI runner) the page can still
// be loading then. Each attempt that is not `ready` is repeated with a larger budget, so a slow
// run takes longer instead of failing; a page that never becomes ready still fails the gate.
export async function dumpDom(browser, url, { ready = () => true, budgets = [6_000, 15_000, 30_000], timeoutMs = 60_000, maxBuffer = 8 * 1024 * 1024 } = {}) {
  let stdout = '';
  for (const budget of budgets) {
    ({ stdout } = await execFileAsync(browser, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--virtual-time-budget=${budget}`, '--dump-dom', url,
    ], { encoding: 'utf8', timeout: timeoutMs, maxBuffer }));
    if (ready(stdout)) break;
  }
  return stdout;
}
