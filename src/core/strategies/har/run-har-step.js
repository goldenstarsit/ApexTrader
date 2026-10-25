import { evaluateHAR } from "./har-strategy.js";

export function executeHARStep({
  configuration,
  historicalPrices,
  currentPrice,
  balance,
  quantity,
  riskManager,
}) {
  if (
    !balance ||
    typeof balance.buy !== "function" ||
    typeof balance.sell !== "function"
  ) {
    throw new TypeError("A compatible test balance is required.");
  }

  const evaluation = evaluateHAR({
    configuration,
    historicalPrices,
    currentPrice,
  });

  if (evaluation.signal === "NO_ACTION") {
    return { ...evaluation, trade: null };
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new RangeError("quantity must be a positive finite number.");
  }

  if (
    !riskManager ||
    typeof riskManager.validateTrade !== "function"
  ) {
    throw new TypeError("A compatible risk manager is required.");
  }

  riskManager.validateTrade({
    quantity,
    price: currentPrice,
  });

  let trade = null;

  if (evaluation.signal === "BUY") {
    trade = balance.buy(quantity, currentPrice);
  } else if (evaluation.signal === "SELL") {
    trade = balance.sell(quantity, currentPrice);
  }

  return { ...evaluation, trade };
}
