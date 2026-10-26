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

function compareProductToLimit(quantity, price, limit) {
  const a = decimalParts(quantity);
  const b = decimalParts(price);
  const c = decimalParts(limit);
  const product = {
    integer: a.integer * b.integer,
    scale: a.scale + b.scale,
  };
  const scale = Math.max(product.scale, c.scale);
  const left = product.integer * 10n ** BigInt(scale - product.scale);
  const right = c.integer * 10n ** BigInt(scale - c.scale);

  return left < right ? -1 : left > right ? 1 : 0;
}

export class RiskManager {
  constructor({ maxTradeValue, feeRate = 0 } = {}) {
    if (!Number.isFinite(maxTradeValue) || maxTradeValue <= 0) {
      throw new RangeError(
        "maxTradeValue must be a positive finite number."
      );
    }

    if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate > 1) {
      throw new RangeError(
        "feeRate must be a finite number between 0 and 1."
      );
    }

    this.maxTradeValue = maxTradeValue;
    this.feeRate = feeRate;
  }

  validateTrade({ side = "BUY", quantity, price, feeRate = this.feeRate } = {}) {
    if (side !== "BUY" && side !== "SELL") {
      throw new RangeError('side must be "BUY" or "SELL".');
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new RangeError("quantity must be a positive finite number.");
    }

    if (!Number.isFinite(price) || price <= 0) {
      throw new RangeError("price must be a positive finite number.");
    }

    if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate > 1) {
      throw new RangeError(
        "feeRate must be a finite number between 0 and 1."
      );
    }

    const tradeValue = quantity * price;

    if (!Number.isFinite(tradeValue)) {
      throw new RangeError("Trade value must be finite.");
    }

    const fee = tradeValue * feeRate;

    if (!Number.isFinite(fee)) {
      throw new RangeError("Trade fee must be finite.");
    }

    if (side === "BUY") {
      const totalCost = tradeValue + fee;

      if (!Number.isFinite(totalCost)) {
        throw new RangeError("Trade cost must be finite.");
      }

      if (compareProductToLimit(quantity, price, this.maxTradeValue) > 0) {
        throw new RangeError(
          "Trade value exceeds the configured maximum."
        );
      }

      return {
        allowed: true,
        side,
        quantity,
        price,
        tradeValue,
        fee,
        feeRate,
        totalCost,
        maxTradeValue: this.maxTradeValue,
      };
    }

    if (compareProductToLimit(quantity, price, this.maxTradeValue) > 0) {
      throw new RangeError(
        "Trade value exceeds the configured maximum."
      );
    }

    const netProceeds = tradeValue - fee;

    if (!Number.isFinite(netProceeds)) {
      throw new RangeError("Net proceeds must be finite.");
    }

    return {
      allowed: true,
      side,
      quantity,
      price,
      tradeValue,
      fee,
      feeRate,
      netProceeds,
      maxTradeValue: this.maxTradeValue,
    };
  }
}
