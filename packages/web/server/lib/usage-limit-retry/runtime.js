import fs from 'node:fs/promises';
import path from 'node:path';
import { OpenCode } from '@opencode/client';
import { z } from 'zod';
import { parseUsageLimitError, usageLimitRetryAt } from './policy.js';

const entrySchema = z.object({
  sessionId: z.string().min(1), messageId: z.string().min(1), directory: z.string(),
  resetAt: z.number().finite().nonnegative().nullable(), retryAt: z.number().finite().nonnegative().nullable(),
  status: z.enum(['scheduled', 'cancelled', 'skipped']),
}).refine((entry) => entry.status === 'scheduled' ? entry.retryAt !== null : entry.retryAt === null);
const fileSchema = z.object({ version: z.literal(1), entries: z.array(entrySchema).max(1000) });

export function createUsageLimitRetryRuntime({ dataDir, globalEventHub, buildOpenCodeUrl, getOpenCodeAuthHeaders,
  isSessionArchived = () => false, createClient, now = Date.now, logger = console }) {
  const file = path.join(dataDir, 'usage-limit-retries.json');
  const entries = new Map();
  const timers = new Map();
  const pendingFailures = new Map();
  let stopped = false;
  let ready = false;
  let unsubscribe;
  let writes = Promise.resolve();
  let mutations = Promise.resolve();
  const client = createClient ?? ((directory) => {
    const headers = { ...getOpenCodeAuthHeaders() };
    if (directory) headers['x-opencode-directory'] = encodeURIComponent(directory);
    return OpenCode.make({ baseUrl: buildOpenCodeUrl('/', '').replace(/\/$/, ''), headers });
  });
  const persist = () => {
    const body = JSON.stringify({ version: 1, entries: [...entries.values()] });
    const write = writes.catch(() => {}).then(async () => {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(`${file}.tmp`, body);
      await fs.rename(`${file}.tmp`, file);
    });
    writes = write;
    return write;
  };
  const clearTimer = (id) => { clearTimeout(timers.get(id)); timers.delete(id); };
  const mutate = (operation) => {
    const result = mutations.catch(() => {}).then(operation);
    mutations = result;
    return result;
  };
  const replace = async (id, entry) => {
    const previous = entries.get(id);
    if (entry) entries.set(id, entry); else entries.delete(id);
    try { await persist(); } catch (error) {
      if (entries.get(id) === (entry ?? undefined)) {
        if (previous) entries.set(id, previous); else entries.delete(id);
        if (previous?.status === 'scheduled') arm(previous);
      }
      throw error;
    }
    clearTimer(id);
    if (entry?.status === 'scheduled' && entries.get(id) === entry) arm(entry);
  };
  const arm = (entry) => {
    if (stopped) return;
    clearTimer(entry.sessionId);
    const timer = setTimeout(() => {
      timers.delete(entry.sessionId);
      void tick(entry).catch((error) => {
        logger.warn('[usage-limit-retry] could not retry:', error.message);
        void mutate(async () => {
          if (entries.get(entry.sessionId) === entry && !stopped) {
            await replace(entry.sessionId, error._tag === 'SessionNotFoundError' || error.status === 404
              ? null : { ...entry, retryAt: now() + 30 * 60 * 1000 });
          }
        }).catch((failure) => logger.warn('[usage-limit-retry] could not save retry:', failure.message));
      });
    }, Math.max(0, entry.retryAt - now()));
    timer.unref?.();
    timers.set(entry.sessionId, timer);
  };
  const tick = async (entry) => {
    const api = client(entry.directory);
    const session = await api.session.get({ sessionID: entry.sessionId });
    const active = await api.session.active();
    const latest = await api.message.list({ sessionID: entry.sessionId, limit: 1, order: 'desc' });
    const last = latest.data[0];
    if (stopped || entries.get(entry.sessionId) !== entry) return;
    if (active[entry.sessionId] || isSessionArchived(entry.sessionId) || session.time?.archived || session.revert
      || last?.id !== entry.messageId || !parseUsageLimitError(last.error?.response?.body, last.time?.completed ?? now())) {
      await mutate(() => entries.get(entry.sessionId) === entry ? replace(entry.sessionId, null) : undefined);
      return;
    }
    // Do not resend the user's prompt or attachments. A synthetic continuation
    // resumes the existing task; its stable id makes an ambiguous HTTP retry safe.
    await api.session.synthetic({ sessionID: entry.sessionId,
      id: `msg_retry_${entry.messageId}`,
      text: 'The provider usage limit interrupted this task. Continue from where you stopped without repeating completed work.',
      resume: true,
    });
    await mutate(() => entries.get(entry.sessionId) === entry ? replace(entry.sessionId, null) : undefined);
  };
  const processEvent = (event) => {
    const payload = event?.payload;
    const data = payload?.data;
    const id = data?.sessionID;
    if (typeof id !== 'string' || !id || stopped) return Promise.resolve();
    if (payload.type === 'session.step.failed') {
      const messageId = data.assistantMessageID;
      const limit = parseUsageLimitError(data.error?.response?.body, payload.created ?? now());
      if (!limit || typeof messageId !== 'string' || !messageId) return Promise.resolve();
      const pending = {};
      pendingFailures.set(id, pending);
      return mutate(async () => {
        if (pendingFailures.get(id) !== pending) return;
        pendingFailures.delete(id);
        if (stopped || entries.get(id)?.messageId === messageId || isSessionArchived(id)) return;
        if (!entries.has(id) && entries.size >= 1000) throw new Error('Retry schedule capacity reached');
        const retryAt = usageLimitRetryAt(limit.resetAt, now());
        await replace(id, { sessionId: id, messageId, directory: event.directory === 'global' ? '' : event.directory ?? '',
          resetAt: limit.resetAt, retryAt, status: retryAt === null ? 'skipped' : 'scheduled' });
      });
    }
    if (['session.execution.started', 'session.execution.succeeded', 'session.execution.interrupted', 'session.deleted', 'session.moved', 'session.inbox.enqueued'].includes(payload.type)) {
      if (payload.type === 'session.execution.interrupted' && data.reason === 'shutdown') return Promise.resolve();
      // Invalidate synchronously so a cancellation/new turn overtakes a tick's reads.
      pendingFailures.delete(id);
      clearTimer(id);
      const entry = entries.get(id);
      if (!entry) return Promise.resolve();
      entries.delete(id);
      return mutate(() => persist());
    }
    return Promise.resolve();
  };
  const start = async () => {
    try {
      const stored = fileSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
      for (const entry of stored.entries) entries.set(entry.sessionId, entry);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (stopped) return;
    ready = true;
    for (const entry of entries.values()) if (entry.status === 'scheduled') arm(entry);
    unsubscribe = globalEventHub.subscribeEvent((event) => { void processEvent(event).catch((error) => logger.warn('[usage-limit-retry]', error.message)); });
  };
  const cancel = (id, messageId) => mutate(async () => {
    const entry = entries.get(id);
    if (!entry || entry.messageId !== messageId || entry.status !== 'scheduled') return;
    await replace(id, { ...entry, status: 'cancelled', retryAt: null });
  });
  const recover = async (id, messageId) => {
    if (!ready) throw new Error('Retry schedules unavailable');
    if (entries.has(id) || pendingFailures.has(id) || stopped) return entries.get(id) ?? null;
    const pending = {};
    pendingFailures.set(id, pending);
    try {
      const api = client('');
      const session = await api.session.get({ sessionID: id });
      const active = await api.session.active();
      const latest = await api.message.list({ sessionID: id, limit: 1, order: 'desc' });
      const last = latest.data[0];
      const observedAt = last?.time?.completed ?? last?.time?.created;
      const limit = parseUsageLimitError(last?.error?.response?.body, observedAt ?? now());
      if (active[id] || isSessionArchived(id) || session.time?.archived || session.revert
        || session.outcome === 'interrupted' || session.outcome === 'succeeded'
        || last?.id !== messageId || !limit) return null;
      await mutate(async () => {
        if (stopped || entries.has(id) || pendingFailures.get(id) !== pending) return;
        if (entries.size >= 1000) throw new Error('Retry schedule capacity reached');
        // A missed failure is already due when its reset has passed. Do not
        // make the user wait another half hour just because they reopened it.
        const dueAt = limit.resetAt === null ? (observedAt ?? now()) + 30 * 60 * 1000 : limit.resetAt + 1000;
        const retryAt = usageLimitRetryAt(limit.resetAt, now()) === null ? null : Math.max(now() + 1000, dueAt);
        await replace(id, { sessionId: id, messageId, directory: session.location.directory,
          resetAt: limit.resetAt, retryAt, status: retryAt === null ? 'skipped' : 'scheduled' });
      });
      return entries.get(id) ?? null;
    } finally {
      if (pendingFailures.get(id) === pending) pendingFailures.delete(id);
    }
  };
  return { start, processEvent, get: (id) => {
    if (!ready) throw new Error('Retry schedules unavailable');
    return entries.get(id) ?? null;
   }, cancel, recover,
    stop: async () => { stopped = true; unsubscribe?.(); for (const id of timers.keys()) clearTimer(id); await mutations.catch(() => {}); await writes.catch(() => {}); },
  };
}

export function registerUsageLimitRetryRoutes(app, runtime) {
  app.post('/api/usage-limit-retry/:sessionId/:messageId', async (req, res) => {
    try { res.json(await runtime.recover(req.params.sessionId, req.params.messageId)); }
    catch { res.status(503).json({ error: 'Retry schedules unavailable' }); }
  });
  app.get('/api/usage-limit-retry/:sessionId', (req, res) => {
    try { res.json(runtime.get(req.params.sessionId)); }
    catch { res.status(503).json({ error: 'Retry schedules unavailable' }); }
  });
  app.delete('/api/usage-limit-retry/:sessionId/:messageId', async (req, res) => {
    try { await runtime.cancel(req.params.sessionId, req.params.messageId); res.sendStatus(204); }
    catch { res.status(500).json({ error: 'Could not cancel the retry schedule' }); }
  });
}
