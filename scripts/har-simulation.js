import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TestBalance } from "../src/core/balance/test-balance.js";
import { RiskManager } from "../src/core/risk/abstract-model/risk-manager.js";
import { HARConfiguration } from "../src/core/strategies/har/har-configuration.js";
import { getMexcPublicMarketData } from "../src/core/strategies/har/mexc-public-market-data.js";
import { runHARSimulation } from "../src/core/strategies/har/run-har-simulation.js";

export async function runHARPublicSimulation({
  symbol,
  fetchImpl = fetch,
  quoteBalance = 1000,
  baseBalance = 0,
  rangeValue = 1,
  maxTradeValue = 100,
} = {}) {
  if (typeof symbol !== "string" || !/^[A-Z0-9]{2,30}$/.test(symbol)) {
    throw new RangeError(
      "Provide a normalized MEXC symbol, such as BTCUSDT."
    );
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
    notice:
      "Uses public market data and simulated balances only. No live orders are placed.",
  };
}

async function main() {
  const [symbol, quoteArg, baseArg, rangeArg, maxTradeArg] =
    process.argv.slice(2);

  if (!symbol) {
    throw new Error(
      "Usage: pnpm har:simulate SYMBOL [QUOTE_BALANCE] [BASE_BALANCE] [RANGE_PERCENT] [MAX_TRADE_VALUE]"
    );
  }

  const result = await runHARPublicSimulation({
    symbol,
    ...(quoteArg === undefined ? {} : { quoteBalance: Number(quoteArg) }),
    ...(baseArg === undefined ? {} : { baseBalance: Number(baseArg) }),
    ...(rangeArg === undefined ? {} : { rangeValue: Number(rangeArg) }),
    ...(maxTradeArg === undefined ? {} : { maxTradeValue: Number(maxTradeArg) }),
  });

  console.log(JSON.stringify(result, null, 2));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`HAR simulation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
