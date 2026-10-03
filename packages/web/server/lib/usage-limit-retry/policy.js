// Pure provider-error parsing, also bundled into the UI for reset-time display.
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const number = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function parseUsageLimitError(body, observedAt) {
  if (typeof body !== 'string' || body.length > 1_000_000) return null;
  let response;
  try { response = record(JSON.parse(body)); } catch { return null; }
  const error = record(response.error);
  if (error.type !== 'usage_limit_reached') return null;
  const headers = Object.fromEntries(Object.entries(record(response.headers)).map(([key, value]) => [key.toLowerCase(), value]));
  const absolute = number(error.resets_at);
  const relative = number(error.resets_in_seconds);
  const resets = [];
  if (absolute !== null && absolute > 0) resets.push(absolute * 1000);
  else if (relative !== null) resets.push(observedAt + relative * 1000);
  // Only exhausted windows constrain the retry. A secondary window below 100%
  // must not postpone a primary-window reset by a week.
  for (const window of ['primary', 'secondary']) {
    if ((number(headers[`x-codex-${window}-used-percent`]) ?? 0) < 100) continue;
    const at = number(headers[`x-codex-${window}-reset-at`]);
    const after = number(headers[`x-codex-${window}-reset-after-seconds`]);
    if (at !== null && at > 0) resets.push(at * 1000);
    else if (after !== null) resets.push(observedAt + after * 1000);
  }
  const resetAt = resets.length ? Math.max(...resets) : null;
  if (resetAt !== null && !Number.isFinite(new Date(resetAt).getTime())) return { resetAt: null };
  return { resetAt };
}

export function usageLimitRetryAt(resetAt, now) {
  if (resetAt !== null && resetAt - now > 10 * 60 * 60 * 1000) return null;
  // A past reset that still fails needs backoff, not a tight immediate loop.
  return resetAt !== null && resetAt > now ? resetAt + 1000 : now + 30 * 60 * 1000;
}
