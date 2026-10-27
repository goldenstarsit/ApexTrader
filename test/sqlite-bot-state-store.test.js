import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SQLiteBotStateStore } from "../src/core/database/sqlite/sqlite-bot-state-store.js";

function sampleState() {
  return {
    quoteBalance: 9902.903,
    baseBalance: 1,
    trades: [
      {
        side: "BUY",
        quantity: 1,
        price: 97,
        total: 97,
        fee: 0.097,
        quoteBalance: 9902.903,
        baseBalance: 1,
      },
    ],
  };
}

async function withDatabase(run) {
  const directory = await mkdtemp(join(tmpdir(), "apex-state-"));
  const databasePath = join(directory, "bot.sqlite");

  try {
    await run(databasePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("new SQLite store has no saved state", async () => {
  await withDatabase(async (databasePath) => {
    const store = new SQLiteBotStateStore({ databasePath });

    try {
      assert.equal(await store.loadState(), null);
    } finally {
      store.close();
    }
  });
});

test("SQLite store saves and reloads a complete state", async () => {
  await withDatabase(async (databasePath) => {
    const store = new SQLiteBotStateStore({ databasePath });
    const state = sampleState();

    try {
      await store.saveState(state);
      assert.deepEqual(await store.loadState(), state);
    } finally {
      store.close();
    }
  });
});

test("saved state survives closing and reopening the database", async () => {
  await withDatabase(async (databasePath) => {
    const first = new SQLiteBotStateStore({ databasePath });
    const state = sampleState();

    try {
      await first.saveState(state);
    } finally {
      first.close();
    }

    const second = new SQLiteBotStateStore({ databasePath });

    try {
      assert.deepEqual(await second.loadState(), state);
    } finally {
      second.close();
    }
  });
});

test("saving another state replaces the previous snapshot", async () => {
  await withDatabase(async (databasePath) => {
    const store = new SQLiteBotStateStore({ databasePath });
    const state = sampleState();
    const updated = {
      quoteBalance: 100,
      baseBalance: 2,
      trades: [],
    };

    try {
      await store.saveState(state);
      await store.saveState(updated);

      assert.deepEqual(await store.loadState(), updated);
    } finally {
      store.close();
    }
  });
});

test("invalid state is rejected without overwriting saved state", async () => {
  await withDatabase(async (databasePath) => {
    const store = new SQLiteBotStateStore({ databasePath });
    const original = sampleState();

    try {
      await store.saveState(original);

      await assert.rejects(
        store.saveState({
          quoteBalance: -1,
          baseBalance: 0,
          trades: [],
        }),
        /quoteBalance must be a non-negative finite number/
      );

      assert.deepEqual(await store.loadState(), original);
    } finally {
      store.close();
    }
  });
});

test("invalid trade data is rejected", async () => {
  await withDatabase(async (databasePath) => {
    const store = new SQLiteBotStateStore({ databasePath });

    try {
      await assert.rejects(
        store.saveState({
          quoteBalance: 100,
          baseBalance: 0,
          trades: [
            {
              side: "HOLD",
              quantity: 1,
              price: 10,
              total: 10,
              fee: 0,
              quoteBalance: 90,
              baseBalance: 1,
            },
          ],
        }),
        /Trade side must be "BUY" or "SELL"/
      );

      assert.equal(await store.loadState(), null);
    } finally {
      store.close();
    }
  });
});
