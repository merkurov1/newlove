/** @jest-environment node */

import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const repoRoot = path.resolve(__dirname, '../../../../..');
const startScript = path.join(repoRoot, 'scripts/pierrot/dev-worker-start.sh');
const stopScript = path.join(repoRoot, 'scripts/pierrot/dev-worker-stop.sh');
const supervisorScript = path.join(repoRoot, 'scripts/pierrot/dev-worker-supervisor.sh');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(file: string, timeoutMs = 5_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = fs.readFileSync(file, 'utf8').trim();
      if (value) return value;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${file}`);
}

describe('Codespace worker startup', () => {
  let root: string;
  let workRoot: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pierrot-worker-start-'));
    workRoot = path.join(root, 'work');
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    const fakeNode = path.join(bin, 'node');
    fs.writeFileSync(
      fakeNode,
      [
        '#!/usr/bin/env bash',
        "trap 'exit 0' TERM INT",
        'if [ -n "${FAKE_NODE_PID_FILE:-}" ]; then printf "%s\\n" "$$" > "$FAKE_NODE_PID_FILE"; fi',
        'while true; do sleep 1; done',
        '',
      ].join('\n'),
      { mode: 0o755 }
    );
    env = {
      ...process.env,
      HOME: root,
      PATH: `${bin}:${process.env.PATH || ''}`,
      PIERROT_DEV_WORK_ROOT: workRoot,
      PIERROT_DEV_WORKER_TOKEN: 'x'.repeat(40),
      PIERROT_DEV_API_URL: 'http://127.0.0.1:9',
      FAKE_NODE_PID_FILE: path.join(root, 'fake-node.pid'),
    };
  });

  afterEach(async () => {
    try {
      execFileSync('bash', [stopScript], { env, timeout: 20_000 });
    } catch {}
    await sleep(500);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('serializes concurrent postStart and postAttach without duplicating the worker', async () => {
    const first = run('bash', [startScript], { env, timeout: 20_000 });
    const second = run('bash', [startScript], { env, timeout: 20_000 });
    const [one, two] = await Promise.all([first, second]);

    expect(one.stdout + two.stdout).toMatch(/supervisor (started|already running)/);
    const supervisorPid = await waitForFile(path.join(workRoot, 'supervisor.pid'));
    const workerPid = await waitForFile(path.join(workRoot, 'worker.pid'));
    expect(supervisorPid).toMatch(/^\d+$/);
    expect(workerPid).toMatch(/^\d+$/);

    // A later attach must not spawn a second pair.
    const third = await run('bash', [startScript], { env, timeout: 20_000 });
    expect(third.stdout).toMatch(/supervisor already running/);
    expect(fs.readFileSync(path.join(workRoot, 'supervisor.pid'), 'utf8').trim()).toBe(
      supervisorPid
    );
    expect(fs.readFileSync(path.join(workRoot, 'worker.pid'), 'utf8').trim()).toBe(workerPid);

    const bootLog = fs.readFileSync(path.join(workRoot, 'logs/worker-boot.log'), 'utf8');
    expect((bootLog.match(/supervisor started/g) || []).length).toBe(1);
  }, 30_000);

  it('removes stale PID files without signalling an unrelated process', async () => {
    fs.mkdirSync(workRoot, { recursive: true });
    fs.writeFileSync(path.join(workRoot, 'supervisor.pid'), '999999\n');
    fs.writeFileSync(path.join(workRoot, 'worker.pid'), '999998\n');

    const result = await run('bash', [startScript], { env, timeout: 20_000 });
    expect(result.stdout).toMatch(/stale (supervisor|worker) pid file/);
    expect(fs.existsSync(path.join(workRoot, 'supervisor.pid'))).toBe(true);
    expect(fs.existsSync(path.join(workRoot, 'worker.pid'))).toBe(true);
  }, 30_000);

  it('restarts transient worker failures with growing backoff instead of giving up', async () => {
    const bin = path.join(root, 'failing-bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'node'), '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 });
    fs.mkdirSync(workRoot, { recursive: true });

    const result = await run('bash', [supervisorScript], {
      env: {
        ...env,
        PATH: `${bin}:${process.env.PATH || ''}`,
        PIERROT_DEV_SUPERVISOR_MAX_RESTARTS: '2',
        PIERROT_DEV_SUPERVISOR_INITIAL_BACKOFF_SECONDS: '1',
      },
      timeout: 25_000,
    }).catch((error) => error as { code?: number; stdout?: string; stderr?: string });

    const output = `${result.stdout || ''}${result.stderr || ''}`;
    expect(output).toMatch(/SUPERVISOR_RESTARTING in 1s/);
    expect(output).toMatch(/SUPERVISOR_RESTARTING in 2s/);
    expect(output).toMatch(/SUPERVISOR_RESTART_LIMIT/);
    expect(result.code).toBe(1);
  }, 30_000);
});
