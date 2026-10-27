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

function createFetchMock({ failingSymbols = [] } = {}) {
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
      filters: [{ stepSize: "0.001" }],
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
          Array.from({ length: 12 }, (_, index) => [
            index,
            "100",
            "101",
            "99",
            "100",
          ]),
      };
    }

    throw new Error(`Unexpected mock URL: ${url}`);
  };

  return { fetchImpl, calls };
}

test("runs five independent HAR simulations with 100 USDT each", async () => {
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
  assert.equal(result.summary.successfulSimulations, 5);
  assert.equal(result.summary.failedSimulations, 0);
  assert.equal(result.summary.configuredInitialCapitalTotal, 500);
  assert.equal(result.summary.successfulInitialCapitalTotal, 500);
  assert.equal(calls.length, 15);

  assert.deepEqual(
    result.results.map((entry) => entry.symbol),
    symbols
  );

  for (const entry of result.results) {
    assert.equal(entry.status, "SUCCESS");
    assert.equal(entry.result.mode, "SIMULATION_ONLY");
    assert.equal(entry.result.configuration.rangeValue, 0.5);
    assert.equal(entry.result.finalBalance.trades.length, 1);
    assert.ok(entry.result.finalBalance.quoteBalance < 100);
    assert.ok(entry.result.finalBalance.baseBalance > 0);
    assert.ok(Number.isFinite(entry.finalEquity));
  }

  const expectedEquity = result.results.reduce(
    (total, entry) => total + entry.finalEquity,
    0
  );

  assert.ok(
    Math.abs(
      result.summary.finalEquityOfSuccessfulSimulations - expectedEquity
    ) < 1e-10
  );
  assert.match(result.notice, /No live orders are placed/);
});

test("continues other currencies when one market-data request fails", async () => {
  const { fetchImpl } = createFetchMock({
    failingSymbols: ["ETHUSDT"],
  });

  const result = await runHARMultiSimulation({
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    quoteBalance: 100,
    fetchImpl,
  });

  assert.equal(result.summary.requestedSymbols, 3);
  assert.equal(result.summary.successfulSimulations, 2);
  assert.equal(result.summary.failedSimulations, 1);
  assert.equal(result.summary.configuredInitialCapitalTotal, 300);
  assert.equal(result.summary.successfulInitialCapitalTotal, 200);

  assert.deepEqual(
    result.results.map((entry) => entry.status),
    ["SUCCESS", "FAILED", "SUCCESS"]
  );
  assert.equal(result.results[1].symbol, "ETHUSDT");
  assert.equal(typeof result.results[1].error, "string");
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
