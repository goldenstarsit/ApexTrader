import assert from "node:assert/strict";
import test from "node:test";

import { RiskManager } from "../src/core/risk/abstract-model/risk-manager.js";

test("accepts a valid maximum trade value and fee rate", () => {
  const manager = new RiskManager({
    maxTradeValue: 100,
    feeRate: 0.001,
  });

  assert.equal(manager.maxTradeValue, 100);
  assert.equal(manager.feeRate, 0.001);
});

test("rejects invalid maximum trade values", () => {
  for (const maxTradeValue of [0, -1, Infinity, NaN]) {
    assert.throws(
      () => new RiskManager({ maxTradeValue }),
      /maxTradeValue must be a positive finite number/
    );
  }
});

test("rejects invalid fee rates", () => {
  for (const feeRate of [-0.001, 1.001, Infinity, NaN]) {
    assert.throws(
      () => new RiskManager({ maxTradeValue: 100, feeRate }),
      /feeRate must be a finite number between 0 and 1/
    );
  }
});

test("allows a trade below the limit and reports its fee", () => {
  const manager = new RiskManager({
    maxTradeValue: 100,
    feeRate: 0.001,
  });

  assert.deepEqual(manager.validateTrade({ quantity: 2, price: 40 }), {
    allowed: true,
    side: "BUY",
    quantity: 2,
    price: 40,
    tradeValue: 80,
    fee: 0.08,
    feeRate: 0.001,
    totalCost: 80.08,
    maxTradeValue: 100,
  });
});

test("allows a trade at the gross value limit even when its fee adds cost", () => {
  const manager = new RiskManager({
    maxTradeValue: 100,
    feeRate: 0.01,
  });

  const result = manager.validateTrade({
    quantity: 1,
    price: 100,
  });

  assert.equal(result.tradeValue, 100);
  assert.equal(result.fee, 1);
  assert.equal(result.totalCost, 101);
  assert.equal(result.allowed, true);
});

test("rejects a trade whose gross value exceeds the limit", () => {
  const manager = new RiskManager({
    maxTradeValue: 100,
    feeRate: 0.001,
  });

  assert.throws(
    () => manager.validateTrade({ quantity: 1, price: 100.01 }),
    /Trade value exceeds the configured maximum/
  );
});

test("accepts decimal multiplication at the exact trade value limit", () => {
  const manager = new RiskManager({ maxTradeValue: 0.3 });

  const result = manager.validateTrade({
    quantity: 3,
    price: 0.1,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.tradeValue, 0.30000000000000004);
});

test("allows a trade at the limit when the fee rate is zero", () => {
  const manager = new RiskManager({ maxTradeValue: 100 });

  const result = manager.validateTrade({ quantity: 2, price: 50 });

  assert.equal(result.tradeValue, 100);
  assert.equal(result.fee, 0);
  assert.equal(result.totalCost, 100);
});

test("uses a valid per-trade fee override instead of the default fee", () => {
  const manager = new RiskManager({
    maxTradeValue: 100,
    feeRate: 0.001,
  });

  const result = manager.validateTrade({
    quantity: 2,
    price: 40,
    feeRate: 0.01,
  });

  assert.equal(result.fee, 0.8);
  assert.equal(result.feeRate, 0.01);
  assert.equal(result.totalCost, 80.8);
  assert.equal(manager.feeRate, 0.001);
});

test("rejects invalid per-trade fee overrides", () => {
  const manager = new RiskManager({ maxTradeValue: 100 });

  for (const feeRate of [-0.001, 1.001, Infinity, NaN, null]) {
    assert.throws(
      () => manager.validateTrade({
        quantity: 1,
        price: 10,
        feeRate,
      }),
      /feeRate must be a finite number between 0 and 1/
    );
  }
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
