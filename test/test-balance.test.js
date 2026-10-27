import assert from "node:assert/strict";
import test from "node:test";

import { TestBalance } from "../src/core/balance/test-balance.js";

test("starts with the configured simulation balances", () => {
  const balance = new TestBalance();

  assert.deepEqual(balance.snapshot(), {
    quoteBalance: 10000,
    baseBalance: 0,
    trades: [],
  });
});

test("BUY reduces quote balance and increases base balance", () => {
  const balance = new TestBalance();

  const trade = balance.buy(2, 100);

  assert.equal(trade.side, "BUY");
  assert.equal(trade.total, 200);
  assert.equal(balance.quoteBalance, 9800);
  assert.equal(balance.baseBalance, 2);
  assert.equal(balance.snapshot().trades.length, 1);
});

test("SELL increases quote balance and reduces base balance", () => {
  const balance = new TestBalance({ quoteBalance: 500, baseBalance: 3 });

  const trade = balance.sell(2, 100);

  assert.equal(trade.side, "SELL");
  assert.equal(trade.total, 200);
  assert.equal(balance.quoteBalance, 700);
  assert.equal(balance.baseBalance, 1);
});

test("rejects BUY when quote balance is insufficient", () => {
  const balance = new TestBalance({ quoteBalance: 50 });

  assert.throws(() => balance.buy(1, 100), /Insufficient quote balance/);
  assert.equal(balance.quoteBalance, 50);
  assert.equal(balance.baseBalance, 0);
  assert.equal(balance.snapshot().trades.length, 0);
});

test("rejects SELL when base balance is insufficient", () => {
  const balance = new TestBalance({ baseBalance: 1 });

  assert.throws(() => balance.sell(2, 100), /Insufficient base balance/);
  assert.equal(balance.quoteBalance, 10000);
  assert.equal(balance.baseBalance, 1);
  assert.equal(balance.snapshot().trades.length, 0);
});

test("rejects non-positive or invalid trade inputs", () => {
  const balance = new TestBalance();

  assert.throws(() => balance.buy(0, 100), RangeError);
  assert.throws(() => balance.buy(1, Infinity), RangeError);
  assert.throws(() => balance.sell(-1, 100), RangeError);
});

test("snapshot trade records cannot mutate the internal trade history", () => {
  const balance = new TestBalance();
  balance.buy(1, 100);

  const snapshot = balance.snapshot();
  snapshot.trades[0].side = "SELL";

  assert.equal(balance.snapshot().trades[0].side, "BUY");
});

test("BUY accepts exact decimal cost and never leaves a negative quote balance", () => {
  const balance = new TestBalance({
    quoteBalance: 0.3,
    baseBalance: 0,
  });

  const trade = balance.buy(3, 0.1);

  assert.equal(trade.side, "BUY");
  assert.equal(balance.quoteBalance, 0);
  assert.equal(balance.baseBalance, 3);
  assert.equal(balance.snapshot().trades.length, 1);
});

test("BUY deducts the trade fee from quote balance", () => {
  const balance = new TestBalance({ quoteBalance: 500 });

  const trade = balance.buy(2, 100, { fee: 0.2 });

  assert.equal(trade.total, 200);
  assert.equal(trade.fee, 0.2);
  assert.equal(balance.quoteBalance, 299.8);
  assert.equal(balance.baseBalance, 2);
  assert.equal(balance.snapshot().trades.length, 1);
});

test("SELL deducts the trade fee from sale proceeds", () => {
  const balance = new TestBalance({
    quoteBalance: 100,
    baseBalance: 3,
  });

  const trade = balance.sell(2, 100, { fee: 0.2 });

  assert.equal(trade.total, 200);
  assert.equal(trade.fee, 0.2);
  assert.equal(balance.quoteBalance, 299.8);
  assert.equal(balance.baseBalance, 1);
  assert.equal(balance.snapshot().trades.length, 1);
});

test("rejects an invalid fee without changing balances or history", () => {
  const balance = new TestBalance({ quoteBalance: 500 });
  const before = balance.snapshot();

  assert.throws(
    () => balance.buy(1, 100, { fee: -1 }),
    /fee must be a non-negative finite number/
  );

  assert.deepEqual(balance.snapshot(), before);
});

