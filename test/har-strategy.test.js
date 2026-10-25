import assert from "node:assert/strict";
import test from "node:test";

import { HARConfiguration } from "../src/core/strategies/har/har-configuration.js";
import {
  calculateAverage,
  evaluateHAR,
} from "../src/core/strategies/har/har-strategy.js";

function makeConfiguration(overrides = {}) {
  return new HARConfiguration({
    id: "har-test-01",
    name: "HAR Test",
    exchange: "simulation",
    symbol: "BTC/USDT",
    rangeMode: "percentage",
    rangeValue: 2,
    enabled: true,
    ...overrides,
  });
}

const prices = Array(12).fill(100);

function evaluate(configuration, currentPrice, historicalPrices = prices) {
  return evaluateHAR({
    configuration,
    historicalPrices,
    currentPrice,
  });
}

test("calculates the average of historical prices", () => {
  assert.equal(calculateAverage([90, 100, 110]), 100);
});

test("rejects an empty historical price list", () => {
  assert.throws(() => calculateAverage([]), TypeError);
});

test("rejects invalid historical prices", () => {
  assert.throws(() => calculateAverage([100, 0]), RangeError);
});

test("signals BUY below the lower boundary", () => {
  const result = evaluate(makeConfiguration(), 97);

  assert.equal(result.signal, "BUY");
  assert.equal(result.average, 100);
  assert.equal(result.lowerBound, 98);
  assert.equal(result.upperBound, 102);
});

test("signals SELL above the upper boundary", () => {
  assert.equal(evaluate(makeConfiguration(), 103).signal, "SELL");
});

test("does not signal at either exact boundary", () => {
  assert.equal(evaluate(makeConfiguration(), 98).signal, "NO_ACTION");
  assert.equal(evaluate(makeConfiguration(), 102).signal, "NO_ACTION");
});

test("does not signal when price is inside the range", () => {
  assert.equal(evaluate(makeConfiguration(), 100).signal, "NO_ACTION");
});

test("does not signal when the strategy is disabled", () => {
  const result = evaluate(makeConfiguration({ enabled: false }), 97);

  assert.equal(result.signal, "NO_ACTION");
  assert.equal(result.reason, "STRATEGY_DISABLED");
});

test("requires the expected number of historical samples", () => {
  assert.throws(
    () => evaluate(makeConfiguration(), 97, [100, 100]),
    /Expected exactly 12/
  );
});

test("supports a fixed-price range", () => {
  const configuration = makeConfiguration({
    rangeMode: "fixed",
    rangeValue: 5,
  });

  const result = evaluate(configuration, 94);

  assert.equal(result.lowerBound, 95);
  assert.equal(result.upperBound, 105);
  assert.equal(result.signal, "BUY");
});

test("rejects an invalid current price", () => {
  assert.throws(
    () => evaluate(makeConfiguration(), 0),
    /currentPrice must be a positive finite number/
  );
});
