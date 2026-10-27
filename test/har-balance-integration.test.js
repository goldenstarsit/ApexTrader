import assert from "node:assert/strict";
import test from "node:test";

import { TestBalance } from "../src/core/balance/test-balance.js";
import { RiskManager } from "../src/core/risk/abstract-model/risk-manager.js";
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

function makeRiskManager(overrides = {}) {
  return new RiskManager({
    maxTradeValue: 10000,
    ...overrides,
  });
}

function runStep({
  balance,
  currentPrice,
  configuration,
  quantity = 1,
  riskManager = makeRiskManager(),
  marketRules,
}) {
  return executeHARStep({
    configuration: configuration ?? makeConfiguration(),
    historicalPrices,
    currentPrice,
    balance,
    quantity,
    riskManager,
    marketRules,
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

test("risk rejection leaves the simulated balance unchanged", () => {
  const balance = new TestBalance();
  const before = balance.snapshot();

  assert.throws(
    () =>
      runStep({
        balance,
        currentPrice: 97,
        riskManager: makeRiskManager({ maxTradeValue: 50 }),
      }),
    /Trade value exceeds the configured maximum/
  );

  assert.deepEqual(balance.snapshot(), before);
  assert.equal(balance.quoteBalance, 10000);
  assert.equal(balance.baseBalance, 0);
});

test("BUY respects the gross risk limit and separately checks balance including fee", () => {
  const balance = new TestBalance({ quoteBalance: 97.05 });
  const before = balance.snapshot();

  assert.throws(
    () =>
      runStep({
        balance,
        currentPrice: 97,
        riskManager: makeRiskManager({
          maxTradeValue: 97,
          feeRate: 0.001,
        }),
      }),
    /Insufficient quote balance/
  );

  assert.deepEqual(balance.snapshot(), before);
});

test("HAR BUY deducts the Risk Manager fee from quote balance", () => {
  const balance = new TestBalance();

  const result = runStep({
    balance,
    currentPrice: 97,
    riskManager: makeRiskManager({ feeRate: 0.001 }),
  });

  assert.equal(result.trade.total, 97);
  assert.equal(result.trade.fee, 0.097);
  assert.equal(balance.quoteBalance, 9902.903);
  assert.equal(balance.baseBalance, 1);
});

test("HAR SELL deducts the Risk Manager fee from sale proceeds", () => {
  const balance = new TestBalance({
    quoteBalance: 500,
    baseBalance: 2,
  });

  const result = runStep({
    balance,
    currentPrice: 103,
    riskManager: makeRiskManager({ feeRate: 0.001 }),
  });

  assert.equal(result.trade.total, 103);
  assert.ok(Math.abs(result.trade.fee - 0.103) < 1e-12);
  assert.equal(balance.quoteBalance, 602.897);
  assert.equal(balance.baseBalance, 1);
});


test("HAR BUY keeps decimal trade total and fee consistent with balance", () => {
  const balance = new TestBalance({
    quoteBalance: 10,
    baseBalance: 0,
  });

  const result = runStep({
    balance,
    currentPrice: 0.1,
    quantity: 3,
    riskManager: makeRiskManager({
      maxTradeValue: 1,
      feeRate: 0.01,
    }),
  });

  assert.equal(result.signal, "BUY");
  assert.equal(result.trade.total, 0.3);
  assert.ok(Math.abs(result.trade.fee - 0.003) < 1e-15);
  assert.ok(Math.abs(balance.quoteBalance - 9.697) < 1e-12);
  assert.equal(balance.baseBalance, 3);
  assert.equal(balance.snapshot().trades.length, 1);
});

test("HAR SELL keeps decimal trade total and fee consistent with balance", () => {
  const balance = new TestBalance({
    quoteBalance: 10,
    baseBalance: 3,
  });

  const result = executeHARStep({
    configuration: makeConfiguration(),
    historicalPrices: Array(12).fill(0.1),
    currentPrice: 0.103,
    balance,
    quantity: 3,
    riskManager: makeRiskManager({
      maxTradeValue: 1,
      feeRate: 0.01,
    }),
  });

  assert.equal(result.signal, "SELL");
  assert.equal(result.trade.total, 0.309);
  assert.ok(Math.abs(result.trade.fee - 0.00309) < 1e-15);
  assert.ok(Math.abs(balance.quoteBalance - 10.30591) < 1e-12);
  assert.equal(balance.baseBalance, 0);
  assert.equal(balance.snapshot().trades.length, 1);
});

test("automatic HAR sizing uses verified market minimum and quantity step", () => {
  const balance = new TestBalance({ quoteBalance: 1000 });
  const result = runStep({
    balance,
    currentPrice: 97,
    marketRules: {
      quantityStep: 0.01,
      minQuantity: 0.01,
      quoteAmountPrecisionMarket: 10,
      maxQuoteAmountMarket: 1000,
      takerCommission: 0,
    },
  });

  assert.equal(result.signal, "BUY");
  assert.equal(result.trade.quantity, 0.11);
  assert.equal(result.trade.total, 10.67);
  assert.equal(balance.snapshot().trades.length, 1);
});

test("automatic HAR uses the MEXC taker commission for sizing and BUY balance", () => {
  const balance = new TestBalance({ quoteBalance: 1000 });
  const beforeBase = balance.baseBalance;

  const result = runStep({
    balance,
    currentPrice: 97,
    riskManager: makeRiskManager({ feeRate: 0.2 }),
    marketRules: {
      quantityStep: 0.01,
      minQuantity: 0.01,
      quoteAmountPrecisionMarket: 10,
      maxQuoteAmountMarket: 1000,
      takerCommission: 0.01,
    },
  });

  assert.equal(result.trade.quantity, 0.11);
  assert.equal(result.trade.total, 10.67);
  assert.equal(result.trade.fee, 0.1067);
  assert.equal(balance.quoteBalance, 989.2233);
  assert.equal(balance.baseBalance, beforeBase + 0.11);
});

test("automatic HAR rejects a missing or invalid MEXC taker commission without trading", () => {
  for (const takerCommission of [undefined, null, -0.001, 1.001, Infinity, NaN]) {
    const balance = new TestBalance({ quoteBalance: 1000 });
    const before = balance.snapshot();
    const marketRules = {
      quantityStep: 0.01,
      minQuantity: 0.01,
      quoteAmountPrecisionMarket: 10,
      maxQuoteAmountMarket: 1000,
    };

    if (takerCommission !== undefined) {
      marketRules.takerCommission = takerCommission;
    }

    assert.throws(
      () => runStep({
        balance,
        currentPrice: 97,
        marketRules,
      }),
      /verified MEXC taker commission/
    );

    assert.deepEqual(balance.snapshot(), before);
  }
});

test("automatic HAR sizing refuses an unknown maximum quote amount", () => {
  const balance = new TestBalance({ quoteBalance: 1000 });
  const before = balance.snapshot();

  assert.throws(
    () => runStep({
      balance,
      currentPrice: 97,
      marketRules: {
        quantityStep: 0.01,
        minQuantity: 0.01,
        quoteAmountPrecisionMarket: 10,
        maxQuoteAmountMarket: null,
      },
    }),
    /verified market-order maximum quote amount/
  );

  assert.deepEqual(balance.snapshot(), before);
});

test("automatic HAR sizing refuses an unknown quantity step", () => {
  const balance = new TestBalance({ quoteBalance: 1000 });
  const before = balance.snapshot();

  assert.throws(
    () => runStep({
      balance,
      currentPrice: 97,
      marketRules: {
        quantityStep: null,
        minQuantity: 0.01,
        quoteAmountPrecisionMarket: 10,
        maxQuoteAmountMarket: 1000,
      },
    }),
    /verified quantity step/
  );

  assert.deepEqual(balance.snapshot(), before);
});

test("automatic HAR sizing refuses an unknown minimum quote amount", () => {
  const balance = new TestBalance();
  const before = balance.snapshot();

  assert.throws(
    () => runStep({
      balance,
      currentPrice: 97,
      marketRules: {
        quantityStep: 0.01,
        minQuantity: 0.01,
        quoteAmountPrecisionMarket: null,
        maxQuoteAmountMarket: 1000,
      },
    }),
    /verified market-order minimum quote amount/
  );

  assert.deepEqual(balance.snapshot(), before);
});
