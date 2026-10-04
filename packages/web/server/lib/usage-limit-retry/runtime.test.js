import fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUsageLimitRetryRuntime } from './runtime.js';
import { parseUsageLimitError, usageLimitRetryAt } from './policy.js';

const now = 1_791_000_000_000;
const body = (extra = {}) => JSON.stringify({ error: { type: 'usage_limit_reached', ...extra } });
const failure = (extra = {}, messageId = 'msg_failure') => ({ directory: '/project', payload: {
  type: 'session.step.failed', created: now,
  data: { sessionID: 'ses_test', assistantMessageID: messageId, error: { response: { body: body(extra) } } },
} });

describe('usage-limit policy', () => {
  it('uses only exhausted Codex windows', () => {
    const value = JSON.stringify({ error: { type: 'usage_limit_reached', resets_at: (now + 60_000) / 1000 }, headers: {
      'X-Codex-Primary-Used-Percent': '100', 'X-Codex-Primary-Reset-At': (now + 61_000) / 1000,
      'X-Codex-Secondary-Used-Percent': '47', 'X-Codex-Secondary-Reset-At': (now + 7 * 86400_000) / 1000,
    } });
    expect(parseUsageLimitError(value, now)).toEqual({ resetAt: now + 61_000 });
  });
  it('handles unknown, relative, malformed and unrelated errors', () => {
    expect(parseUsageLimitError(body(), now)).toEqual({ resetAt: null });
    expect(parseUsageLimitError(body({ resets_in_seconds: 50 }), now)).toEqual({ resetAt: now + 50_000 });
    expect(parseUsageLimitError('{', now)).toBeNull();
    expect(parseUsageLimitError('{"error":{"type":"rate_limit_error"}}', now)).toBeNull();
    expect(parseUsageLimitError(body({ resets_at: null }), now)).toEqual({ resetAt: null });
  });
  it('allows exactly ten hours and backs off unknown or past resets', () => {
    expect(usageLimitRetryAt(now + 36_000_000, now)).toBe(now + 36_001_000);
    expect(usageLimitRetryAt(now + 36_000_001, now)).toBeNull();
    expect(usageLimitRetryAt(null, now)).toBe(now + 1800_000);
    expect(usageLimitRetryAt(now - 1, now)).toBe(now + 1800_000);
  });
});

