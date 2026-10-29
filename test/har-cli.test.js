import assert from "node:assert/strict";
import test from "node:test";

import { runHARPublicSimulation } from "../scripts/har-simulation.js";

function createFetchMock({ includeFilters = true } = {}) {
  const market = {
    symbol: "BTCUSDT",
    status: "1",
    isSpotTradingAllowed: true,
    orderTypes: ["MARKET"],
    tradeSideType: "1",
    filters: includeFilters
      ? [{
          filterType: "PERCENT_PRICE_BY_SIDE",
          bidMultiplierUp: "0.005",
          askMultiplierDown: "0.005",
        }]
      : [],
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

  return async (url) => {
    if (url.includes("/exchangeInfo?")) {
      return { ok: true, json: async () => ({ symbols: [market] }) };
    }

    if (url.includes("/ticker/price?")) {
      return {
        ok: true,
        json: async () => ({ symbol: "BTCUSDT", price: "97" }),
      };
    }

    if (url.includes("/klines?")) {
      return {
        ok: true,
        json: async () =>
          Array.from({ length: 13 }, (_, index) => {
            const openTime = 1_700_000_000_000 - (13 - index) * 300_000;
            return [
              openTime, "100", "101", "99", "100", "10",
              openTime + 300_000,
            ];
          }),
      };
    }

    throw new Error(`Unexpected mock URL: ${url}`);
  };
}

test("HAR simulation rejects an undocumented quantity step without live orders", async () => {
  const requestedPaths = [];
  const mock = createFetchMock();

  await assert.rejects(
    runHARPublicSimulation({
      symbol: "BTCUSDT",
      fetchImpl: async (input, options) => {
        const url = new URL(String(input));
        requestedPaths.push(url.pathname);
        return mock(input, options);
      },
    }),
    /verified quantity step/
  );

  assert.equal(requestedPaths.length, 3);
  assert.ok(requestedPaths.every((path) =>
    ["/api/v3/exchangeInfo", "/api/v3/ticker/price", "/api/v3/klines"].includes(path)
  ));
  assert.ok(!requestedPaths.some((path) => path.endsWith("/order")));
});

test("HAR simulation fails safely when quantity step is unknown", async () => {
  const requestedPaths = [];

  await assert.rejects(
    runHARPublicSimulation({
      symbol: "BTCUSDT",
      fetchImpl: async (input, options) => {
        const url = new URL(String(input));
        requestedPaths.push(url.pathname);
        return createFetchMock({ includeFilters: false })(input, options);
      },
    }),
    /verified quantity step/
  );

  assert.equal(requestedPaths.length, 3);
  assert.ok(requestedPaths.every((path) =>
    ["/api/v3/exchangeInfo", "/api/v3/ticker/price", "/api/v3/klines"].includes(path)
  ));
  assert.ok(!requestedPaths.some((path) => path.endsWith("/order")));
});

test("HAR CLI rejects an invalid symbol before making requests", async () => {
  let called = false;

  await assert.rejects(
    runHARPublicSimulation({
      symbol: "BTC/USDT",
      fetchImpl: async () => {
        called = true;
        throw new Error("Fetch must not run");
      },
    }),
    /normalized MEXC symbol/
  );

  assert.equal(called, false);
});
