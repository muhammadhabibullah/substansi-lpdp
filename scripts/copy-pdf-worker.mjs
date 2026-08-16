/**
 * Copy the pdf.js worker into `public/` so PDF parsing runs off the main thread
 * in the static export.
 *
 * pdf.js needs its worker as a separately-served file. Bundling it through the
 * app entry does not work in a static export, so it is copied verbatim and
 * referenced via `withBasePath('/pdf.worker.min.mjs')` in `lib/documents.ts`.
 *
 * Runs automatically before `dev` and `build` (see package.json).
 */

import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

const WORKER_FILE = 'pdf.worker.min.mjs';

async function main() {
  // Resolve through the package so the path survives pnpm's symlinked store.
  const pdfjsEntry = require.resolve('pdfjs-dist/package.json');
  const source = join(dirname(pdfjsEntry), 'build', WORKER_FILE);
  const targetDir = join(process.cwd(), 'public');
  const target = join(targetDir, WORKER_FILE);

  await mkdir(targetDir, { recursive: true });
  await copyFile(source, target);
  console.log(`[copy-pdf-worker] ${source} → ${target}`);
}

main().catch((error) => {
  console.error('[copy-pdf-worker] failed:', error);
  process.exit(1);
});
