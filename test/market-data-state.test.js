import assert from "node:assert/strict";
import test from "node:test";

import { mergeMarketResults } from "../src/app/market-data-state.js";

const markets = [
  { symbol: "BTCUSDT", pair: "BTC / USDT" },
  { symbol: "ETHUSDT", pair: "ETH / USDT" },
  { symbol: "BNBUSDT", pair: "BNB / USDT" },
];

const previousData = [
  {
    ...markets[0],
    price: 100,
    change: 1.5,
    freshness: "fresh",
    lastSuccessfulAt: "2026-10-26T10:00:00.000Z",
    errorMessage: null,
  },
];

test("marks successful market results fresh with a successful timestamp", () => {
  const now = "2026-10-27T10:00:00.000Z";

  const result = mergeMarketResults(
    markets,
    [
      {
        status: "fulfilled",
        value: { ...markets[0], price: 110, change: 2 },
      },
      { status: "rejected", reason: new Error("Unavailable") },
      { status: "rejected", reason: new Error("Unavailable") },
    ],
    previousData,
    now,
  );

  assert.equal(result[0].price, 110);
  assert.equal(result[0].freshness, "fresh");
  assert.equal(result[0].lastSuccessfulAt, now);
  assert.equal(result[0].errorMessage, null);
});

test("preserves successful price and timestamp after a later failure", () => {
  const result = mergeMarketResults(
    markets,
    [
      { status: "rejected", reason: new Error("Request timed out") },
      { status: "rejected", reason: new Error("Unavailable") },
      { status: "rejected", reason: new Error("Unavailable") },
    ],
    previousData,
    "2026-10-27T10:00:00.000Z",
  );

  assert.equal(result[0].price, 100);
  assert.equal(result[0].change, 1.5);
  assert.equal(result[0].freshness, "stale");
  assert.equal(
    result[0].lastSuccessfulAt,
    "2026-10-26T10:00:00.000Z",
  );
  assert.equal(result[0].errorMessage, "Request timed out");
});

test("marks a market unavailable and records its failure reason", () => {
  const result = mergeMarketResults(
    markets,
    markets.map(() => ({
      status: "rejected",
      reason: new Error("MEXC unavailable"),
    })),
    [],
  );

  assert.equal(result[1].price, null);
  assert.equal(result[1].change, null);
  assert.equal(result[1].freshness, "unavailable");
  assert.equal(result[1].lastSuccessfulAt, null);
  assert.equal(result[1].errorMessage, "MEXC unavailable");
});

test("updates successful markets independently of failed markets", () => {
  const result = mergeMarketResults(
    markets,
    [
      { status: "rejected", reason: new Error("Timeout") },
      {
        status: "fulfilled",
        value: { ...markets[1], price: 200, change: -1 },
      },
      { status: "rejected", reason: new Error("Unavailable") },
    ],
    previousData,
    "2026-10-27T10:00:00.000Z",
  );

  assert.equal(result[0].freshness, "stale");
  assert.equal(result[0].price, 100);
  assert.equal(result[0].errorMessage, "Timeout");

  assert.equal(result[1].freshness, "fresh");
  assert.equal(result[1].price, 200);
  assert.equal(
    result[1].lastSuccessfulAt,
    "2026-10-27T10:00:00.000Z",
  );

  assert.equal(result[2].freshness, "unavailable");
});
