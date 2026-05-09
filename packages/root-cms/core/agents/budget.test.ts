import {describe, expect, it} from 'vitest';
import {TokenBudget} from './budget.js';

describe('TokenBudget', () => {
  it('treats absent or invalid caps as uncapped', () => {
    const a = new TokenBudget();
    expect(a.cap).toBeNull();
    expect(a.isExceeded()).toBe(false);

    const b = new TokenBudget(0);
    expect(b.cap).toBeNull();

    const c = new TokenBudget(-100);
    expect(c.cap).toBeNull();

    const d = new TokenBudget(NaN);
    expect(d.cap).toBeNull();
  });

  it('sums input and output tokens', () => {
    const budget = new TokenBudget(1000);
    budget.consume({inputTokens: 100, outputTokens: 50});
    expect(budget.used).toBe(150);
    budget.consume({inputTokens: 200, outputTokens: 100});
    expect(budget.used).toBe(450);
  });

  it('also counts cached and reasoning tokens', () => {
    const budget = new TokenBudget();
    budget.consume({
      inputTokens: 10,
      outputTokens: 20,
      cachedInputTokens: 30,
      reasoningTokens: 40,
    });
    expect(budget.used).toBe(100);
  });

  it('ignores nulls, undefineds, and negative values', () => {
    const budget = new TokenBudget();
    budget.consume(null);
    budget.consume(undefined);
    budget.consume({});
    budget.consume({inputTokens: -50, outputTokens: undefined});
    budget.consume({inputTokens: NaN});
    expect(budget.used).toBe(0);
  });

  it('flips isExceeded once used surpasses cap', () => {
    const budget = new TokenBudget(100);
    budget.consume({inputTokens: 60});
    expect(budget.isExceeded()).toBe(false);
    budget.consume({inputTokens: 40});
    // exactly at cap is not exceeded.
    expect(budget.isExceeded()).toBe(false);
    budget.consume({inputTokens: 1});
    expect(budget.isExceeded()).toBe(true);
  });

  it('snapshot reports remaining and exceeded state', () => {
    const budget = new TokenBudget(500);
    budget.consume({inputTokens: 200});
    const snap = budget.snapshot();
    expect(snap).toEqual({
      used: 200,
      cap: 500,
      remaining: 300,
      exceeded: false,
    });
  });

  it('uncapped snapshot has null remaining', () => {
    const budget = new TokenBudget();
    budget.consume({inputTokens: 1000});
    expect(budget.snapshot()).toEqual({
      used: 1000,
      cap: null,
      remaining: null,
      exceeded: false,
    });
  });
});
