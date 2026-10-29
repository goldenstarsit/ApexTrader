import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runHARPublicSimulation } from "../src/core/strategies/har/run-har-public-simulation.js";

export { runHARPublicSimulation };

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
