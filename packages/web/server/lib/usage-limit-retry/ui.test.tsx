// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { UsageLimitRetry } from '../../../../ui/src/components/chat/UsageLimitRetry';
import { usageLimitRetryI18n } from '@/lib/i18n/messages/usage-limit-retry.i18n';

const fetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/runtime-fetch', () => ({ runtimeFetch: fetch }));
vi.mock('@/lib/desktop', () => ({ isVSCodeRuntime: () => false }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ locale: 'en', t: (key: keyof typeof usageLimitRetryI18n.en, params?: { time: string }) => usageLimitRetryI18n.en[key].replace('{time}', params?.time ?? '') }) }));

afterEach(() => { vi.useRealTimers(); fetch.mockReset(); });
test('renders the scheduled reset and cancels without an older read restoring the schedule', async () => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const resetAt = Date.now() + 60_000;
  const schedule = { sessionId: 'ses_test', messageId: 'msg_test', directory: '/repo', resetAt, retryAt: resetAt + 1000, status: 'scheduled' };
  fetch.mockResolvedValue(new Response(JSON.stringify(schedule)));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<UsageLimitRetry body={JSON.stringify({ error: { type: 'usage_limit_reached', resets_at: resetAt / 1000 } })} observedAt={Date.now()} sessionId="ses_test" messageId="msg_test" />));
    expect(container.textContent).toContain('Usage resets at');
    expect(container.textContent).toContain('Retry scheduled for');
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]).toMatchObject(['/api/usage-limit-retry/ses_test/msg_test', { method: 'POST' }]);
    let finishRead: (value: Response) => void = () => {};
    fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { finishRead = resolve; }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await act(async () => { container.querySelector('button')?.click(); });
    expect(container.textContent).toContain('Automatic retry cancelled.');
    await act(async () => { finishRead(new Response(JSON.stringify(schedule))); });
    expect(container.textContent).toContain('Automatic retry cancelled.');
    expect(container.querySelector('button')).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

test('historical errors stop polling after three reads', async () => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fetch.mockImplementation(async () => new Response('null'));
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<UsageLimitRetry body='{"error":{"type":"usage_limit_reached"}}' observedAt={Date.now()} sessionId="ses_test" messageId="msg_old" />));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetch).toHaveBeenCalledTimes(3);
  } finally { await act(async () => root.unmount()); }
});
