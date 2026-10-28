import test from "node:test";
import assert from "node:assert/strict";
import { formatAge, formatTimestamp } from "../src/app/market-data-format.js";

test("formatAge handles missing timestamps", () => {
  assert.equal(formatAge(null, Date.now()), "Never");
  assert.equal(formatAge("", Date.now()), "Never");
});

test("formatAge handles invalid timestamps and invalid current time", () => {
  assert.equal(formatAge("not-a-date", Date.now()), "Unknown");
  assert.equal(formatAge("2026-01-01T00:00:00.000Z", Number.NaN), "Unknown");
});

test("formatAge reports seconds and clamps future timestamps to zero", () => {
  const now = Date.parse("2026-01-01T00:00:30.000Z");

  assert.equal(formatAge("2026-01-01T00:00:00.000Z", now), "30s ago");
  assert.equal(formatAge("2026-01-01T00:01:00.000Z", now), "0s ago");
});

test("formatAge reports elapsed minutes, hours, and days", () => {
  const now = Date.parse("2026-01-05T12:00:00.000Z");

  assert.equal(formatAge("2026-01-05T11:59:00.000Z", now), "1m ago");
  assert.equal(formatAge("2026-01-05T09:00:00.000Z", now), "3h ago");
  assert.equal(formatAge("2026-01-03T12:00:00.000Z", now), "2d ago");
});

test("formatTimestamp handles missing timestamps", () => {
  assert.equal(formatTimestamp(null), "Never");
  assert.equal(formatTimestamp(""), "Never");
});

test("formatTimestamp reports invalid dates as Unknown", () => {
  assert.equal(formatTimestamp("not-a-date"), "Unknown");
});

test("formatTimestamp formats valid dates using the runtime locale", () => {
  const timestamp = "2026-01-05T12:34:00.000Z";

  assert.equal(
    formatTimestamp(timestamp),
    new Date(timestamp).toLocaleTimeString(),
  );
});