test("BUY keeps repeated decimal quantities exact", () => {
  const balance = new TestBalance({
    quoteBalance: 100,
    baseBalance: 0,
  });

  balance.buy(0.1, 1);
  balance.buy(0.2, 1);

  assert.equal(balance.baseBalance, 0.3);
});

test("TestBalance creates and persists its initial state", async () => {
  let savedState = null;
  const store = {
    async loadState() {
      return savedState;
    },
    async saveState(state) {
      savedState = structuredClone(state);
    },
  };

  const balance = await TestBalance.create({
    store,
    quoteBalance: 500,
    baseBalance: 2,
  });

  assert.deepEqual(balance.snapshot(), {
    quoteBalance: 500,
    baseBalance: 2,
    trades: [],
  });
  assert.deepEqual(savedState, balance.snapshot());
});

test("TestBalance restores saved balances and trade history", async () => {
  const savedState = {
    quoteBalance: 400,
    baseBalance: 1,
    trades: [
      {
        side: "BUY",
        quantity: 1,
        price: 100,
        total: 100,
        fee: 0,
        quoteBalance: 400,
        baseBalance: 1,
      },
    ],
  };

  const store = {
    async loadState() {
      return structuredClone(savedState);
    },
    async saveState() {
      throw new Error("Saving was not expected.");
    },
  };

  const balance = await TestBalance.create({ store });

  assert.deepEqual(balance.snapshot(), savedState);
});

test("buyAndPersist saves a successful BUY", async () => {
  let savedState = null;
  const store = {
    async loadState() {
      return savedState;
    },
    async saveState(state) {
      savedState = structuredClone(state);
    },
  };

  const balance = await TestBalance.create({
    store,
    quoteBalance: 500,
  });

  const trade = await balance.buyAndPersist(2, 100, { fee: 1 });

  assert.equal(trade.side, "BUY");
  assert.equal(balance.quoteBalance, 299);
  assert.equal(balance.baseBalance, 2);
  assert.deepEqual(savedState, balance.snapshot());
  assert.equal(savedState.trades.length, 1);
});

test("sellAndPersist saves a successful SELL", async () => {
  let savedState = {
    quoteBalance: 100,
    baseBalance: 3,
    trades: [],
  };

  const store = {
    async loadState() {
      return structuredClone(savedState);
    },
    async saveState(state) {
      savedState = structuredClone(state);
    },
  };

  const balance = await TestBalance.create({ store });
  const trade = await balance.sellAndPersist(2, 100, { fee: 1 });

  assert.equal(trade.side, "SELL");
  assert.equal(balance.quoteBalance, 299);
  assert.equal(balance.baseBalance, 1);
  assert.deepEqual(savedState, balance.snapshot());
  assert.equal(savedState.trades.length, 1);
});

test("failed persistence restores balances and trade history", async () => {
  const savedState = {
    quoteBalance: 500,
    baseBalance: 0,
    trades: [],
  };

  const store = {
    async loadState() {
      return structuredClone(savedState);
    },
    async saveState() {
      throw new Error("Simulated database write failure.");
    },
  };

  const balance = await TestBalance.create({ store });
  const before = balance.snapshot();

  await assert.rejects(
    balance.buyAndPersist(1, 100),
    /Simulated database write failure/
  );

  assert.deepEqual(balance.snapshot(), before);
});

test("invalid persisted trade leaves balance unchanged", async () => {
  let saveCalls = 0;
  const store = {
    async loadState() {
      return null;
    },
    async saveState() {
      saveCalls += 1;
    },
  };

  const balance = await TestBalance.create({
    store,
    quoteBalance: 500,
  });
  const before = balance.snapshot();
  const initialSaveCalls = saveCalls;

  await assert.rejects(
    balance.buyAndPersist(0, 100),
    RangeError
  );

  assert.deepEqual(balance.snapshot(), before);
  assert.equal(saveCalls, initialSaveCalls);
});
