export function parseUsageLimitError(body: unknown, observedAt: number): { resetAt: number | null } | null;
export function usageLimitRetryAt(resetAt: number | null, now: number): number | null;
