import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Which commit this server runs, so that two builds with the same version number can be told
// apart: from BUILD.txt in a production bundle, otherwise from the git checkout. Null when neither
// says (e.g. an unpacked archive).
export async function readCommit(root) {
  const build = await readFile(join(root, 'BUILD.txt'), 'utf8').catch(() => '');
  const built = /^Commit: ([0-9a-f]{40})$/m.exec(build);
  if (built) return built[1];
  const head = (await readFile(join(root, '.git/HEAD'), 'utf8').catch(() => '')).trim();
  if (/^[0-9a-f]{40}$/.test(head)) return head;
  const ref = /^ref: (refs\/[\w./-]+)$/.exec(head)?.[1];
  if (!ref || ref.includes('..')) return null;
  const loose = (await readFile(join(root, '.git', ref), 'utf8').catch(() => '')).trim();
  if (/^[0-9a-f]{40}$/.test(loose)) return loose;
  const packed = await readFile(join(root, '.git/packed-refs'), 'utf8').catch(() => '');
  return packed.split('\n').map((line) => line.split(' ')).find(([sha, name]) => name === ref && /^[0-9a-f]{40}$/.test(sha))?.[0] ?? null;
}
