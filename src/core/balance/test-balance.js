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

export class TestBalance {
  constructor({ quoteBalance = 10000, baseBalance = 0 } = {}) {
    assertNonNegativeNumber(quoteBalance, "quoteBalance");
    assertNonNegativeNumber(baseBalance, "baseBalance");

    this.quoteBalance = quoteBalance;
    this.baseBalance = baseBalance;
    this.trades = [];
  }

  buy(quantity, price) {
    assertPositiveNumber(quantity, "quantity");
    assertPositiveNumber(price, "price");

    const total = quantity * price;

    if (!Number.isFinite(total)) {
      throw new RangeError("Trade total must be finite.");
    }

    if (total > this.quoteBalance) {
      throw new RangeError("Insufficient quote balance.");
    }

    const nextBaseBalance = this.baseBalance + quantity;

    if (!Number.isFinite(nextBaseBalance)) {
      throw new RangeError("Resulting base balance must be finite.");
    }

    this.quoteBalance -= total;
    this.baseBalance = nextBaseBalance;

    return this.recordTrade("BUY", quantity, price, total);
  }

  sell(quantity, price) {
    assertPositiveNumber(quantity, "quantity");
    assertPositiveNumber(price, "price");

    const total = quantity * price;

    if (!Number.isFinite(total)) {
      throw new RangeError("Trade total must be finite.");
    }

    if (quantity > this.baseBalance) {
      throw new RangeError("Insufficient base balance.");
    }

    const nextQuoteBalance = this.quoteBalance + total;

    if (!Number.isFinite(nextQuoteBalance)) {
      throw new RangeError("Resulting quote balance must be finite.");
    }

    this.baseBalance -= quantity;
    this.quoteBalance = nextQuoteBalance;

    return this.recordTrade("SELL", quantity, price, total);
  }

  recordTrade(side, quantity, price, total) {
    const trade = {
      side,
      quantity,
      price,
      total,
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
