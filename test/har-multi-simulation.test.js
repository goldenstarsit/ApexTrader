import assert from "node:assert/strict";
import test from "node:test";

import {
  runHARMultiSimulation,
} from "../scripts/har-multi-simulation.js";

const symbols = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
];

function createFetchMock({
  failingSymbols = [],
} = {}) {
  const calls = [];

  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    const symbol = url.searchParams.get("symbol");

    calls.push({ path: url.pathname, symbol });

    if (failingSymbols.includes(symbol)) {
      return {
        ok: false,
        status: 503,
        json: async () => ({ code: "SERVICE_UNAVAILABLE" }),
      };
    }

    const market = {
      symbol,
      status: "1",
      isSpotTradingAllowed: true,
      orderTypes: ["MARKET"],
      tradeSideType: "1",
      filters: [{
        filterType: "PERCENT_PRICE_BY_SIDE",
        bidMultiplierUp: "0.005",
        askMultiplierDown: "0.005",
      }],
      baseSizePrecision: "0.001",
      baseAssetPrecision: 8,
      quoteAssetPrecision: 8,
      quoteAmountPrecision: "1",
      quoteAmountPrecisionMarket: "1",
      maxQuoteAmount: "100000",
      maxQuoteAmountMarket: "100000",
      makerCommission: "0.001",
      takerCommission: "0.001",
    };

    if (url.pathname.includes("/exchangeInfo")) {
      return {
        ok: true,
        json: async () => ({ symbols: [market] }),
      };
    }

    if (url.pathname.includes("/ticker/price")) {
      return {
        ok: true,
        json: async () => ({ symbol, price: "97" }),
      };
    }

    if (url.pathname.includes("/klines")) {
      return {
        ok: true,
        json: async () =>
          Array.from({ length: 13 }, (_, index) => {
            const openTime = 1_700_000_000_000 - (13 - index) * 300_000;
            return [
              openTime,
              "100",
              "101",
              "99",
              "100",
              "10",
              openTime + 300_000,
            ];
          }),
      };
    }

    throw new Error(`Unexpected mock URL: ${url}`);
  };

  return { fetchImpl, calls };
}

test("fails five independent simulations safely when quantity step is unverified", async () => {
  const { fetchImpl, calls } = createFetchMock();
  const result = await runHARMultiSimulation({
    symbols,
    quoteBalance: 100,
    fetchImpl,
  });

  assert.equal(result.mode, "SIMULATION_ONLY");
  assert.equal(result.balanceMode, "SEPARATE_PER_CURRENCY");
  assert.equal(result.initialCapitalPerCurrency, 100);
  assert.equal(result.summary.requestedSymbols, 5);
  assert.equal(result.summary.successfulSimulations, 0);
  assert.equal(result.summary.failedSimulations, 5);
  assert.equal(result.summary.configuredInitialCapitalTotal, 500);
  assert.equal(result.summary.successfulInitialCapitalTotal, 0);
  assert.equal(result.summary.finalEquityOfSuccessfulSimulations, 0);
  assert.equal(calls.length, 15);
  assert.deepEqual(result.results.map((entry) => entry.symbol), symbols);

  for (const entry of result.results) {
    assert.equal(entry.status, "FAILED");
    assert.match(entry.error, /verified quantity step/);
  }

  assert.match(result.notice, /No live orders are placed/);
});

test("fails each symbol independently when quantity step is unverified", async () => {
  const { fetchImpl } = createFetchMock();

  const result = await runHARMultiSimulation({
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    quoteBalance: 100,
    fetchImpl,
  });

  assert.equal(result.summary.requestedSymbols, 3);
  assert.equal(result.summary.successfulSimulations, 0);
  assert.equal(result.summary.failedSimulations, 3);
  assert.equal(result.summary.successfulInitialCapitalTotal, 0);
  assert.equal(result.summary.finalEquityOfSuccessfulSimulations, 0);
  assert.deepEqual(
    result.results.map((entry) => entry.status),
    ["FAILED", "FAILED", "FAILED"]
  );

  for (const entry of result.results) {
    assert.match(entry.error, /verified quantity step/);
  }
});

test("isolates a market-data request failure from quantity-step failures", async () => {
  const { fetchImpl } = createFetchMock({
    failingSymbols: ["ETHUSDT"],
  });

  const result = await runHARMultiSimulation({
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    quoteBalance: 100,
    fetchImpl,
  });

  assert.equal(result.summary.requestedSymbols, 3);
  assert.equal(result.summary.successfulSimulations, 0);
  assert.equal(result.summary.failedSimulations, 3);
  assert.equal(result.summary.configuredInitialCapitalTotal, 300);
  assert.equal(result.summary.successfulInitialCapitalTotal, 0);
  assert.deepEqual(
    result.results.map((entry) => entry.status),
    ["FAILED", "FAILED", "FAILED"]
  );

  assert.match(result.results[0].error, /verified quantity step/);
  assert.doesNotMatch(result.results[1].error, /verified quantity step/);
  assert.match(result.results[2].error, /verified quantity step/);
});

test("rejects an empty symbol list without fetching market data", async () => {
  let called = false;

  await assert.rejects(
    runHARMultiSimulation({
      symbols: [],
      fetchImpl: async () => {
        called = true;
        throw new Error("Fetch must not run");
      },
    }),
    /non-empty array/
  );

  assert.equal(called, false);
});

test("rejects invalid and duplicate symbols before fetching", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new Error("Fetch must not run");
  };

  await assert.rejects(
    runHARMultiSimulation({
      symbols: ["BTC/USDT"],
      fetchImpl,
    }),
    /normalized/
  );

  await assert.rejects(
    runHARMultiSimulation({
      symbols: ["BTCUSDT", "BTCUSDT"],
      fetchImpl,
    }),
    /Duplicate symbols/
  );

  assert.equal(called, false);
});

test("rejects non-positive initial capital before fetching", async () => {
  let called = false;

  await assert.rejects(
    runHARMultiSimulation({
      symbols: ["BTCUSDT"],
      quoteBalance: 0,
      fetchImpl: async () => {
        called = true;
        throw new Error("Fetch must not run");
      },
    }),
    /positive finite number/
  );

  assert.equal(called, false);
});
