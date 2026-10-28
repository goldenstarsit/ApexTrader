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

    const now = 1_700_000_000_000;
    const intervalMs = 5 * 60_000;

    return {
      ok: true,
      status: 200,
      json: async () =>
        Array.from({ length: candleCount }, (_, index) => {
          const openTime = now - (candleCount - index) * intervalMs;
          return [
            openTime,
            "99",
            "101",
            "98",
            String(100 + index),
            "10",
            openTime + intervalMs,
          ];
        }),
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

test("accepts numeric tradeSideType 1 from the MEXC API", async () => {
  const { fetchImpl } = createFetch({ tradeSideType: 1 });

  const result = await getMexcPublicMarketData({
    symbol: "BTCUSDT",
    limit: 2,
    fetchImpl,
  });

  assert.equal(result.symbol, "BTCUSDT");
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


test("reads the current timestamp only once", async () => {
  const { fetchImpl } = createFetch();
  let calls = 0;

  const result = await getMexcPublicMarketData({
    symbol: "BTCUSDT",
    limit: 2,
    fetchImpl,
    now: () => {
      calls += 1;
      return 1_800_000_000_000;
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(result.closingPrices, [100, 101]);
});

test("rejects candle timestamps whose interval end exceeds safe integer range", async () => {
  const { fetchImpl } = createFetch();

  await assert.rejects(
    getMexcPublicMarketData({
      symbol: "BTCUSDT",
      limit: 2,
      fetchImpl: async (url, options) => {
        const response = await fetchImpl(url, options);
        if (String(url).includes("/klines")) {
          const candles = await response.json();
          const unsafeOpenTime = Number.MAX_SAFE_INTEGER - 100_000;
          candles[0][0] = unsafeOpenTime;
          candles[0][6] = unsafeOpenTime + 299_999;
          return { ...response, json: async () => candles };
        }
        return response;
      },
    }),
    /invalid timestamps/
  );
});

test("rejects 1000 requested candles when the final API candle is incomplete", async () => {
  const { fetchImpl, requests } = createFetch({ candleCount: 1000 });

  await assert.rejects(
    getMexcPublicMarketData({
      symbol: "BTCUSDT",
      limit: 1000,
      fetchImpl,
      now: () => 1_700_000_000_000 - 1,
    }),
    /too few completed candles/
  );

  const klineRequest = requests.find((url) => url.includes("/klines?"));
  assert.match(klineRequest, /limit=1000(?:&|$)/);
});

test("rejects a non-finite current timestamp", async () => {
  const { fetchImpl } = createFetch();

  await assert.rejects(
    getMexcPublicMarketData({
      symbol: "BTCUSDT",
      limit: 2,
      fetchImpl,
      now: () => Number.NaN,
    }),
    /finite timestamp/
  );
});
