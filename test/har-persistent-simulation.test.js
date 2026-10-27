import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { TestBalance } from "../src/core/balance/test-balance.js";
import { SQLiteBotStateStore } from "../src/core/database/sqlite/sqlite-bot-state-store.js";
import { RiskManager } from "../src/core/risk/abstract-model/risk-manager.js";
import { HARConfiguration } from "../src/core/strategies/har/har-configuration.js";
import { runPersistentHARSimulation } from "../src/core/strategies/har/run-har-simulation.js";

function makeConfiguration(overrides = {}) {
  return new HARConfiguration({
    id: "har-persistent-test",
    name: "HAR Persistent Test",
    exchange: "simulation",
    symbol: "BTC/USDT",
    averagePeriodMinutes: 60,
    priceCheckIntervalMinutes: 5,
    rangeMode: "percentage",
    rangeValue: 2,
    enabled: true,
    ...overrides,
  });
}

function makeRiskManager(overrides = {}) {
  return new RiskManager({
    maxTradeValue: 10000,
    ...overrides,
  });
}

const historicalPrices = Array(12).fill(100);

test("persistent HAR saves each trade and restores state after SQLite restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "apex-har-persist-"));
  const databasePath = join(directory, "bot.sqlite");
  let store;

  try {
    store = new SQLiteBotStateStore({ databasePath });

    const balance = await TestBalance.create({
      store,
      quoteBalance: 10000,
      baseBalance: 1,
    });

    const result = await runPersistentHARSimulation({
      configuration: makeConfiguration(),
      historicalPrices,
      prices: [97, 103],
      balance,
      quantity: 1,
      riskManager: makeRiskManager(),
    });

    assert.deepEqual(
      result.steps.map((step) => step.signal),
      ["BUY", "SELL"]
    );
    assert.deepEqual(
      result.steps.map((step) => step.trade.side),
      ["BUY", "SELL"]
    );
    assert.equal(result.finalBalance.quoteBalance, 10006);
    assert.equal(result.finalBalance.baseBalance, 1);
    assert.equal(result.finalBalance.trades.length, 2);

    const expectedState = result.finalBalance;

    store.close();
    store = null;

    const reopenedStore = new SQLiteBotStateStore({ databasePath });

    try {
      const restoredBalance = await TestBalance.create({
        store: reopenedStore,
      });

      assert.deepEqual(restoredBalance.snapshot(), expectedState);
    } finally {
      reopenedStore.close();
    }
  } finally {
    if (store) {
      store.close();
    }

    await rm(directory, { recursive: true, force: true });
  }
});

test("persistent HAR NO_ACTION does not add a trade", async () => {
  let saveCount = 0;

  const store = {
    async loadState() {
      return null;
    },
    async saveState() {
      saveCount += 1;
    },
  };

  const balance = await TestBalance.create({ store });
  const initialSaveCount = saveCount;
  const before = balance.snapshot();

  const result = await runPersistentHARSimulation({
    configuration: makeConfiguration(),
    historicalPrices,
    prices: [100],
    balance,
    quantity: 1,
    riskManager: makeRiskManager(),
  });

  assert.equal(result.steps[0].signal, "NO_ACTION");
  assert.equal(result.steps[0].trade, null);
  assert.deepEqual(balance.snapshot(), before);
  assert.equal(saveCount, initialSaveCount);
});

test("persistent HAR restores in-memory balance when saving a trade fails", async () => {
  let failSave = false;

  const store = {
    async loadState() {
      return null;
    },
    async saveState() {
      if (failSave) {
        throw new Error("simulated storage failure");
      }
    },
  };

  const balance = await TestBalance.create({ store });
  const before = balance.snapshot();

  failSave = true;

  await assert.rejects(
    runPersistentHARSimulation({
      configuration: makeConfiguration(),
      historicalPrices,
      prices: [97],
      balance,
      quantity: 1,
      riskManager: makeRiskManager(),
    }),
    /simulated storage failure/
  );

  assert.deepEqual(balance.snapshot(), before);
});

test("persistent HAR stops before the next price when saving a trade fails", async () => {
  let saveAttempts = 0;
  let failSave = false;

  const store = {
    async loadState() {
      return null;
    },
    async saveState() {
      saveAttempts += 1;

      if (failSave) {
        throw new Error("simulated storage failure");
      }
    },
  };

  const balance = await TestBalance.create({ store });
  const before = balance.snapshot();

  failSave = true;

  await assert.rejects(
    runPersistentHARSimulation({
      configuration: makeConfiguration(),
      historicalPrices,
      prices: [97, 103],
      balance,
      quantity: 1,
      riskManager: makeRiskManager(),
    }),
    /simulated storage failure/
  );

  assert.equal(saveAttempts, 2);
  assert.deepEqual(balance.snapshot(), before);
});
