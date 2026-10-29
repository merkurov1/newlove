import { existsSync } from 'node:fs';
import path from 'node:path';

import type { C4SemanticAvailability } from './types';

const LOCAL_MODEL_PATH =
  '/home/vscode/.vscode-remote/extensions/continue.continue-2.0.0-linux-x64/models/all-MiniLM-L6-v2';

const RUNTIME_PACKAGES = [
  '@xenova/transformers',
  '@huggingface/transformers',
  'onnxruntime-node',
  'onnxruntime-web',
];

function packageExists(packageName: string): boolean {
  return existsSync(path.join(process.cwd(), 'node_modules', packageName));
}

export function detectC4SemanticAvailability(): C4SemanticAvailability {
  const modelExists = existsSync(LOCAL_MODEL_PATH);
  const runtime = RUNTIME_PACKAGES.find((packageName) => packageExists(packageName));
  const blockerParts: string[] = [];

  if (!runtime) {
    blockerParts.push(
      'no local ONNX/embedding runtime package is installed (onnxruntime-node, onnxruntime-web, or Transformers.js)',
    );
  }

  if (!modelExists) {
    blockerParts.push('no local embedding model directory was found');
  } else {
    blockerParts.push(
      'the only local model candidate is all-MiniLM-L6-v2 (English-only; not a multilingual model)',
    );
  }

  return {
    available: false,
    runtime: { package: runtime ?? 'none', available: Boolean(runtime) },
    model: {
      path: LOCAL_MODEL_PATH,
      exists: modelExists,
      name: 'all-MiniLM-L6-v2',
      dimensions: 384,
      multilingual: false,
      localOnly: true,
    },
    blocker: blockerParts.join('; '),
  };
}
