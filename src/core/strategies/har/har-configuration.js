import { StrategyConfiguration } from "../strategy-configuration.js";

export class HARConfiguration extends StrategyConfiguration {
  constructor({
    id,
    name,
    exchange,
    symbol,
    averagePeriodMinutes = 60,
    priceCheckIntervalMinutes = 5,
    rangeMode,
    rangeValue,
    enabled = false,
  } = {}) {
    super({ id, name, exchange, symbol });

    this.averagePeriodMinutes = averagePeriodMinutes;
    this.priceCheckIntervalMinutes = priceCheckIntervalMinutes;
    this.rangeMode = rangeMode;
    this.rangeValue = rangeValue;
    this.enabled = enabled;

    this.validate();
  }

  validate() {
    super.validate();

    if (
      !Number.isInteger(this.averagePeriodMinutes) ||
      this.averagePeriodMinutes <= 0
    ) {
      throw new RangeError(
        "averagePeriodMinutes must be a positive integer."
      );
    }

    if (
      !Number.isInteger(this.priceCheckIntervalMinutes) ||
      this.priceCheckIntervalMinutes <= 0
    ) {
      throw new RangeError(
        "priceCheckIntervalMinutes must be a positive integer."
      );
    }

    if (!["percentage", "fixed"].includes(this.rangeMode)) {
      throw new TypeError(
        'rangeMode must be "percentage" or "fixed".'
      );
    }

    if (
      typeof this.rangeValue !== "number" ||
      !Number.isFinite(this.rangeValue) ||
      this.rangeValue <= 0
    ) {
      throw new RangeError("rangeValue must be a positive finite number.");
    }

    if (this.rangeMode === "percentage" && this.rangeValue >= 100) {
      throw new RangeError(
        "Percentage rangeValue must be less than 100."
      );
    }

    if (typeof this.enabled !== "boolean") {
      throw new TypeError("enabled must be a boolean.");
    }

    return true;
  }
}
