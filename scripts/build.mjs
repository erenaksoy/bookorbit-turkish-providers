import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stub = join(root, 'scripts', 'unused-network-stub.mjs');
const PLUGINS = ['dr', 'kitapyurdu', 'pandora', 'nezih', 'dogankitap'];
const MAX_FILE_BYTES = 512 * 1024;
const MAX_UPLOAD_BYTES = 1024 * 1024;

const readme = await readFile(join(root, 'README.md'), 'utf8');

await rm(join(root, 'dist'), { recursive: true, force: true });
await mkdir(join(root, 'dist'), { recursive: true });

for (const type of PLUGINS) {
  const bundle = join(root, 'dist', type, 'index.mjs');
  await build({
    entryPoints: [join(root, 'src', type, 'index.ts')],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    minify: true,
    legalComments: 'none',
    alias: { undici: stub, 'encoding-sniffer': stub },
    loader: { '.png': 'dataurl' },
    logLevel: 'warning',
  });

  const size = (await stat(bundle)).size;
  if (size > MAX_FILE_BYTES) throw new Error(`${type}: index.mjs is ${size} bytes, over BookOrbit's ${MAX_FILE_BYTES} byte per-file limit`);

  const zipPath = join(root, 'dist', `${type}.zip`);
  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.file(bundle, { name: 'index.mjs' });
    archive.append(readme, { name: 'README.md' });
    archive.finalize();
  });

  const zipped = (await stat(zipPath)).size;
  if (zipped > MAX_UPLOAD_BYTES) throw new Error(`${type}: ${zipped} byte archive is over BookOrbit's ${MAX_UPLOAD_BYTES} byte upload limit`);
  console.log(`${type}.zip  index.mjs ${(size / 1024).toFixed(0)} KiB, archive ${(zipped / 1024).toFixed(0)} KiB`);
}
