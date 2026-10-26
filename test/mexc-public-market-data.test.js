import test from "node:test";
import assert from "node:assert/strict";
import { getMexcPublicMarketData } from "../src/core/strategies/har/mexc-public-market-data.js";

function createFetch({
  status = "1",
  spotAllowed = true,
  orderTypes = ["LIMIT", "MARKET"],
  tradeSideType = "1",
  tickerPrice = "100",
  candleCount = 2,
  httpStatus = 200,
  filters = [],
  quoteAmountPrecision = "5",
  quoteAmountPrecisionMarket = "1",
  maxQuoteAmount = "5000000",
  maxQuoteAmountMarket = "4000000",
  makerCommission = 0.001,
  takerCommission = 0.002,
} = {}) {
  const requests = [];

  const fetchImpl = async (url) => {
    requests.push(String(url));

    if (httpStatus !== 200) {
      return {
        ok: false,
        status: httpStatus,
        json: async () => ({}),
      };
    }

    if (String(url).includes("/exchangeInfo")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          symbols: [
            {
              symbol: "BTCUSDT",
              status,
              isSpotTradingAllowed: spotAllowed,
              orderTypes,
              tradeSideType,
              baseSizePrecision: "0.000001",
              baseAssetPrecision: 8,
              quoteAssetPrecision: 2,
              quoteAmountPrecision,
              quoteAmountPrecisionMarket,
              maxQuoteAmount,
              maxQuoteAmountMarket,
              makerCommission,
              takerCommission,
              filters,
            },
          ],
        }),
      };
    }

    if (String(url).includes("/ticker/price")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          symbol: "BTCUSDT",
          price: tickerPrice,
        }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () =>
        Array.from({ length: candleCount }, (_, index) => [
          index,
          "99",
          "101",
          "98",
          String(100 + index),
          "10",
        ]),
    };
  };

  return { fetchImpl, requests };
}

test("loads MEXC market rules, ticker and candle closes", async () => {
  const { fetchImpl, requests } = createFetch();

  const result = await getMexcPublicMarketData({
    symbol: "BTCUSDT",
    limit: 2,
    fetchImpl,
  });

  assert.equal(requests.length, 3);
  assert.equal(result.exchange, "MEXC");
  assert.equal(result.price, 100);
  assert.deepEqual(result.closingPrices, [100, 101]);
  assert.equal(result.rules.quantityStep, null);
  assert.equal(result.rules.minQuantity, 0.000001);
  assert.equal(result.rules.quoteAmountPrecision, 5);
  assert.equal(result.rules.quoteAmountPrecisionMarket, 1);
  assert.equal(result.rules.maxQuoteAmount, 5000000);
  assert.equal(result.rules.maxQuoteAmountMarket, 4000000);
  assert.equal(result.rules.takerCommission, 0.002);
});

test("rejects missing or empty MEXC commission metadata", async () => {
  for (const field of ["makerCommission", "takerCommission"]) {
    for (const value of [null, "", "   "]) {
      const { fetchImpl } = createFetch({ [field]: value });

      await assert.rejects(
        getMexcPublicMarketData({
          symbol: "BTCUSDT",
          limit: 2,
          fetchImpl,
        }),
        /commission metadata is invalid/
      );
    }
  }
});

test("maps market minimum quantity and quote amount separately", async () => {
  const { fetchImpl } = createFetch();

  const result = await getMexcPublicMarketData({
    symbol: "BTCUSDT",
    limit: 2,
    fetchImpl,
  });

  assert.equal(result.rules.quoteAmountPrecision, 5);
  assert.equal(result.rules.quoteAmountPrecisionMarket, 1);
  assert.equal(result.rules.maxQuoteAmount, 5000000);
  assert.equal(result.rules.maxQuoteAmountMarket, 4000000);
  assert.equal(result.rules.minQuantity, 0.000001);
  assert.equal(result.rules.quantityStep, null);
});

