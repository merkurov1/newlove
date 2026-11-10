import { build } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outfile = path.join(root, '.tmp-media-verify.cjs');

await build({
  entryPoints: [path.join(root, 'scripts/media-audit/verify-production.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  tsconfig: path.join(root, 'tsconfig.json'),
  external: ['pg', '@supabase/supabase-js'],
  logLevel: 'warning',
});

try {
  const require = createRequire(import.meta.url);
  require(outfile);
} finally {
  fs.rmSync(outfile, { force: true });
}
