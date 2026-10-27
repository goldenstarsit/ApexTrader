import assert from "node:assert/strict";
import test from "node:test";

import { BotStateStore } from "../src/core/database/abstract-model/bot-state-store.js";

test("abstract state store requires loadState implementation", async () => {
  const store = new BotStateStore();

  await assert.rejects(
    store.loadState(),
    /BotStateStore\.loadState\(\) must be implemented/
  );
});

test("abstract state store requires saveState implementation", async () => {
  const store = new BotStateStore();

  await assert.rejects(
    store.saveState({}),
    /BotStateStore\.saveState\(\) must be implemented/
  );
});
