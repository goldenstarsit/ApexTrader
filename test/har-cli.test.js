import assert from "node:assert/strict";
import test from "node:test";

import { runHARPublicSimulation } from "../scripts/har-simulation.js";

function createFetchMock() {
  const market = {
    symbol: "BTCUSDT",
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

test("HAR CLI runs one public-data simulation step without live orders", async () => {
  const result = await runHARPublicSimulation({
    symbol: "BTCUSDT",
    fetchImpl: createFetchMock(),
  });

  assert.equal(result.mode, "SIMULATION_ONLY");
  assert.equal(result.symbol, "BTCUSDT");
  assert.equal(result.currentPrice, 97);
  assert.equal(result.historicalCloseCount, 12);
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0].signal, "BUY");
  assert.equal(result.finalBalance.trades.length, 1);
  assert.match(result.notice, /No live orders are placed/);
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
