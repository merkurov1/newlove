import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoundedCapture, runProcess } from '../dev-worker-process.mjs';

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('captures stdout, stderr and the exit code', async () => {
  const result = await runProcess(process.execPath, [
    '-e',
    'process.stdout.write("out"); process.stderr.write("err"); process.exit(3);',
  ]);

  assert.equal(result.code, 3);
  assert.equal(result.stdout, 'out');
  assert.match(result.stderr, /err/);
  assert.equal(result.timedOut, false);
  assert.equal(result.cancelled, false);
});

test('keeps only the bounded tail so the final report survives', async () => {
  const result = await runProcess(process.execPath, [
    '-e',
    'process.stdout.write("A".repeat(5000)); process.stdout.write("FINAL_REPORT");',
  ], { maxCaptureBytes: 1024 });

  assert.equal(result.truncated, true);
  assert.ok(result.stdout.endsWith('FINAL_REPORT'));
  assert.ok(result.stdout.length <= 1024);
});

test('times out and kills a child that ignores SIGTERM', async () => {
  const started = Date.now();
  const result = await runProcess(process.execPath, [
    '-e',
    'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);',
  ], { timeoutMs: 300, killGraceMs: 300, closeGraceMs: 300 });

  assert.equal(result.timedOut, true);
  assert.equal(result.code, -1);
  assert.ok(Date.now() - started < 5000);
  assert.equal(alive(result.pid), false);
});

test('settles even when a grandchild keeps the stdio pipes open', async () => {
  const script = [
    'const { spawn } = require("node:child_process");',
    'spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: ["ignore", 1, 2] });',
    'setTimeout(() => process.exit(0), 50);',
  ].join('\n');

  const started = Date.now();
  const result = await runProcess(process.execPath, ['-e', script], {
    timeoutMs: 5000,
    killGraceMs: 300,
    closeGraceMs: 300,
  });

  assert.equal(result.code, 0);
  assert.ok(Date.now() - started < 3000);
});

test('heartbeat cancellation stops the child and reports cancellation', async () => {
  const started = Date.now();
  const result = await runProcess(process.execPath, [
    '-e',
    'setInterval(() => {}, 1000);',
  ], {
    heartbeatMs: 100,
    onHeartbeat: () => true,
    timeoutMs: 5000,
    killGraceMs: 300,
    closeGraceMs: 300,
  });

  assert.equal(result.cancelled, true);
  assert.ok(Date.now() - started < 3000);
});

test('bounded capture is independent per stream', () => {
  const capture = createBoundedCapture(1024);
  capture.append('x'.repeat(2048));
  capture.append('tail');
  assert.equal(capture.truncated, true);
  assert.ok(capture.text.endsWith('tail'));
  assert.ok(capture.text.length <= 1024);
});
