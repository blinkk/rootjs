/**
 * Token budget tracker for an agent run. Workers feed step-level usage into
 * `consume()`; the runner halts the run when `isExceeded()` flips to true.
 *
 * The cap covers all input + output tokens across every step in the current
 * run, including any subagent invocations. There is no resume on overrun —
 * the run is marked errored and a human re-trigger is required.
 */

export interface TokenUsageLike {
  /** Tokens billed as input on this step. */
  inputTokens?: number | null;
  /** Tokens billed as output on this step. */
  outputTokens?: number | null;
  /** Tokens billed as cache reads, when supported by the provider. */
  cachedInputTokens?: number | null;
  /** Tokens billed as reasoning, when supported by the provider. */
  reasoningTokens?: number | null;
}

export interface TokenBudgetSnapshot {
  used: number;
  cap: number | null;
  remaining: number | null;
  exceeded: boolean;
}

export class TokenBudget {
  private _used = 0;
  private readonly _cap: number | null;

  constructor(cap?: number | null) {
    this._cap =
      typeof cap === 'number' && Number.isFinite(cap) && cap > 0 ? cap : null;
  }

  /**
   * Adds the tokens reported in `usage` to the running total. Missing or
   * non-numeric fields contribute zero.
   */
  consume(usage: TokenUsageLike | undefined | null): TokenBudgetSnapshot {
    if (usage) {
      this._used += clampPositive(usage.inputTokens);
      this._used += clampPositive(usage.outputTokens);
      this._used += clampPositive(usage.cachedInputTokens);
      this._used += clampPositive(usage.reasoningTokens);
    }
    return this.snapshot();
  }

  /** Total tokens consumed so far. */
  get used(): number {
    return this._used;
  }

  /** Configured cap, or null if uncapped. */
  get cap(): number | null {
    return this._cap;
  }

  /** Returns true once `used` strictly exceeds `cap`. */
  isExceeded(): boolean {
    if (this._cap === null) {
      return false;
    }
    return this._used > this._cap;
  }

  snapshot(): TokenBudgetSnapshot {
    return {
      used: this._used,
      cap: this._cap,
      remaining:
        this._cap === null ? null : Math.max(0, this._cap - this._used),
      exceeded: this.isExceeded(),
    };
  }
}

function clampPositive(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}
