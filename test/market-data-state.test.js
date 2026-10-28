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
  },
];

test("marks successful market results as fresh", () => {
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
  );

  assert.equal(result[0].price, 110);
  assert.equal(result[0].freshness, "fresh");
});

test("preserves the last successful value as stale after failure", () => {
  const result = mergeMarketResults(
    markets,
    [
      { status: "rejected", reason: new Error("Timeout") },
      { status: "rejected", reason: new Error("Unavailable") },
      { status: "rejected", reason: new Error("Unavailable") },
    ],
    previousData,
  );

  assert.equal(result[0].price, 100);
  assert.equal(result[0].change, 1.5);
  assert.equal(result[0].freshness, "stale");
});

test("marks a market unavailable when no successful value exists", () => {
  const result = mergeMarketResults(
    markets,
    markets.map(() => ({
      status: "rejected",
      reason: new Error("Unavailable"),
    })),
    [],
  );

  assert.equal(result[1].price, null);
  assert.equal(result[1].change, null);
  assert.equal(result[1].freshness, "unavailable");
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
  );

  assert.equal(result[0].freshness, "stale");
  assert.equal(result[0].price, 100);
  assert.equal(result[1].freshness, "fresh");
  assert.equal(result[1].price, 200);
  assert.equal(result[2].freshness, "unavailable");
});