test("does not substitute normal-order limits for missing market-order limits", async () => {
  const { fetchImpl } = createFetch({
    quoteAmountPrecisionMarket: null,
    maxQuoteAmountMarket: null,
  });

  const result = await getMexcPublicMarketData({
    symbol: "BTCUSDT",
    limit: 2,
    fetchImpl,
  });

  assert.equal(result.rules.quoteAmountPrecision, 5);
  assert.equal(result.rules.maxQuoteAmount, 5000000);
  assert.equal(result.rules.quoteAmountPrecisionMarket, null);
  assert.equal(result.rules.maxQuoteAmountMarket, null);
});

test("uses an explicitly supplied filter stepSize", async () => {
  const { fetchImpl } = createFetch({
    filters: [{ stepSize: "0.00001" }],
  });

  const result = await getMexcPublicMarketData({
    symbol: "BTCUSDT",
    limit: 2,
    fetchImpl,
  });

  assert.equal(result.rules.quantityStep, 0.00001);
});

test("rejects a market that does not support MARKET orders", async () => {
  const { fetchImpl } = createFetch({ orderTypes: ["LIMIT"] });

  await assert.rejects(
    getMexcPublicMarketData({
      symbol: "BTCUSDT",
      limit: 2,
      fetchImpl,
    }),
    /does not support MARKET orders/
  );
});

test("rejects a market that permits BUY but not SELL", async () => {
  const { fetchImpl } = createFetch({ tradeSideType: "2" });

  await assert.rejects(
    getMexcPublicMarketData({
      symbol: "BTCUSDT",
      limit: 2,
      fetchImpl,
    }),
    /does not permit both BUY and SELL/
  );
});

test("rejects a market with an unknown trade-side policy", async () => {
  const { fetchImpl } = createFetch({ tradeSideType: "4" });

  await assert.rejects(
    getMexcPublicMarketData({
      symbol: "BTCUSDT",
      limit: 2,
      fetchImpl,
    }),
    /does not permit both BUY and SELL/
  );
});

test("rejects a disabled Spot market", async () => {
  const { fetchImpl } = createFetch({ spotAllowed: false });

  await assert.rejects(
    getMexcPublicMarketData({
      symbol: "BTCUSDT",
      limit: 2,
      fetchImpl,
    }),
    /not enabled/
  );
});

test("rejects a market with a disabled status", async () => {
  const { fetchImpl } = createFetch({ status: "0" });

  await assert.rejects(
    getMexcPublicMarketData({
      symbol: "BTCUSDT",
      limit: 2,
      fetchImpl,
    }),
    /not enabled/
  );
});

test("rejects an invalid ticker price", async () => {
  const { fetchImpl } = createFetch({ tickerPrice: "0" });

  await assert.rejects(
    getMexcPublicMarketData({
      symbol: "BTCUSDT",
      limit: 2,
      fetchImpl,
    }),
    /positive finite number/
  );
});

test("rejects an unexpected candle count", async () => {
  const { fetchImpl } = createFetch({ candleCount: 1 });

  await assert.rejects(
    getMexcPublicMarketData({
      symbol: "BTCUSDT",
      limit: 2,
      fetchImpl,
    }),
    /unexpected number of candles/
  );
});

test("rejects an invalid symbol or limit", async () => {
  const { fetchImpl } = createFetch();

  await assert.rejects(
    getMexcPublicMarketData({
      symbol: "BTC/USDT",
      limit: 2,
      fetchImpl,
    }),
    /normalized MEXC symbol/
  );

  await assert.rejects(
    getMexcPublicMarketData({
      symbol: "BTCUSDT",
      limit: 0,
      fetchImpl,
    }),
    /limit must be an integer/
  );
});

test("rejects an HTTP failure", async () => {
  const { fetchImpl } = createFetch({ httpStatus: 503 });

  await assert.rejects(
    getMexcPublicMarketData({
      symbol: "BTCUSDT",
      limit: 2,
      fetchImpl,
    }),
    /HTTP 503/
  );
});
