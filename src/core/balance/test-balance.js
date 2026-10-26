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
  constructor({ quoteBalance = 10000, baseBalance = 0 } = {}) {
    assertNonNegativeNumber(quoteBalance, "quoteBalance");
    assertNonNegativeNumber(baseBalance, "baseBalance");

    this.quoteBalance = quoteBalance;
    this.baseBalance = baseBalance;
    this.trades = [];
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
