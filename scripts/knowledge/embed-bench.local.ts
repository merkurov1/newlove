import fs from 'node:fs/promises';

async function main() {
  const moduleName = '@huggingface/transformers';
  const transformers = await import(moduleName);
  transformers.env.allowLocalModels = false;
  const t0 = Date.now();
  const extractor = await transformers.pipeline('feature-extraction', 'Xenova/bge-m3', { dtype: 'q8', device: 'cpu' });
  console.log('load_ms', Date.now() - t0);
  const raw = await fs.readFile('/tmp/opencode/genome-full.txt', 'utf8');
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').filter((line) => line && !line.startsWith('#'));
  const texts = Array.from({ length: 8 }, (_, i) => lines.slice(i * 60, i * 60 + 60).join('\n'));
  const t1 = Date.now();
  for (const [i, text] of texts.entries()) {
    const out = await extractor([text], { pooling: 'cls', normalize: true });
    const dims = out.dims as number[];
    console.log('embed', i, 'ms', Date.now() - t1, 'dims', dims[dims.length - 1]);
    if (typeof (out as { dispose?: () => void }).dispose === 'function') (out as { dispose: () => void }).dispose();
  }
  console.log('total_ms', Date.now() - t1);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
