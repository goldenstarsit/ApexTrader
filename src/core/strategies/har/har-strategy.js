export function calculateAverage(prices) {
  if (!Array.isArray(prices) || prices.length === 0) {
    throw new TypeError("prices must be a non-empty array.");
  }

  for (const price of prices) {
    if (!Number.isFinite(price) || price <= 0) {
      throw new RangeError("Every price must be a positive finite number.");
    }
  }

  return prices.reduce((total, price) => total + price, 0) / prices.length;
}

export function evaluateHAR({
  configuration,
  historicalPrices,
  currentPrice,
}) {
  if (!configuration || typeof configuration !== "object") {
    throw new TypeError("configuration is required.");
  }

  if (configuration.enabled !== true) {
    return {
      signal: "NO_ACTION",
      reason: "STRATEGY_DISABLED",
    };
  }

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new RangeError("currentPrice must be a positive finite number.");
  }

  const { averagePeriodMinutes, priceCheckIntervalMinutes } = configuration;

  if (
    !Number.isInteger(averagePeriodMinutes) ||
    averagePeriodMinutes <= 0 ||
    !Number.isInteger(priceCheckIntervalMinutes) ||
    priceCheckIntervalMinutes <= 0 ||
    averagePeriodMinutes % priceCheckIntervalMinutes !== 0
  ) {
    throw new RangeError("Invalid HAR sampling configuration.");
  }

  const expectedSamples =
    averagePeriodMinutes / priceCheckIntervalMinutes;

  if (
    !Array.isArray(historicalPrices) ||
    historicalPrices.length !== expectedSamples
  ) {
    throw new RangeError(
      `Expected exactly ${expectedSamples} historical price samples.`
    );
  }

  const average = calculateAverage(historicalPrices);
  const { rangeMode, rangeValue } = configuration;

  if (!Number.isFinite(rangeValue) || rangeValue <= 0) {
    throw new RangeError("rangeValue must be a positive finite number.");
  }

  let distance;

  if (rangeMode === "percentage") {
    if (rangeValue >= 100) {
      throw new RangeError("Percentage rangeValue must be less than 100.");
    }

    distance = average * (rangeValue / 100);
  } else if (rangeMode === "fixed") {
    distance = rangeValue;
  } else {
    throw new TypeError('rangeMode must be "percentage" or "fixed".');
  }

  const lowerBound = average - distance;
  const upperBound = average + distance;

  let signal = "NO_ACTION";

  if (currentPrice < lowerBound) {
    signal = "BUY";
  } else if (currentPrice > upperBound) {
    signal = "SELL";
  }

  return {
    signal,
    average,
    lowerBound,
    upperBound,
    currentPrice,
  };
}
