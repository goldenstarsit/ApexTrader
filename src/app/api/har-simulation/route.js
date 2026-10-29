import { runHARPublicSimulation } from "../../../core/strategies/har/run-har-public-simulation.js";

function errorResponse(status, code, message) {
  return Response.json(
    { error: { code, message } },
    { status }
  );
}

function validOptionalNumber(body, name, fallback, minimum, inclusiveMinimum) {
  if (!(name in body)) {
    return { valid: true, value: fallback };
  }

  const value = body[name];
  const aboveMinimum = inclusiveMinimum
    ? value >= minimum
    : value > minimum;

  if (typeof value !== "number" || !Number.isFinite(value) || !aboveMinimum) {
    return { valid: false };
  }

  return { valid: true, value };
}

export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(400, "INVALID_BODY", "Request body must be a JSON object.");
  }

  if (typeof body.symbol !== "string" || !/^[A-Z0-9]{2,30}$/.test(body.symbol)) {
    return errorResponse(
      400,
      "INVALID_SYMBOL",
      "Use a normalized uppercase market symbol, such as BTCUSDT."
    );
  }

  const settings = [
    ["quoteBalance", 1000, 0, true],
    ["baseBalance", 0, 0, true],
    ["rangeValue", 0.5, 0, false],
    ["maxTradeValue", 100, 0, false],
  ];

  const options = {};

  for (const [name, fallback, minimum, inclusiveMinimum] of settings) {
    const result = validOptionalNumber(
      body,
      name,
      fallback,
      minimum,
      inclusiveMinimum
    );

    if (!result.valid) {
      return errorResponse(
        400,
        "INVALID_" + name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase(),
        `${name} must be a valid ${inclusiveMinimum ? "non-negative" : "positive"} finite number.`
      );
    }

    options[name] = result.value;
  }

  if (options.rangeValue >= 100) {
    return errorResponse(
      400,
      "INVALID_RANGE_VALUE",
      "rangeValue must be less than 100."
    );
  }

  try {
    const data = await runHARPublicSimulation({
      symbol: body.symbol,
      ...options,
    });

    return Response.json({ data });
  } catch (error) {
    if (
      error?.message === "A verified quantity step is required for automatic sizing." ||
      error?.message === "A verified market-order minimum quote amount is required for automatic sizing." ||
      error?.message === "A verified market-order maximum quote amount is required for automatic sizing."
    ) {
      return errorResponse(
        422,
        "SIMULATION_BLOCKED",
        "Simulation cannot calculate a safe trade because required MEXC market rules are unverified."
      );
    }

    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return errorResponse(
        504,
        "MARKET_DATA_TIMEOUT",
        "The public market-data request timed out."
      );
    }

    return errorResponse(
      502,
      "SIMULATION_UNAVAILABLE",
      "HAR simulation could not be completed with the available public market data."
    );
  }
}
