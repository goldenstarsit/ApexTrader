import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateMinimumQuantity,
} from "../src/core/strategies/har/calculate-minimum-quantity.js";

const defaults = {
  side: "BUY",
  price: 100,
  quantityStep: 0.01,
  minQuantity: 0.01,
  minQuoteAmount: 5,
  availableQuoteBalance: 100,
  availableBaseBalance: 1,
  feeRate: 0.001,
  maxTradeValue: 100,
};

test("rounds quantity up to the smallest valid step", () => {
  const result = calculateMinimumQuantity({
    ...defaults,
    price: 333,
    minQuoteAmount: 5,
  });

  assert.equal(result.quantity, 0.02);
  assert.ok(result.tradeValue >= 5);
});

test("uses minimum quantity when it exceeds the quote-value requirement", () => {
  const result = calculateMinimumQuantity({
    ...defaults,
    quantityStep: 0.1,
    minQuantity: 0.1,
    minQuoteAmount: 5,
    price: 100,
  });

  assert.equal(result.quantity, 0.1);
  assert.equal(result.tradeValue, 10);
});

test("accounts for fees when checking simulated BUY balance", () => {
  assert.throws(
    () =>
      calculateMinimumQuantity({
        ...defaults,
        price: 100,
        minQuoteAmount: 100,
        maxTradeValue: 100,
        availableQuoteBalance: 100,
        feeRate: 0.01,
      }),
    /Insufficient simulated quote balance/
  );
});

test("rejects quantity that exceeds the risk limit", () => {
  assert.throws(
    () =>
      calculateMinimumQuantity({
        ...defaults,
        price: 100,
        minQuoteAmount: 20,
        maxTradeValue: 10,
      }),
    /Risk Manager limit/
  );
});

test("rejects SELL when TestBalance has insufficient base asset", () => {
  assert.throws(
    () =>
      calculateMinimumQuantity({
        ...defaults,
        side: "SELL",
        price: 100,
        minQuoteAmount: 20,
        availableBaseBalance: 0.1,
      }),
    /Insufficient simulated base balance/
  );
});

test("returns the minimum valid SELL quantity when base balance is sufficient", () => {
  const result = calculateMinimumQuantity({
    ...defaults,
    side: "SELL",
    price: 100,
    minQuoteAmount: 20,
    availableBaseBalance: 1,
  });

  assert.equal(result.quantity, 0.2);
  assert.equal(result.tradeValue, 20);
});

test("rejects invalid quantity steps and fee rates", () => {
  assert.throws(
    () =>
      calculateMinimumQuantity({
        ...defaults,
        quantityStep: 0,
      }),
    /quantityStep/
  );

  assert.throws(
    () =>
      calculateMinimumQuantity({
        ...defaults,
        feeRate: -0.1,
      }),
    /feeRate/
  );
});

test("rejects quantity steps beyond supported decimal precision", () => {
  assert.throws(
    () =>
      calculateMinimumQuantity({
        ...defaults,
        quantityStep: 0.0000000000001,
        minQuantity: 0.0000000000001,
        minQuoteAmount: 0.0000000000001,
      }),
    /exceeds supported precision/
  );
});

test("rejects orders above the exchange quote maximum", () => {
  assert.throws(
    () =>
      calculateMinimumQuantity({
        ...defaults,
        minQuoteAmount: 20,
        maxQuoteAmount: 10,
      }),
    /exchange maximum quote amount/
  );
});


test("rejects tiny excess above the risk limit", () => {
  assert.throws(
    () =>
      calculateMinimumQuantity({
        ...defaults,
        price: 1,
        quantityStep: 0.01,
        minQuantity: 0.01,
        minQuoteAmount: 10.00000000005,
        maxTradeValue: 10.00999999995,
        maxQuoteAmount: 100,
        feeRate: 0,
      }),
    /Risk Manager limit/
  );
});

test("rejects tiny excess above the exchange quote maximum", () => {
  assert.throws(
    () =>
      calculateMinimumQuantity({
        ...defaults,
        price: 1,
        quantityStep: 0.01,
        minQuantity: 0.01,
        minQuoteAmount: 10.00000000005,
        maxTradeValue: 100,
        maxQuoteAmount: 10.00999999995,
        feeRate: 0,
      }),
    /exchange maximum quote amount/
  );
});

