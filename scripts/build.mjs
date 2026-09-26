import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, 'public'), join(dist, 'public'), { recursive: true });
await cp(join(root, 'lib'), join(dist, 'lib'), { recursive: true });
await cp(join(root, 'data'), join(dist, 'data'), { recursive: true });
await cp(join(root, 'scripts'), join(dist, 'scripts'), { recursive: true });
await cp(join(root, 'server.mjs'), join(dist, 'server.mjs'));
await cp(join(root, 'package.json'), join(dist, 'package.json'));
await cp(join(root, 'package-lock.json'), join(dist, 'package-lock.json'));
await cp(join(root, '.env.example'), join(dist, '.env.example'));
for (const file of ['README.md', 'SECURITY.md', 'GO_LIVE.md', 'docs/PRODUCTION.md', 'docs/DATA_SOURCES.md', 'docs/VERIFICATION.md', 'docs/API.md']) {
  await mkdir(join(dist, file, '..'), { recursive: true });
  await cp(join(root, file), join(dist, file));
}
await writeFile(join(dist, 'BUILD.txt'), `Built ${new Date().toISOString()}\nRuntime: Node.js >=20.11\n`);
console.log(`Production bundle created at ${dist}`);
