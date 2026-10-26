import { evaluateHAR } from "./har-strategy.js";
import { calculateMinimumQuantity } from "./calculate-minimum-quantity.js";

export function executeHARStep({
  configuration,
  historicalPrices,
  currentPrice,
  balance,
  quantity,
  riskManager,
  marketRules,
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

  if (
    !riskManager ||
    typeof riskManager.validateTrade !== "function"
  ) {
    throw new TypeError("A compatible risk manager is required.");
  }

  let tradeQuantity = quantity;
  let tradeFeeRate = riskManager.feeRate;

  if (marketRules !== undefined) {
    if (
      !marketRules ||
      !Number.isFinite(marketRules.quoteAmountPrecisionMarket) ||
      marketRules.quoteAmountPrecisionMarket <= 0
    ) {
      throw new RangeError(
        "A verified market-order minimum quote amount is required for automatic sizing."
      );
    }

    if (
      !Number.isFinite(marketRules.maxQuoteAmountMarket) ||
      marketRules.maxQuoteAmountMarket <= 0
    ) {
      throw new RangeError(
        "A verified market-order maximum quote amount is required for automatic sizing."
      );
    }

    if (
      !Number.isFinite(marketRules.quantityStep) ||
      marketRules.quantityStep <= 0
    ) {
      throw new RangeError(
        "A verified quantity step is required for automatic sizing."
      );
    }

    if (
      !Number.isFinite(marketRules.takerCommission) ||
      marketRules.takerCommission < 0 ||
      marketRules.takerCommission > 1
    ) {
      throw new RangeError(
        "A verified MEXC taker commission between 0 and 1 is required."
      );
    }

    tradeFeeRate = marketRules.takerCommission;

    if (typeof balance.snapshot !== "function") {
      throw new TypeError(
        "Automatic sizing requires a balance snapshot."
      );
    }

    const snapshot = balance.snapshot();

    tradeQuantity = calculateMinimumQuantity({
      side: evaluation.signal,
      price: currentPrice,
      quantityStep: marketRules.quantityStep,
      minQuantity: marketRules.minQuantity ?? marketRules.quantityStep,
      minQuoteAmount: marketRules.quoteAmountPrecisionMarket,
      maxQuoteAmount: marketRules.maxQuoteAmountMarket,
      availableQuoteBalance: snapshot.quoteBalance,
      availableBaseBalance: snapshot.baseBalance,
      feeRate: tradeFeeRate,
      maxTradeValue: riskManager.maxTradeValue,
    }).quantity;
  } else if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new RangeError("quantity must be a positive finite number.");
  }

  const riskResult = riskManager.validateTrade({
    side: evaluation.signal,
    quantity: tradeQuantity,
    price: currentPrice,
    feeRate: tradeFeeRate,
  });

  let trade = null;

  if (evaluation.signal === "BUY") {
    trade = balance.buy(tradeQuantity, currentPrice, { fee: riskResult.fee });
  } else if (evaluation.signal === "SELL") {
    trade = balance.sell(tradeQuantity, currentPrice, { fee: riskResult.fee });
  }

  return { ...evaluation, trade };
}