test("rejects large-value excess above the risk limit", () => {
  assert.throws(
    () =>
      calculateMinimumQuantity({
        ...defaults,
        price: 1,
        quantityStep: 0.5,
        minQuantity: 0.5,
        minQuoteAmount: 1000000000000000.5,
        maxQuoteAmount: Infinity,
        availableQuoteBalance: 2000000000000000,
        availableBaseBalance: 0,
        feeRate: 0,
        maxTradeValue: 1000000000000000,
      }),
    /Risk Manager limit/
  );
});

test("rejects large-value excess above the exchange maximum", () => {
  assert.throws(
    () =>
      calculateMinimumQuantity({
        ...defaults,
        price: 1,
        quantityStep: 0.5,
        minQuantity: 0.5,
        minQuoteAmount: 1000000000000000.5,
        maxQuoteAmount: 1000000000000000,
        availableQuoteBalance: 2000000000000000,
        availableBaseBalance: 0,
        feeRate: 0,
        maxTradeValue: 2000000000000000,
      }),
    /exchange maximum quote amount/
  );
});

test("rejects large-value excess above the simulated quote balance", () => {
  assert.throws(
    () =>
      calculateMinimumQuantity({
        ...defaults,
        price: 1,
        quantityStep: 0.5,
        minQuantity: 0.5,
        minQuoteAmount: 1000000000000000.5,
        maxQuoteAmount: Infinity,
        availableQuoteBalance: 1000000000000000,
        availableBaseBalance: 0,
        feeRate: 0,
        maxTradeValue: 2000000000000000,
      }),
    /Insufficient simulated quote balance/
  );
});

test("allows normal floating-point rounding at an equal risk limit", () => {
  const result = calculateMinimumQuantity({
    ...defaults,
    price: 0.1,
    quantityStep: 0.1,
    minQuantity: 0.1,
    minQuoteAmount: 0.3,
    maxTradeValue: 0.3,
    maxQuoteAmount: 1,
    feeRate: 0,
  });

  assert.equal(result.quantity, 3);
  assert.ok(Math.abs(result.tradeValue - 0.3) < 1e-12);
});

test("large ratio still rounds up to satisfy minimum quote amount", () => {
  const result = calculateMinimumQuantity({
    side: "BUY",
    price: 1,
    quantityStep: 0.000001,
    minQuantity: 0.000001,
    minQuoteAmount: 1000000.0000001,
    maxQuoteAmount: 2000000,
    availableQuoteBalance: 2000000,
    availableBaseBalance: 0,
    feeRate: 0,
    maxTradeValue: 2000000,
  });

  assert.equal(result.quantity, 1000000.000001);
  assert.ok(result.tradeValue >= 1000000.0000001);
});

test("does not round an exact minimum quote ratio up by an extra step", () => {
  const result = calculateMinimumQuantity({
    side: "BUY",
    price: 0.01,
    quantityStep: 0.01,
    minQuantity: 0.01,
    minQuoteAmount: 0.07,
    maxQuoteAmount: 10,
    availableQuoteBalance: 100,
    availableBaseBalance: 0,
    feeRate: 0,
    maxTradeValue: 100,
  });

  assert.equal(result.quantity, 7);
  assert.equal(result.tradeValue, 0.07);
});

test("returns a clean decimal quantity for a fractional step", () => {
  const result = calculateMinimumQuantity({
    ...defaults,
    price: 1,
    quantityStep: 0.1,
    minQuantity: 0.3,
    minQuoteAmount: 0.01,
    maxQuoteAmount: 10,
    availableQuoteBalance: 10,
    availableBaseBalance: 0,
    feeRate: 0,
    maxTradeValue: 10,
  });

  assert.equal(String(result.quantity), "0.3");

});

test("rounds a fractional minimum quantity up to a valid step", () => {
  const result = calculateMinimumQuantity({
    ...defaults,
    price: 100,
    quantityStep: 0.01,
    minQuantity: 0.025,
    minQuoteAmount: 1,
    maxQuoteAmount: 100,
    availableQuoteBalance: 100,
    feeRate: 0,
    maxTradeValue: 100,
  });

  assert.equal(result.quantity, 0.03);
  assert.ok(result.quantity >= 0.025);
  assert.equal(result.quantity / 0.01, 3);
});

test("rounds a minimum quantity above three steps to the next step", () => {
  const result = calculateMinimumQuantity({
    ...defaults,
    price: 100,
    quantityStep: 0.1,
    minQuantity: 0.31,
    minQuoteAmount: 1,
    maxQuoteAmount: 100,
    availableQuoteBalance: 100,
    feeRate: 0,
    maxTradeValue: 100,
  });

  assert.equal(result.quantity, 0.4);
  assert.ok(result.quantity >= 0.31);
  assert.equal(result.quantity / 0.1, 4);
});
