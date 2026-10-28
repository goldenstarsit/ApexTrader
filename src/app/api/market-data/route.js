import { getMexcPublicMarketData } from "../../../core/strategies/har/mexc-public-market-data.js";

const SUPPORTED_INTERVALS = new Set([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
]);

function errorResponse(status, code, message) {
  return Response.json(
    { error: { code, message } },
    { status }
  );
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol") ?? "BTCUSDT";
  const interval = params.get("interval") ?? "5m";
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 12 : Number(rawLimit);

  if (!/^[A-Z0-9]{2,30}$/.test(symbol)) {
    return errorResponse(
      400,
      "INVALID_SYMBOL",
      "Use a normalized uppercase market symbol, such as BTCUSDT."
    );
  }

  if (!SUPPORTED_INTERVALS.has(interval)) {
    return errorResponse(
      400,
      "INVALID_INTERVAL",
      "The requested candle interval is not supported."
    );
  }

  if (
    (rawLimit !== null && !/^\d+$/.test(rawLimit)) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return errorResponse(
      400,
      "INVALID_LIMIT",
      "The limit must be an integer from 1 to 100."
    );
  }

  try {
    const data = await getMexcPublicMarketData({
      symbol,
      interval,
      limit,
    });

    return Response.json({ data });
  } catch (error) {
    if (
      error?.name === "TimeoutError" ||
      error?.name === "AbortError"
    ) {
      return errorResponse(
        504,
        "MARKET_DATA_TIMEOUT",
        "The public market-data request timed out."
      );
    }

    return errorResponse(
      502,
      "MARKET_DATA_UNAVAILABLE",
      "MEXC public market data is temporarily unavailable."
    );
  }
}
