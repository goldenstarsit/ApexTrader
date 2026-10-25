export class StrategyConfiguration {
  constructor({ id, name, exchange, symbol } = {}) {
    if (new.target === StrategyConfiguration) {
      throw new TypeError(
        "StrategyConfiguration is an abstract base class."
      );
    }

    this.id = id;
    this.name = name;
    this.exchange = exchange;
    this.symbol = symbol;
  }

  validate() {
    const requiredFields = {
      id: this.id,
      name: this.name,
      exchange: this.exchange,
      symbol: this.symbol,
    };

    for (const [field, value] of Object.entries(requiredFields)) {
      if (typeof value !== "string" || value.trim() === "") {
        throw new TypeError(`${field} must be a non-empty string.`);
      }
    }

    return true;
  }
}
