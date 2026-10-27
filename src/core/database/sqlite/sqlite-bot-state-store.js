import { DatabaseSync } from "node:sqlite";

import { BotStateStore } from "../abstract-model/bot-state-store.js";

function validateState(state) {
  if (
    !state ||
    typeof state !== "object" ||
    Array.isArray(state)
  ) {
    throw new TypeError("State must be an object.");
  }

  for (const key of ["quoteBalance", "baseBalance"]) {
    if (
      typeof state[key] !== "number" ||
      !Number.isFinite(state[key]) ||
      state[key] < 0
    ) {
      throw new RangeError(
        `${key} must be a non-negative finite number.`
      );
    }
  }

  if (!Array.isArray(state.trades)) {
    throw new TypeError("State trades must be an array.");
  }

  for (const trade of state.trades) {
    if (!trade || typeof trade !== "object" || Array.isArray(trade)) {
      throw new TypeError("Each trade must be an object.");
    }

    if (trade.side !== "BUY" && trade.side !== "SELL") {
      throw new RangeError('Trade side must be "BUY" or "SELL".');
    }

    for (const key of [
      "quantity",
      "price",
      "total",
      "fee",
      "quoteBalance",
      "baseBalance",
    ]) {
      if (
        typeof trade[key] !== "number" ||
        !Number.isFinite(trade[key]) ||
        trade[key] < 0
      ) {
        throw new RangeError(
          `Trade ${key} must be a non-negative finite number.`
        );
      }
    }

    if (trade.quantity === 0 || trade.price === 0) {
      throw new RangeError(
        "Trade quantity and price must be positive."
      );
    }
  }

  return JSON.stringify(state);
}

export class SQLiteBotStateStore extends BotStateStore {
  constructor({ databasePath } = {}) {
    super();

    if (
      typeof databasePath !== "string" ||
      databasePath.trim() === ""
    ) {
      throw new TypeError("databasePath must be a non-empty string.");
    }

    this.database = new DatabaseSync(databasePath);

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS bot_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    this.selectState = this.database.prepare(
      "SELECT state_json FROM bot_state WHERE id = 1"
    );

    this.writeState = this.database.prepare(`
      INSERT INTO bot_state (id, state_json, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `);
  }

  async loadState() {
    const row = this.selectState.get();

    if (!row) {
      return null;
    }

    const state = JSON.parse(row.state_json);
    validateState(state);

    return state;
  }

  async saveState(state) {
    const stateJson = validateState(state);

    this.database.exec("BEGIN IMMEDIATE");

    try {
      this.writeState.run(stateJson, new Date().toISOString());
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}
