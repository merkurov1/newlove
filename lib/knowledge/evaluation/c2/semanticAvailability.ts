import { existsSync } from 'node:fs';
import path from 'node:path';

import type { C2SemanticAvailability } from './types';

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

/**
 * Read-only capability probe. It never downloads a model or contacts a
 * network service. Absence of a runtime or multilingual model is a blocker,
 * not an invitation to install something silently.
 */
export function detectSemanticAvailability(): C2SemanticAvailability {
  const modelExists = existsSync(LOCAL_MODEL_PATH);
  const runtime = RUNTIME_PACKAGES.find((packageName) => packageExists(packageName));
  const runtimeAvailable = Boolean(runtime);
  const blockerParts: string[] = [];

  if (!runtimeAvailable) {
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
    runtime: {
      package: runtime ?? 'none',
      available: runtimeAvailable,
    },
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
