/**
 * Key Rotator — Provider-agnostic LLM bucket rotation with per-bucket cooldowns.
 *
 * Each LLMBucket is a key x model combination with its own independent rate limit.
 * On 429, the rotator immediately tries the next bucket instead of sleeping.
 *
 * Escalating cooldowns: if a bucket gets 429'd repeatedly, cooldown doubles each
 * time (60s → 120s → 240s → ... up to 30min). This prevents hammering burned
 * buckets with wasted API calls every tick. Resets daily.
 */

export interface LLMBucket {
  provider: 'gemini' | 'anthropic' | 'openai' | 'minimax' | 'opencode' | 'openrouter';
  model: string;
  apiKey: string;
  label: string; // human-readable, e.g. "2.5-flash@K2" — logging only
}

interface BucketState {
  bucket: LLMBucket;
  cooldownUntil: number;   // timestamp ms, 0 = available
  consecutiveHits: number; // how many 429s in a row (for escalating cooldown)
  usesToday: number;
  lastResetDate: string;   // "YYYY-MM-DD" for daily counter reset
}

export interface LLMResponse {
  text: string;
  usage: { inputTokens: number; outputTokens: number } | null;
}

function todayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

// Max cooldown: 30 minutes. After that, the bucket is likely a daily limit
// and will only recover at midnight UTC.
const MAX_COOLDOWN_MS = 30 * 60 * 1000;

export class KeyRotator {
  private states: BucketState[];
  private agentName: string;
  private baseCooldownMs: number;

  constructor(opts: {
    agentName: string;
    buckets: LLMBucket[];
    defaultCooldownMs?: number;
  }) {
    this.agentName = opts.agentName;
    this.baseCooldownMs = opts.defaultCooldownMs ?? 60_000;
    this.states = opts.buckets.map(bucket => ({
      bucket,
      cooldownUntil: 0,
      consecutiveHits: 0,
      usesToday: 0,
      lastResetDate: todayUTC(),
    }));
  }

  /**
   * Try LLM call, rotating through buckets on rate limit errors.
   * Returns response + which bucket succeeded.
   * Throws last error if ALL buckets fail.
   */
  async call(
    callFn: (bucket: LLMBucket) => Promise<LLMResponse>,
    isRateLimit: (err: unknown) => boolean,
  ): Promise<LLMResponse & { bucket: LLMBucket }> {
    const now = Date.now();
    let lastError: unknown = null;
    let skipped = 0;

    for (const state of this.states) {
      // Reset daily counters on day boundary
      const today = todayUTC();
      if (state.lastResetDate !== today) {
        state.usesToday = 0;
        state.consecutiveHits = 0;
        state.lastResetDate = today;
      }

      // Skip buckets still cooling down
      if (now < state.cooldownUntil) {
        skipped++;
        continue;
      }

      try {
        const response = await callFn(state.bucket);
        state.usesToday++;
        // Success — reset consecutive hit counter
        state.consecutiveHits = 0;
        return { ...response, bucket: state.bucket };
      } catch (err) {
        lastError = err;

        if (isRateLimit(err)) {
          // Escalating cooldown: doubles each consecutive 429 on same bucket
          // 60s → 120s → 240s → 480s → 960s → 1800s (capped at 30min)
          state.consecutiveHits++;
          const cooldownMs = Math.min(
            this.baseCooldownMs * Math.pow(2, state.consecutiveHits - 1),
            MAX_COOLDOWN_MS,
          );
          state.cooldownUntil = Date.now() + cooldownMs;
          const cooldownSec = Math.ceil(cooldownMs / 1000);
          console.warn(
            `[${this.agentName}] 429 on ${state.bucket.label} (hit #${state.consecutiveHits}, cooldown ${cooldownSec}s), trying next bucket...`
          );
          continue; // Immediately try next bucket
        }

        // Auth errors (401/403) — skip this bucket permanently (bad key), try next
        const errMsg = (err as any)?.message || String(err);
        if (/\b(401|403|Invalid API key|Unauthorized|Forbidden)\b/i.test(errMsg)) {
          // Disable this bucket for the rest of the day
          state.cooldownUntil = Date.now() + MAX_COOLDOWN_MS;
          state.consecutiveHits = 99; // prevent rapid retry
          console.warn(
            `[${this.agentName}] Auth error on ${state.bucket.label} — disabled for 30m. Trying next...`
          );
          continue;
        }

        // Other non-rate-limit error — don't try other buckets
        throw err;
      }
    }

    // All buckets exhausted or cooling down
    const total = this.states.length;
    if (lastError) {
      const nextAvail = Math.min(...this.states.map(s => s.cooldownUntil));
      const waitSec = Math.max(0, Math.ceil((nextAvail - Date.now()) / 1000));
      console.error(
        `[${this.agentName}] All ${total} buckets exhausted (${skipped} cooling). Next available in ~${waitSec}s.`
      );
      throw lastError;
    }

    // All were cooling down, none attempted
    const nextAvail = Math.min(...this.states.map(s => s.cooldownUntil));
    const waitSec = Math.max(0, Math.ceil((nextAvail - Date.now()) / 1000));
    throw new Error(
      `[${this.agentName}] All ${total} buckets cooling down. Next available in ~${waitSec}s.`
    );
  }

  /** Returns earliest recovery timestamp if ALL buckets are cooling, else 0. */
  allCoolingDown(): number {
    const now = Date.now();
    const allCooling = this.states.every(s => s.cooldownUntil > now);
    if (!allCooling) return 0;
    return Math.min(...this.states.map(s => s.cooldownUntil));
  }

  /** Debug summary of bucket states. */
  status(): string {
    const now = Date.now();
    return this.states.map(s => {
      const cd = s.cooldownUntil > now
        ? `COOL(${Math.ceil((s.cooldownUntil - now) / 1000)}s)`
        : 'OK';
      return `${s.bucket.label}:${cd}(${s.usesToday},h${s.consecutiveHits})`;
    }).join(' | ');
  }
}
