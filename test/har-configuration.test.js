import test from "node:test";
import assert from "node:assert/strict";

import { StrategyConfiguration } from "../src/core/strategies/strategy-configuration.js";
import { HARConfiguration } from "../src/core/strategies/har/har-configuration.js";

const validSettings = {
  id: "har-01",
  name: "HAR BTC",
  exchange: "example-exchange",
  symbol: "BTC/USDT",
  rangeMode: "percentage",
  rangeValue: 1,
};

test("HAR configuration accepts valid settings and safe defaults", () => {
  const config = new HARConfiguration(validSettings);

  assert.equal(config.id, "har-01");
  assert.equal(config.symbol, "BTC/USDT");
  assert.equal(config.averagePeriodMinutes, 60);
  assert.equal(config.priceCheckIntervalMinutes, 5);
  assert.equal(config.enabled, false);
  assert.equal(config.validate(), true);
});

test("abstract StrategyConfiguration cannot be instantiated directly", () => {
  assert.throws(
    () => new StrategyConfiguration(),
    /abstract base class/
  );
});

test("HAR configuration rejects missing currency symbol", () => {
  assert.throws(
    () => new HARConfiguration({ ...validSettings, symbol: "" }),
    /symbol must be a non-empty string/
  );
});

test("HAR configuration rejects invalid average periods", () => {
  assert.throws(
    () =>
      new HARConfiguration({
        ...validSettings,
        averagePeriodMinutes: 0,
      }),
    /averagePeriodMinutes must be a positive integer/
  );
});

test("HAR configuration rejects invalid price check intervals", () => {
  assert.throws(
    () =>
      new HARConfiguration({
        ...validSettings,
        priceCheckIntervalMinutes: 2.5,
      }),
    /priceCheckIntervalMinutes must be a positive integer/
  );
});

test("HAR configuration rejects unsupported range modes", () => {
  assert.throws(
    () =>
      new HARConfiguration({
        ...validSettings,
        rangeMode: "unknown",
      }),
    /rangeMode must be/
  );
});

test("HAR configuration rejects non-positive range values", () => {
  assert.throws(
    () =>
      new HARConfiguration({
        ...validSettings,
        rangeValue: 0,
      }),
    /rangeValue must be a positive finite number/
  );
});

test("percentage range must be below 100", () => {
  assert.throws(
    () =>
      new HARConfiguration({
        ...validSettings,
        rangeValue: 100,
      }),
    /Percentage rangeValue must be less than 100/
  );
});

test("HAR configuration rejects non-boolean enabled values", () => {
  assert.throws(
    () =>
      new HARConfiguration({
        ...validSettings,
        enabled: "yes",
      }),
    /enabled must be a boolean/
  );
});

test("fixed range accepts a positive absolute price difference", () => {
  const config = new HARConfiguration({
    ...validSettings,
    rangeMode: "fixed",
    rangeValue: 25,
  });

  assert.equal(config.rangeMode, "fixed");
  assert.equal(config.rangeValue, 25);
});
