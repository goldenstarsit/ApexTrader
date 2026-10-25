import assert from "node:assert/strict";
import test from "node:test";

import { TestBalance } from "../src/core/balance/test-balance.js";
import { HARConfiguration } from "../src/core/strategies/har/har-configuration.js";
import { executeHARStep } from "../src/core/strategies/har/run-har-step.js";

function makeConfiguration(overrides = {}) {
  return new HARConfiguration({
    id: "har-integration-test",
    name: "HAR Integration Test",
    exchange: "simulation",
    symbol: "BTC/USDT",
    averagePeriodMinutes: 60,
    priceCheckIntervalMinutes: 5,
    rangeMode: "percentage",
    rangeValue: 2,
    enabled: true,
    ...overrides,
  });
}

const historicalPrices = Array(12).fill(100);

function runStep({ balance, currentPrice, configuration, quantity = 1 }) {
  return executeHARStep({
    configuration: configuration ?? makeConfiguration(),
    historicalPrices,
    currentPrice,
    balance,
    quantity,
  });
}

test("HAR BUY signal executes a simulated buy", () => {
  const balance = new TestBalance();

  const result = runStep({ balance, currentPrice: 97 });

  assert.equal(result.signal, "BUY");
  assert.equal(result.trade.side, "BUY");
  assert.equal(balance.quoteBalance, 9903);
  assert.equal(balance.baseBalance, 1);
  assert.equal(balance.snapshot().trades.length, 1);
});

test("HAR SELL signal executes a simulated sell", () => {
  const balance = new TestBalance({
    quoteBalance: 500,
    baseBalance: 2,
  });

  const result = runStep({ balance, currentPrice: 103 });

  assert.equal(result.signal, "SELL");
  assert.equal(result.trade.side, "SELL");
  assert.equal(balance.quoteBalance, 603);
  assert.equal(balance.baseBalance, 1);
  assert.equal(balance.snapshot().trades.length, 1);
});

test("NO_ACTION does not change the balance", () => {
  const balance = new TestBalance();
  const before = balance.snapshot();

  const result = runStep({ balance, currentPrice: 100 });

  assert.equal(result.signal, "NO_ACTION");
  assert.equal(result.trade, null);
  assert.deepEqual(balance.snapshot(), before);
});

test("disabled HAR does not execute a trade", () => {
  const balance = new TestBalance();
  const before = balance.snapshot();

  const result = runStep({
    balance,
    currentPrice: 97,
    configuration: makeConfiguration({ enabled: false }),
  });

  assert.equal(result.signal, "NO_ACTION");
  assert.equal(result.trade, null);
  assert.deepEqual(balance.snapshot(), before);
});

test("insufficient balance rejects a HAR trade without recording it", () => {
  const balance = new TestBalance({ quoteBalance: 10 });

  assert.throws(
    () => runStep({ balance, currentPrice: 97 }),
    /Insufficient quote balance/
  );

  assert.equal(balance.quoteBalance, 10);
  assert.equal(balance.baseBalance, 0);
  assert.equal(balance.snapshot().trades.length, 0);
});

test("rejects an invalid trade quantity when a signal requires a trade", () => {
  const balance = new TestBalance();

  assert.throws(
    () => runStep({ balance, currentPrice: 97, quantity: 0 }),
    /quantity must be a positive finite number/
  );

  assert.equal(balance.snapshot().trades.length, 0);
});
