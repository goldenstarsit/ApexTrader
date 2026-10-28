export function mergeMarketResults(markets, outcomes, previousData) {
  const previousBySymbol = new Map(
    previousData.map((market) => [market.symbol, market]),
  );

  return markets.map((market, index) => {
    const outcome = outcomes[index];

    if (outcome?.status === "fulfilled") {
      return {
        ...outcome.value,
        freshness: "fresh",
      };
    }

    const previous = previousBySymbol.get(market.symbol);

    if (previous && Number.isFinite(previous.price)) {
      return {
        ...previous,
        freshness: "stale",
      };
    }

    return {
      ...market,
      price: null,
      change: null,
      freshness: "unavailable",
    };
  });
}
