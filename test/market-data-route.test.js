import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/market-data/route.js";

const intervalMs = 5 * 60_000;

function createMockFetch() {
  const requests = [];

  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    requests.push(url);

    if (url.pathname.endsWith("/exchangeInfo")) {
      return Response.json({
        symbols: [
          {
            symbol: "BTCUSDT",
            status: "1",
            isSpotTradingAllowed: true,
            orderTypes: ["LIMIT", "MARKET"],
            tradeSideType: "1",
            baseSizePrecision: "0.000001",
            baseAssetPrecision: 8,
            quoteAssetPrecision: 2,
            quoteAmountPrecision: "5",
            quoteAmountPrecisionMarket: "1",
            maxQuoteAmount: "5000000",
            maxQuoteAmountMarket: "4000000",
            makerCommission: 0.001,
            takerCommission: 0.002,
            filters: [],
          },
        ],
      });
    }

    if (url.pathname.endsWith("/ticker/price")) {
      return Response.json({
        symbol: "BTCUSDT",
        price: "100",
      });
    }

    if (url.pathname.endsWith("/klines")) {
      const count = Number(url.searchParams.get("limit"));
      const latestOpen =
        Math.floor(Date.now() / intervalMs) * intervalMs -
        intervalMs;

      const candles = Array.from({ length: count }, (_, index) => {
        const openTime =
          latestOpen - (count - index - 1) * intervalMs;

        return [
          openTime,
          "99",
          "101",
          "98",
          String(100 + index),
          "10",
          openTime + intervalMs - 1,
        ];
      });

      return Response.json(candles);
    }

    throw new Error("Unexpected test URL.");
  };

  return { fetchImpl, requests };
}

async function withMockFetch(fetchImpl, operation) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;

  try {
    return await operation();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function makeRequest(query = "") {
  return new Request(
    `http://localhost/api/market-data${query ? `?${query}` : ""}`
  );
}

test("returns public MEXC market data using default parameters", async () => {
  const { fetchImpl, requests } = createMockFetch();

  await withMockFetch(fetchImpl, async () => {
    const response = await GET(makeRequest());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.exchange, "MEXC");
    assert.equal(body.data.symbol, "BTCUSDT");
    assert.equal(body.data.price, 100);
    assert.equal(body.data.closingPrices.length, 12);
    assert.equal(requests.length, 3);
    assert.ok(requests.every((url) => url.hostname === "api.mexc.com"));
  });
});

test("accepts a valid symbol, interval and candle limit", async () => {
  const { fetchImpl, requests } = createMockFetch();

  await withMockFetch(fetchImpl, async () => {
    const response = await GET(
      makeRequest("symbol=BTCUSDT&interval=5m&limit=2")
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.closingPrices.length, 2);

    const candlesRequest = requests.find((url) =>
      url.pathname.endsWith("/klines")
    );

    assert.equal(candlesRequest.searchParams.get("limit"), "3");
  });
});

test("rejects invalid symbols without requesting the exchange", async () => {
  let calls = 0;

  await withMockFetch(async () => {
    calls += 1;
    throw new Error("Fetch must not be called.");
  }, async () => {
    const response = await GET(makeRequest("symbol=BTC%2FUSDT"));
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "INVALID_SYMBOL");
    assert.equal(calls, 0);
  });
});

test("rejects unsupported intervals and invalid limits", async () => {
  const cases = [
    ["interval=1M", "INVALID_INTERVAL"],
    ["limit=0", "INVALID_LIMIT"],
    ["limit=101", "INVALID_LIMIT"],
    ["limit=2.5", "INVALID_LIMIT"],
    ["limit=abc", "INVALID_LIMIT"],
  ];

  await withMockFetch(async () => {
    throw new Error("Fetch must not be called.");
  }, async () => {
    for (const [query, expectedCode] of cases) {
      const response = await GET(makeRequest(query));
      const body = await response.json();

      assert.equal(response.status, 400, query);
      assert.equal(body.error.code, expectedCode, query);
    }
  });
});

test("returns a safe 502 response when MEXC is unavailable", async () => {
  await withMockFetch(async () => {
    throw new Error("Private upstream diagnostic.");
  }, async () => {
    const response = await GET(makeRequest());
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.error.code, "MARKET_DATA_UNAVAILABLE");
    assert.equal(
      body.error.message,
      "MEXC public market data is temporarily unavailable."
    );
    assert.equal(JSON.stringify(body).includes("Private upstream diagnostic."), false);
  });
});

test("returns 504 when the MEXC request times out", async () => {
  await withMockFetch(async () => {
    const error = new Error("Simulated timeout.");
    error.name = "TimeoutError";
    throw error;
  }, async () => {
    const response = await GET(makeRequest());
    const body = await response.json();

    assert.equal(response.status, 504);
    assert.equal(body.error.code, "MARKET_DATA_TIMEOUT");
  });
});
