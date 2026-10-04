import React from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { isVSCodeRuntime } from '@/lib/desktop';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { parseUsageLimitError } from '../../../../web/server/lib/usage-limit-retry/policy.js';

const scheduleSchema = z.object({
  sessionId: z.string(), messageId: z.string(), directory: z.string(),
  resetAt: z.number().finite().nullable(), retryAt: z.number().finite().nullable(),
  status: z.enum(['scheduled', 'cancelled', 'skipped']),
}).nullable();
type Schedule = z.infer<typeof scheduleSchema>;

export function UsageLimitRetry({ body, sessionId, messageId, observedAt }: {
  body: string; sessionId: string; messageId: string; observedAt: number;
}) {
  const { t, locale } = useI18n();
  const limit = React.useMemo(() => parseUsageLimitError(body, observedAt), [body, observedAt]);
  const [schedule, setSchedule] = React.useState<Schedule>(null);
  const [failed, setFailed] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const revision = React.useRef(0);
  const scope = React.useRef(0);
  const unsupported = isVSCodeRuntime();
  React.useEffect(() => {
    scope.current += 1;
    setSchedule(null);
    setFailed(false);
    setCancelling(false);
    if (!limit || unsupported) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    let recover = true;
    const load = async () => {
      const startedRevision = revision.current;
      try {
        const restoring = recover;
        recover = false;
        const response = await runtimeFetch(`/api/usage-limit-retry/${encodeURIComponent(sessionId)}${restoring ? `/${encodeURIComponent(messageId)}` : ''}`, {
          method: restoring ? 'POST' : 'GET', signal: controller.signal,
        });
        if (!response.ok) throw new Error('Retry status unavailable');
        const next = scheduleSchema.parse(await response.json());
        if (controller.signal.aborted || startedRevision !== revision.current) return;
        const matching = next?.messageId === messageId ? next : null;
        setSchedule(matching);
        setFailed(false);
        // Only the scheduled error keeps polling. Historical errors stop after
        // a brief allowance for the server to persist the live failure event.
        if (matching?.status === 'scheduled' || (!matching && ++attempts < 3)) {
          timer = setTimeout(() => { void load(); }, matching ? 30_000 : 2_000);
        }
      } catch {
        if (!controller.signal.aborted && startedRevision === revision.current) setFailed(true);
      }
    };
    void load();
    return () => { scope.current += 1; controller.abort(); clearTimeout(timer); };
  }, [limit, messageId, sessionId, unsupported]);
  if (!limit) return null;
  const date = (at: number) => new Date(at).toLocaleString(locale);
  const cancel = async () => {
    const startedScope = scope.current;
    setCancelling(true);
    try {
      const response = await runtimeFetch(`/api/usage-limit-retry/${encodeURIComponent(sessionId)}/${encodeURIComponent(messageId)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Retry cancellation failed');
      if (startedScope !== scope.current) return;
      revision.current += 1;
      setSchedule((current) => current ? { ...current, status: 'cancelled', retryAt: null } : null);
      setFailed(false);
    } catch { if (startedScope === scope.current) setFailed(true); }
    finally { if (startedScope === scope.current) setCancelling(false); }
  };
  return <div className="mt-2 space-y-1 pl-7 text-sm">
    {limit.resetAt !== null && <p>{t('chat.usageLimit.reset', { time: date(limit.resetAt) })}</p>}
    {unsupported && <p>{t('chat.usageLimit.unsupported')}</p>}
    {schedule?.status === 'skipped' && <p>{t('chat.usageLimit.skipped')}</p>}
    {schedule?.status === 'cancelled' && <p>{t('chat.usageLimit.cancelled')}</p>}
    {schedule?.status === 'scheduled' && schedule.retryAt !== null && <div className="flex flex-wrap items-center gap-2">
      <span>{t(limit.resetAt === null ? 'chat.usageLimit.retryUnknown' : 'chat.usageLimit.retry', { time: date(schedule.retryAt) })}</span>
      <Button variant="outline" size="xs" disabled={cancelling} onClick={() => { void cancel(); }}>{t('chat.usageLimit.cancel')}</Button>
    </div>}
    {failed && <p role="status">{t('chat.usageLimit.failed')}</p>}
  </div>;
}
