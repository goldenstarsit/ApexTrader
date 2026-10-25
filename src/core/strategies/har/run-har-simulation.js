import { executeHARStep } from "./run-har-step.js";

export function runHARSimulation({
  configuration,
  historicalPrices,
  prices,
  balance,
  quantity,
}) {
  if (!Array.isArray(historicalPrices) || historicalPrices.length === 0) {
    throw new TypeError("historicalPrices must be a non-empty array.");
  }

  if (!Array.isArray(prices) || prices.length === 0) {
    throw new TypeError("prices must be a non-empty array.");
  }

  for (const price of prices) {
    if (!Number.isFinite(price) || price <= 0) {
      throw new RangeError(
        "Every simulation price must be a positive finite number."
      );
    }
  }

  if (!balance || typeof balance.snapshot !== "function") {
    throw new TypeError("A compatible test balance is required.");
  }

  const rollingPrices = [...historicalPrices];
  const steps = [];

  for (const [index, currentPrice] of prices.entries()) {
    const result = executeHARStep({
      configuration,
      historicalPrices: rollingPrices,
      currentPrice,
      balance,
      quantity,
    });

    steps.push({
      step: index + 1,
      ...result,
    });

    rollingPrices.push(currentPrice);
    rollingPrices.shift();
  }

  return {
    steps,
    finalBalance: balance.snapshot(),
  };
}
