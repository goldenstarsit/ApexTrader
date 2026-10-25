export class RiskManager {
  constructor({ maxTradeValue } = {}) {
    if (!Number.isFinite(maxTradeValue) || maxTradeValue <= 0) {
      throw new RangeError(
        "maxTradeValue must be a positive finite number."
      );
    }

    this.maxTradeValue = maxTradeValue;
  }

  validateTrade({ quantity, price } = {}) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new RangeError("quantity must be a positive finite number.");
    }

    if (!Number.isFinite(price) || price <= 0) {
      throw new RangeError("price must be a positive finite number.");
    }

    const tradeValue = quantity * price;

    if (!Number.isFinite(tradeValue)) {
      throw new RangeError("Trade value must be finite.");
    }

    if (tradeValue > this.maxTradeValue) {
      throw new RangeError(
        "Trade value exceeds the configured maximum."
      );
    }

    return {
      allowed: true,
      quantity,
      price,
      tradeValue,
      maxTradeValue: this.maxTradeValue,
    };
  }
}
