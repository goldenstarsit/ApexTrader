import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/har-simulation/route.js";

function makeRequest(body, options = {}) {
  return new Request("http://localhost/api/har-simulation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    ...options,
  });
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

function createMarketFetch() {
  const requests = [];

  return {
    requests,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      requests.push(url);

      if (url.pathname.endsWith("/exchangeInfo")) {
        return Response.json({
          symbols: [{
            symbol: "BTCUSDT",
            status: "1",
            isSpotTradingAllowed: true,
            orderTypes: ["MARKET"],
            tradeSideType: "1",
            filters: [],
            baseSizePrecision: "0.001",
            baseAssetPrecision: 8,
            quoteAssetPrecision: 2,
            quoteAmountPrecision: "1",
            quoteAmountPrecisionMarket: "1",
            maxQuoteAmount: "100000",
            maxQuoteAmountMarket: "100000",
            makerCommission: "0.001",
            takerCommission: "0.001",
          }],
        });
      }

      if (url.pathname.endsWith("/ticker/price")) {
        return Response.json({ symbol: "BTCUSDT", price: "100" });
      }

      if (url.pathname.endsWith("/klines")) {
        const count = Number(url.searchParams.get("limit"));
        const intervalMs = 5 * 60_000;
        const latestOpen =
          Math.floor(Date.now() / intervalMs) * intervalMs - intervalMs;

        return Response.json(
          Array.from({ length: count }, (_, index) => {
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
          }),
        );
      }

      throw new Error("Unexpected test URL.");
    },
  };
}

test("rejects malformed JSON without requesting market data", async () => {
  let calls = 0;

  await withMockFetch(async () => {
    calls += 1;
    throw new Error("Fetch must not be called.");
  }, async () => {
    const response = await POST(makeRequest("{"));
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "INVALID_JSON");
    assert.equal(calls, 0);
  });
});

test("rejects invalid bodies and symbols before requesting market data", async () => {
  const cases = [
    ["null", "INVALID_BODY"],
    ["[]", "INVALID_BODY"],
    ["{}", "INVALID_SYMBOL"],
    [JSON.stringify({ symbol: "BTC/USDT" }), "INVALID_SYMBOL"],
    [JSON.stringify({ symbol: "btcusdt" }), "INVALID_SYMBOL"],
  ];

  let calls = 0;

  await withMockFetch(async () => {
    calls += 1;
    throw new Error("Fetch must not be called.");
  }, async () => {
    for (const [bodyText, expectedCode] of cases) {
      const response = await POST(makeRequest(bodyText));
      const body = await response.json();

      assert.equal(response.status, 400, bodyText);
      assert.equal(body.error.code, expectedCode, bodyText);
    }
  });

  assert.equal(calls, 0);
});

test("rejects invalid numeric settings before requesting market data", async () => {
  const cases = [
    [{ quoteBalance: -1 }, "INVALID_QUOTE_BALANCE"],
    [{ baseBalance: -1 }, "INVALID_BASE_BALANCE"],
    [{ rangeValue: 0 }, "INVALID_RANGE_VALUE"],
    [{ rangeValue: 100 }, "INVALID_RANGE_VALUE"],
    [{ maxTradeValue: 0 }, "INVALID_MAX_TRADE_VALUE"],
    [{ maxTradeValue: "100" }, "INVALID_MAX_TRADE_VALUE"],
  ];

  let calls = 0;

  await withMockFetch(async () => {
    calls += 1;
    throw new Error("Fetch must not be called.");
  }, async () => {
    for (const [settings, expectedCode] of cases) {
      const response = await POST(
        makeRequest(JSON.stringify({ symbol: "BTCUSDT", ...settings })),
      );
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.error.code, expectedCode);
    }
  });

  assert.equal(calls, 0);
});

test("blocks simulation when the quantity step is unverified", async () => {
  const { fetchImpl, requests } = createMarketFetch();

  await withMockFetch(fetchImpl, async () => {
    const response = await POST(
      makeRequest(JSON.stringify({ symbol: "BTCUSDT" })),
    );
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.error.code, "SIMULATION_BLOCKED");
    assert.equal(
      body.error.message,
      "Simulation cannot calculate a safe trade because required MEXC market rules are unverified.",
    );
    assert.equal(requests.length, 3);
    assert.ok(
      requests.every((url) =>
        ["/api/v3/exchangeInfo", "/api/v3/ticker/price", "/api/v3/klines"]
          .includes(url.pathname),
      ),
    );
    assert.equal(
      requests.some((url) => /\/order\/?$/.test(url.pathname)),
      false,
    );
  });
});

test("returns a safe 502 response when market data is unavailable", async () => {
  await withMockFetch(async () => {
    throw new Error("Private upstream diagnostic.");
  }, async () => {
    const response = await POST(
      makeRequest(JSON.stringify({ symbol: "BTCUSDT" })),
    );
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.error.code, "SIMULATION_UNAVAILABLE");
    assert.equal(
      JSON.stringify(body).includes("Private upstream diagnostic."),
      false,
    );
  });
});

test("returns 504 when market data times out", async () => {
  await withMockFetch(async () => {
    const error = new Error("Simulated timeout.");
    error.name = "TimeoutError";
    throw error;
  }, async () => {
    const response = await POST(
      makeRequest(JSON.stringify({ symbol: "BTCUSDT" })),
    );
    const body = await response.json();

    assert.equal(response.status, 504);
    assert.equal(body.error.code, "MARKET_DATA_TIMEOUT");
  });
});