describe('usage-limit scheduler', () => {
  let directory;
  let runtime;
  let api;
  let receive;
  const make = () => createUsageLimitRetryRuntime({ dataDir: directory,
    globalEventHub: { subscribeEvent: (listener) => { receive = listener; return () => {}; } },
    createClient: () => api, logger: { warn: vi.fn() },
  });
  beforeEach(async () => {
    directory = await fs.mkdtemp('/tmp/opencode/usage-limit-retry-');
    vi.useFakeTimers(); vi.setSystemTime(now);
    api = { session: {
      get: vi.fn().mockResolvedValue({ time: {}, location: { directory: '/project' }, outcome: 'failed' }), active: vi.fn().mockResolvedValue({}),
      context: vi.fn().mockResolvedValue([{ id: 'msg_failure', error: { response: { body: body() } }, time: { completed: now } }]),
      synthetic: vi.fn().mockResolvedValue({}),
    } };
    runtime = make(); await runtime.start();
  });
  afterEach(async () => { await runtime.stop(); vi.useRealTimers(); await fs.rm(directory, { recursive: true, force: true }); });
  const drain = async () => { await vi.waitFor(() => expect(runtime.get('ses_test')).toBeNull()); };
  it('recovers a missed failure and retries promptly after its reset', async () => {
    api.session.context.mockResolvedValue([{ id: 'msg_failure', error: { response: { body: body({ resets_at: (now - 300_000) / 1000 }) } }, time: { completed: now - 600_000 } }]);
    const entry = await runtime.recover('ses_test', 'msg_failure');
    expect(entry).toMatchObject({ directory: '/project', status: 'scheduled', retryAt: now + 1000 });
    await vi.advanceTimersByTimeAsync(1000); await drain();
    expect(api.session.synthetic).toHaveBeenCalledOnce();
  });
  it('does not recover historical errors, active work or interrupted tasks', async () => {
    expect(await runtime.recover('ses_test', 'msg_old')).toBeNull();
    api.session.active.mockResolvedValue({ ses_test: { type: 'running' } });
    expect(await runtime.recover('ses_test', 'msg_failure')).toBeNull();
    api.session.active.mockResolvedValue({});
    api.session.get.mockResolvedValue({ time: {}, location: { directory: '/project' }, outcome: 'interrupted' });
    expect(await runtime.recover('ses_test', 'msg_failure')).toBeNull();
    expect(api.session.synthetic).not.toHaveBeenCalled();
  });
  it('does not resurrect cancellation or recover after a newer live event', async () => {
    await runtime.processEvent(failure());
    await runtime.cancel('ses_test', 'msg_failure');
    expect((await runtime.recover('ses_test', 'msg_failure')).status).toBe('cancelled');
    await runtime.processEvent({ payload: { type: 'session.execution.started', data: { sessionID: 'ses_test' } } });
    let resolve;
    api.session.get.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const recovering = runtime.recover('ses_test', 'msg_failure');
    await runtime.processEvent({ payload: { type: 'session.execution.started', data: { sessionID: 'ses_test' } } });
    resolve({ time: {}, location: { directory: '/project' }, outcome: 'failed' });
    expect(await recovering).toBeNull();
    expect(runtime.get('ses_test')).toBeNull();
  });
  it('keeps recovery read failures distinct from empty schedules', async () => {
    api.session.context.mockRejectedValueOnce(new Error('offline'));
    await expect(runtime.recover('ses_test', 'msg_failure')).rejects.toThrow('offline');
    expect((await runtime.recover('ses_test', 'msg_failure')).status).toBe('scheduled');
  });
  it('recovers future resets but preserves the ten-hour cutoff', async () => {
    api.session.context.mockResolvedValue([{ id: 'msg_failure', error: { response: { body: body({ resets_at: (now + 60_000) / 1000 }) } }, time: { completed: now } }]);
    expect((await runtime.recover('ses_test', 'msg_failure')).retryAt).toBe(now + 61_000);
    await runtime.processEvent({ payload: { type: 'session.execution.started', data: { sessionID: 'ses_test' } } });
    api.session.context.mockResolvedValue([{ id: 'msg_failure', error: { response: { body: body({ resets_at: (now + 36_001_000) / 1000 }) } }, time: { completed: now } }]);
    expect(await runtime.recover('ses_test', 'msg_failure')).toMatchObject({ status: 'skipped', retryAt: null });
  });
  it('persists and retries a synthetic continuation once', async () => {
    await runtime.processEvent(failure({ resets_at: (now + 1000) / 1000 }));
    expect(runtime.get('ses_test').retryAt).toBe(now + 2000);
    await runtime.stop(); runtime = make(); await runtime.start();
    await vi.advanceTimersByTimeAsync(2000); await drain();
    expect(api.session.synthetic).toHaveBeenCalledOnce();
    expect(api.session.synthetic.mock.calls[0][0]).toMatchObject({ sessionID: 'ses_test', resume: true, id: 'msg_retry_msg_failure' });
  });
  it('cancels durably and deduplicates failures after restart', async () => {
    await runtime.processEvent(failure());
    await runtime.cancel('ses_test', 'wrong-message');
    expect(runtime.get('ses_test').status).toBe('scheduled');
    await runtime.cancel('ses_test', 'msg_failure');
    await runtime.stop(); runtime = make(); await runtime.start();
    await runtime.processEvent(failure());
    expect(runtime.get('ses_test').status).toBe('cancelled');
    await vi.advanceTimersByTimeAsync(3600_000);
    expect(api.session.synthetic).not.toHaveBeenCalled();
  });
  it('does not schedule distant resets', async () => {
    await runtime.processEvent(failure({ resets_at: (now + 36_001_000) / 1000 }));
    expect(runtime.get('ses_test').status).toBe('skipped');
    expect(api.session.synthetic).not.toHaveBeenCalled();
  });
  it('rejects a tick whose reads finish after cancellation', async () => {
    let resolve;
    api.session.get.mockImplementation(() => new Promise((done) => { resolve = done; }));
    await runtime.processEvent(failure({ resets_at: (now + 1000) / 1000 }));
    await vi.advanceTimersByTimeAsync(2000);
    await runtime.cancel('ses_test', 'msg_failure');
    resolve({ time: {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.session.synthetic).not.toHaveBeenCalled();
    await runtime.processEvent({ payload: { type: 'session.execution.started', data: { sessionID: 'ses_test' } } });
    expect(runtime.get('ses_test')).toBeNull();
  });
  it('does not resume newer work after a missed event', async () => {
    api.session.context.mockResolvedValue([{ id: 'msg_newer' }]);
    await runtime.processEvent(failure({ resets_at: (now + 1000) / 1000 }));
    await vi.advanceTimersByTimeAsync(2000); await drain();
    expect(api.session.synthetic).not.toHaveBeenCalled();
  });
  it('preserves schedules and backs off when authoritative reads fail', async () => {
    api.session.active.mockRejectedValue(new Error('offline'));
    await runtime.processEvent(failure({ resets_at: (now + 1000) / 1000 }));
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(runtime.get('ses_test').retryAt).toBe(now + 2000 + 1800_000));
    expect(api.session.synthetic).not.toHaveBeenCalled();
  });
  it('reports malformed persistence without overwriting it', async () => {
    await runtime.stop();
    await fs.writeFile(`${directory}/usage-limit-retries.json`, 'broken');
    runtime = make();
    await expect(runtime.start()).rejects.toThrow();
    expect(() => runtime.get('ses_test')).toThrow('unavailable');
    expect(await fs.readFile(`${directory}/usage-limit-retries.json`, 'utf8')).toBe('broken');
  });
  it('subscribes to raw events', async () => {
    receive(failure());
    await vi.waitFor(() => expect(runtime.get('ses_test')?.status).toBe('scheduled'));
  });
  it('does not schedule a queued failure after newer work arrives', async () => {
    const pending = runtime.processEvent(failure());
    await runtime.processEvent({ payload: { type: 'session.execution.started', data: { sessionID: 'ses_test' } } });
    await pending;
    expect(runtime.get('ses_test')).toBeNull();
  });
  it('keeps shutdown schedules but clears successful executions', async () => {
    await runtime.processEvent(failure());
    await runtime.processEvent({ payload: { type: 'session.execution.interrupted', data: { sessionID: 'ses_test', reason: 'shutdown' } } });
    expect(runtime.get('ses_test').status).toBe('scheduled');
    await runtime.processEvent({ payload: { type: 'session.execution.succeeded', data: { sessionID: 'ses_test' } } });
    expect(runtime.get('ses_test')).toBeNull();
  });
  it('rolls back a failed cancellation write without losing the retry', async () => {
    await runtime.processEvent(failure({ resets_at: (now + 1000) / 1000 }));
    const write = vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('disk full'));
    try { await expect(runtime.cancel('ses_test', 'msg_failure')).rejects.toThrow('disk full'); }
    finally { write.mockRestore(); }
    expect(runtime.get('ses_test').status).toBe('scheduled');
    await vi.advanceTimersByTimeAsync(2000); await drain();
    expect(api.session.synthetic).toHaveBeenCalledOnce();
  });
});
