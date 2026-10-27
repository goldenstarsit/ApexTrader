import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runHARPublicSimulation } from "./har-simulation.js";

export async function runHARMultiSimulation({
  symbols,
  quoteBalance = 100,
  rangeValue = 0.5,
  maxTradeValue = 100,
  fetchImpl = fetch,
} = {}) {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new TypeError("Provide a non-empty array of MEXC symbols.");
  }

  if (
    symbols.some(
      (symbol) =>
        typeof symbol !== "string" ||
        !/^[A-Z0-9]{2,30}$/.test(symbol)
    )
  ) {
    throw new RangeError(
      "Every symbol must be normalized, such as BTCUSDT."
    );
  }

  if (new Set(symbols).size !== symbols.length) {
    throw new RangeError("Duplicate symbols are not allowed.");
  }

  if (!Number.isFinite(quoteBalance) || quoteBalance <= 0) {
    throw new RangeError("quoteBalance must be a positive finite number.");
  }

  const settled = await Promise.allSettled(
    symbols.map((symbol) =>
      runHARPublicSimulation({
        symbol,
        quoteBalance,
        rangeValue,
        maxTradeValue,
        fetchImpl,
      })
    )
  );

  const results = settled.map((entry, index) => {
    if (entry.status === "rejected") {
      return {
        symbol: symbols[index],
        status: "FAILED",
        error:
          entry.reason instanceof Error
            ? entry.reason.message
            : String(entry.reason),
      };
    }

    const result = entry.value;

    return {
      symbol: symbols[index],
      status: "SUCCESS",
      result,
      finalEquity:
        result.finalBalance.quoteBalance +
        result.finalBalance.baseBalance * result.currentPrice,
    };
  });

  const successful = results.filter(
    (entry) => entry.status === "SUCCESS"
  );
  const failed = results.filter(
    (entry) => entry.status === "FAILED"
  );

  return {
    mode: "SIMULATION_ONLY",
    exchange: "MEXC",
    balanceMode: "SEPARATE_PER_CURRENCY",
    initialCapitalPerCurrency: quoteBalance,
    summary: {
      requestedSymbols: symbols.length,
      successfulSimulations: successful.length,
      failedSimulations: failed.length,
      configuredInitialCapitalTotal: quoteBalance * symbols.length,
      successfulInitialCapitalTotal: quoteBalance * successful.length,
      finalEquityOfSuccessfulSimulations: successful.reduce(
        (total, entry) => total + entry.finalEquity,
        0
      ),
    },
    results,
    notice:
      "Each symbol uses an independent TestBalance and public MEXC Spot data. No live orders are placed. Failed simulations are excluded from aggregate final equity.",
  };
}

async function main() {
  const [symbolsArg, capitalArg, rangeArg, maxTradeArg] =
    process.argv.slice(2);

  if (!symbolsArg) {
    throw new Error(
      "Usage: pnpm har:simulate-many SYMBOL1,SYMBOL2,... [CAPITAL_PER_SYMBOL] [RANGE_PERCENT] [MAX_TRADE_VALUE]"
    );
  }

  const result = await runHARMultiSimulation({
    symbols: symbolsArg.split(",").map((symbol) => symbol.trim()),
    ...(capitalArg === undefined
      ? {}
      : { quoteBalance: Number(capitalArg) }),
    ...(rangeArg === undefined
      ? {}
      : { rangeValue: Number(rangeArg) }),
    ...(maxTradeArg === undefined
      ? {}
      : { maxTradeValue: Number(maxTradeArg) }),
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.summary.failedSimulations > 0) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`HAR multi-simulation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
