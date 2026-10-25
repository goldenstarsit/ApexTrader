import assert from "node:assert/strict";
import test from "node:test";

import { RiskManager } from "../src/core/risk/abstract-model/risk-manager.js";

test("accepts a valid maximum trade value", () => {
  const manager = new RiskManager({ maxTradeValue: 100 });

  assert.equal(manager.maxTradeValue, 100);
});

test("rejects zero, negative and non-finite maximum trade values", () => {
  for (const maxTradeValue of [0, -1, Infinity, NaN]) {
    assert.throws(
      () => new RiskManager({ maxTradeValue }),
      /maxTradeValue must be a positive finite number/
    );
  }
});

test("allows a trade below the maximum value", () => {
  const manager = new RiskManager({ maxTradeValue: 100 });

  assert.deepEqual(manager.validateTrade({ quantity: 2, price: 40 }), {
    allowed: true,
    quantity: 2,
    price: 40,
    tradeValue: 80,
    maxTradeValue: 100,
  });
});

test("allows a trade exactly at the maximum value", () => {
  const manager = new RiskManager({ maxTradeValue: 100 });

  const result = manager.validateTrade({ quantity: 2, price: 50 });

  assert.equal(result.tradeValue, 100);
  assert.equal(result.allowed, true);
});

test("rejects a trade above the maximum value", () => {
  const manager = new RiskManager({ maxTradeValue: 100 });

  assert.throws(
    () => manager.validateTrade({ quantity: 2, price: 51 }),
    /Trade value exceeds the configured maximum/
  );
});

test("rejects invalid quantities", () => {
  const manager = new RiskManager({ maxTradeValue: 100 });

  for (const quantity of [0, -1, Infinity, NaN]) {
    assert.throws(
      () => manager.validateTrade({ quantity, price: 10 }),
      /quantity must be a positive finite number/
    );
  }
});

test("rejects invalid prices", () => {
  const manager = new RiskManager({ maxTradeValue: 100 });

  for (const price of [0, -1, Infinity, NaN]) {
    assert.throws(
      () => manager.validateTrade({ quantity: 1, price }),
      /price must be a positive finite number/
    );
  }
});

test("rejects a trade whose calculated value overflows", () => {
  const manager = new RiskManager({ maxTradeValue: Number.MAX_VALUE });

  assert.throws(
    () =>
      manager.validateTrade({
        quantity: Number.MAX_VALUE,
        price: 2,
      }),
    /Trade value must be finite/
  );
});
