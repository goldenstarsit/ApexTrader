import { TestBalance } from "../../balance/test-balance.js";
import { RiskManager } from "../../risk/abstract-model/risk-manager.js";
import { HARConfiguration } from "./har-configuration.js";
import { getMexcPublicMarketData } from "./mexc-public-market-data.js";
import { runHARSimulation } from "./run-har-simulation.js";

export async function runHARPublicSimulation({
  symbol,
  fetchImpl = fetch,
  quoteBalance = 1000,
  baseBalance = 0,
  rangeValue = 0.5,
  maxTradeValue = 100,
} = {}) {
  if (typeof symbol !== "string" || !/^[A-Z0-9]{2,30}$/.test(symbol)) {
    throw new RangeError(
      "Provide a normalized MEXC symbol, such as BTCUSDT."
    );
  }

  if (!Number.isFinite(quoteBalance) || quoteBalance < 0) {
    throw new RangeError("quoteBalance must be a non-negative finite number.");
  }

  if (!Number.isFinite(baseBalance) || baseBalance < 0) {
    throw new RangeError("baseBalance must be a non-negative finite number.");
  }

  if (!Number.isFinite(rangeValue) || rangeValue <= 0 || rangeValue >= 100) {
    throw new RangeError("rangeValue must be greater than 0 and less than 100.");
  }

  if (!Number.isFinite(maxTradeValue) || maxTradeValue <= 0) {
    throw new RangeError("maxTradeValue must be a positive finite number.");
  }

  const marketData = await getMexcPublicMarketData({
    symbol,
    interval: "5m",
    limit: 12,
    fetchImpl,
  });

  const configuration = new HARConfiguration({
    id: `har-${symbol.toLowerCase()}`,
    name: `HAR ${symbol}`,
    exchange: "MEXC",
    symbol,
    averagePeriodMinutes: 60,
    priceCheckIntervalMinutes: 5,
    rangeMode: "percentage",
    rangeValue,
    enabled: true,
  });

  const balance = new TestBalance({ quoteBalance, baseBalance });
  const riskManager = new RiskManager({
    maxTradeValue,
    feeRate: marketData.rules.takerCommission,
  });

  const simulation = runHARSimulation({
    configuration,
    historicalPrices: marketData.closingPrices,
    prices: [marketData.price],
    balance,
    riskManager,
    marketRules: marketData.rules,
  });

  return {
    mode: "SIMULATION_ONLY",
    exchange: marketData.exchange,
    symbol: marketData.symbol,
    currentPrice: marketData.price,
    historicalCloseCount: marketData.closingPrices.length,
    configuration: {
      averagePeriodMinutes: configuration.averagePeriodMinutes,
      priceCheckIntervalMinutes: configuration.priceCheckIntervalMinutes,
      rangeMode: configuration.rangeMode,
      rangeValue: configuration.rangeValue,
    },
    steps: simulation.steps,
    finalBalance: simulation.finalBalance,
    notice: "Uses public market data and simulated balances only. No live orders are placed.",
  };
}
