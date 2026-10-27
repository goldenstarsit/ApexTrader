function assertPositiveNumber(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function assertNonNegativeNumber(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

function decimalParts(value) {
  const text = String(value).toLowerCase();
  const [coefficient, exponentText] = text.split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const negative = coefficient.startsWith("-");
  const unsigned = negative ? coefficient.slice(1) : coefficient;
  const parts = unsigned.split(".");
  let integer = BigInt(parts.join("") || "0");
  let scale = (parts[1] ?? "").length - exponent;

  if (negative) integer = -integer;
  if (scale < 0) {
    integer *= 10n ** BigInt(-scale);
    scale = 0;
  }

  return { integer, scale };
}

function compareDecimals(left, right) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  const scale = Math.max(a.scale, b.scale);
  const x = a.integer * 10n ** BigInt(scale - a.scale);
  const y = b.integer * 10n ** BigInt(scale - b.scale);

  return x < y ? -1 : x > y ? 1 : 0;
}

function decimalOperation(left, right, operation) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  const scale = Math.max(a.scale, b.scale);
  const x = a.integer * 10n ** BigInt(scale - a.scale);
  const y = b.integer * 10n ** BigInt(scale - b.scale);
  const result =
    operation === "add" ? x + y :
    operation === "subtract" ? x - y :
    a.integer * b.integer;
  const resultScale =
    operation === "multiply" ? a.scale + b.scale : scale;

  return Number(result) / 10 ** resultScale;
}

export class TestBalance {
  #stateStore;

  constructor({ quoteBalance = 10000, baseBalance = 0 } = {}) {
    assertNonNegativeNumber(quoteBalance, "quoteBalance");
    assertNonNegativeNumber(baseBalance, "baseBalance");

    this.quoteBalance = quoteBalance;
    this.baseBalance = baseBalance;
    this.trades = [];
    this.#stateStore = null;
  }

  static async create({
    store,
    quoteBalance = 10000,
    baseBalance = 0,
  } = {}) {
    if (
      !store ||
      typeof store.loadState !== "function" ||
      typeof store.saveState !== "function"
    ) {
      throw new TypeError("A compatible bot state store is required.");
    }

    const savedState = await store.loadState();
    const balance = new TestBalance({
      quoteBalance,
      baseBalance,
    });

    if (savedState !== null) {
      if (
        !savedState ||
        typeof savedState !== "object" ||
        Array.isArray(savedState) ||
        !Array.isArray(savedState.trades)
      ) {
        throw new TypeError("The saved bot state is invalid.");
      }

      assertNonNegativeNumber(
        savedState.quoteBalance,
        "saved quoteBalance"
      );
      assertNonNegativeNumber(
        savedState.baseBalance,
        "saved baseBalance"
      );

      for (const trade of savedState.trades) {
        if (
          !trade ||
          typeof trade !== "object" ||
          Array.isArray(trade) ||
          !["BUY", "SELL"].includes(trade.side)
        ) {
          throw new TypeError("A saved trade record is invalid.");
        }

        for (const key of [
          "quantity",
          "price",
          "total",
          "fee",
          "quoteBalance",
          "baseBalance",
        ]) {
          assertNonNegativeNumber(trade[key], `saved trade ${key}`);
        }

        if (trade.quantity === 0 || trade.price === 0) {
          throw new RangeError(
            "Saved trade quantity and price must be positive."
          );
        }
      }

      balance.quoteBalance = savedState.quoteBalance;
      balance.baseBalance = savedState.baseBalance;
      balance.trades = savedState.trades.map((trade) => ({ ...trade }));
    } else {
      await store.saveState(balance.snapshot());
    }

    balance.#stateStore = store;
    return balance;
  }

  async buyAndPersist(quantity, price, options = {}) {
    return this.#tradeAndPersist(() => this.buy(quantity, price, options));
  }

  async sellAndPersist(quantity, price, options = {}) {
    return this.#tradeAndPersist(() => this.sell(quantity, price, options));
  }

  async #tradeAndPersist(tradeOperation) {
    if (!this.#stateStore) {
      throw new Error(
        "Persistent trading requires TestBalance.create() with a state store."
      );
    }

    const previousState = this.snapshot();

    try {
      const trade = tradeOperation();
      await this.#stateStore.saveState(this.snapshot());
      return trade;
    } catch (error) {
      this.quoteBalance = previousState.quoteBalance;
      this.baseBalance = previousState.baseBalance;
      this.trades = previousState.trades.map((item) => ({ ...item }));
      throw error;
    }
  }

  buy(quantity, price, { fee = 0 } = {}) {
    assertPositiveNumber(quantity, "quantity");
    assertPositiveNumber(price, "price");
    assertNonNegativeNumber(fee, "fee");

    const total = decimalOperation(quantity, price, "multiply");

    if (!Number.isFinite(total)) {
      throw new RangeError("Trade total must be finite.");
    }

    const totalCost = decimalOperation(total, fee, "add");

    if (!Number.isFinite(totalCost)) {
      throw new RangeError("Trade cost must be finite.");
    }

    if (compareDecimals(totalCost, this.quoteBalance) > 0) {
      throw new RangeError("Insufficient quote balance.");
    }

    const nextQuoteBalance = decimalOperation(this.quoteBalance, totalCost, "subtract");
    const nextBaseBalance = decimalOperation(this.baseBalance, quantity, "add");

    if (!Number.isFinite(nextQuoteBalance) || nextQuoteBalance < 0) {
      throw new RangeError("Resulting quote balance must be finite and non-negative.");
    }

    if (!Number.isFinite(nextBaseBalance)) {
      throw new RangeError("Resulting base balance must be finite.");
    }

    this.quoteBalance = nextQuoteBalance;
    this.baseBalance = nextBaseBalance;

    return this.#recordTrade("BUY", quantity, price, total, fee);
  }

  sell(quantity, price, { fee = 0 } = {}) {
    assertPositiveNumber(quantity, "quantity");
    assertPositiveNumber(price, "price");
    assertNonNegativeNumber(fee, "fee");

    const total = decimalOperation(quantity, price, "multiply");

    if (!Number.isFinite(total)) {
      throw new RangeError("Trade total must be finite.");
    }

    if (compareDecimals(fee, total) > 0) {
      throw new RangeError("Trade fee cannot exceed the sale total.");
    }

    if (quantity > this.baseBalance) {
      throw new RangeError("Insufficient base balance.");
    }

    const netProceeds = decimalOperation(total, fee, "subtract");
    const nextQuoteBalance = decimalOperation(this.quoteBalance, netProceeds, "add");
    const nextBaseBalance = decimalOperation(this.baseBalance, quantity, "subtract");

    if (!Number.isFinite(nextQuoteBalance)) {
      throw new RangeError("Resulting quote balance must be finite.");
    }

    if (!Number.isFinite(nextBaseBalance) || nextBaseBalance < 0) {
      throw new RangeError("Resulting base balance must be finite and non-negative.");
    }

    this.baseBalance = nextBaseBalance;
    this.quoteBalance = nextQuoteBalance;

    return this.#recordTrade("SELL", quantity, price, total, fee);
  }

  #recordTrade(side, quantity, price, total, fee = 0) {
    const trade = {
      side,
      quantity,
      price,
      total,
      fee,
      quoteBalance: this.quoteBalance,
      baseBalance: this.baseBalance,
    };

    this.trades.push(trade);

    return { ...trade };
  }

  snapshot() {
    return {
      quoteBalance: this.quoteBalance,
      baseBalance: this.baseBalance,
      trades: this.trades.map((trade) => ({ ...trade })),
    };
  }
}
