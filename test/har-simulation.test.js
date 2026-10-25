import assert from "node:assert/strict";
import test from "node:test";

import { TestBalance } from "../src/core/balance/test-balance.js";
import { RiskManager } from "../src/core/risk/abstract-model/risk-manager.js";
import { HARConfiguration } from "../src/core/strategies/har/har-configuration.js";
import { runHARSimulation } from "../src/core/strategies/har/run-har-simulation.js";

function makeConfiguration(overrides = {}) {
  return new HARConfiguration({
    id: "har-simulation-test",
    name: "HAR Simulation Test",
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

function makeRiskManager(overrides = {}) {
  return new RiskManager({
    maxTradeValue: 10000,
    ...overrides,
  });
}

test("simulation executes sequential BUY and SELL signals", () => {
  const balance = new TestBalance({
    quoteBalance: 10000,
    baseBalance: 1,
  });

  const result = runHARSimulation({
    riskManager: makeRiskManager(),
    configuration: makeConfiguration(),
    historicalPrices,
    prices: [97, 103],
    balance,
    quantity: 1,
  });

  assert.deepEqual(
    result.steps.map((step) => step.signal),
    ["BUY", "SELL"]
  );
  assert.deepEqual(
    result.steps.map((step) => step.trade.side),
    ["BUY", "SELL"]
  );
  assert.equal(result.finalBalance.quoteBalance, 10006);
  assert.equal(result.finalBalance.baseBalance, 1);
  assert.equal(result.finalBalance.trades.length, 2);
});

test("simulation rolls historical prices forward after every step", () => {
  const balance = new TestBalance();

  const result = runHARSimulation({
    riskManager: makeRiskManager(),
    configuration: makeConfiguration(),
    historicalPrices,
    prices: [100, 101],
    balance,
    quantity: 1,
  });

  assert.deepEqual(
    result.steps.map((step) => step.signal),
    ["NO_ACTION", "NO_ACTION"]
  );
  assert.equal(result.finalBalance.trades.length, 0);
});

test("disabled strategy completes simulation without trades", () => {
  const balance = new TestBalance();

  const result = runHARSimulation({
    riskManager: makeRiskManager(),
    configuration: makeConfiguration({ enabled: false }),
    historicalPrices,
    prices: [97, 103],
    balance,
    quantity: 1,
  });

  assert.equal(result.steps.length, 2);
  assert.ok(result.steps.every((step) => step.signal === "NO_ACTION"));
  assert.equal(result.finalBalance.trades.length, 0);
});

test("invalid price sequence is rejected before any trade", () => {
  const balance = new TestBalance();

  assert.throws(
    () =>
      runHARSimulation({
    riskManager: makeRiskManager(),
        configuration: makeConfiguration(),
        historicalPrices,
        prices: [97, 0],
        balance,
        quantity: 1,
      }),
    /Every simulation price must be a positive finite number/
  );

  assert.equal(balance.snapshot().trades.length, 0);
  assert.equal(balance.quoteBalance, 10000);
});

test("simulation rejects an empty price sequence", () => {
  assert.throws(
    () =>
      runHARSimulation({
    riskManager: makeRiskManager(),
        configuration: makeConfiguration(),
        historicalPrices,
        prices: [],
        balance: new TestBalance(),
        quantity: 1,
      }),
    /prices must be a non-empty array/
  );
});

test("simulation rejects insufficient historical samples", () => {
  const balance = new TestBalance();

  assert.throws(
    () =>
      runHARSimulation({
    riskManager: makeRiskManager(),
        configuration: makeConfiguration(),
        historicalPrices: [100, 100],
        prices: [97],
        balance,
        quantity: 1,
      }),
    /Expected exactly 12 historical price samples/
  );

  assert.equal(balance.snapshot().trades.length, 0);
});
