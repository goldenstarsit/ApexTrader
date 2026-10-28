export function mergeMarketResults(
  markets,
  outcomes,
  previousData,
  now = new Date().toISOString(),
) {
  const previousBySymbol = new Map(
    previousData.map((market) => [market.symbol, market]),
  );

  return markets.map((market, index) => {
    const outcome = outcomes[index];

    if (outcome?.status === "fulfilled") {
      return {
        ...outcome.value,
        freshness: "fresh",
        lastSuccessfulAt: now,
        errorMessage: null,
      };
    }

    const reason = outcome?.reason;
    const errorMessage =
      typeof reason?.message === "string" && reason.message.trim()
        ? reason.message
        : "Market data request failed. Try again shortly.";

    const previous = previousBySymbol.get(market.symbol);

    if (previous && Number.isFinite(previous.price)) {
      return {
        ...previous,
        freshness: "stale",
        errorMessage,
      };
    }

    return {
      ...market,
      price: null,
      change: null,
      freshness: "unavailable",
      lastSuccessfulAt: null,
      errorMessage,
    };
  });
}
