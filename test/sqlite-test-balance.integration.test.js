import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { TestBalance } from "../src/core/balance/test-balance.js";
import { SQLiteBotStateStore } from "../src/core/database/sqlite/sqlite-bot-state-store.js";

test("TestBalance restores persisted trades after SQLite restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "apex-balance-"));
  const databasePath = join(directory, "bot.sqlite");
  let firstStore;

  try {
    firstStore = new SQLiteBotStateStore({ databasePath });

    const firstBalance = await TestBalance.create({
      store: firstStore,
      quoteBalance: 500,
      baseBalance: 0,
    });

    await firstBalance.buyAndPersist(2, 100, { fee: 1 });

    const expectedState = firstBalance.snapshot();

    assert.equal(expectedState.quoteBalance, 299);
    assert.equal(expectedState.baseBalance, 2);
    assert.equal(expectedState.trades.length, 1);

    firstStore.close();
    firstStore = null;

    const reopenedStore = new SQLiteBotStateStore({ databasePath });

    try {
      const restoredBalance = await TestBalance.create({
        store: reopenedStore,
      });

      assert.deepEqual(restoredBalance.snapshot(), expectedState);

      await restoredBalance.sellAndPersist(1, 150, { fee: 1 });

      assert.equal(restoredBalance.quoteBalance, 448);
      assert.equal(restoredBalance.baseBalance, 1);
      assert.equal(restoredBalance.snapshot().trades.length, 2);
    } finally {
      reopenedStore.close();
    }
  } finally {
    if (firstStore) {
      firstStore.close();
    }

    await rm(directory, { recursive: true, force: true });
  }
});
