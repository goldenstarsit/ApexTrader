const BASE_URL = "https://api.mexc.com";

function positiveNumber(value, name) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }

  return number;
}

function optionalPositiveNumber(value, name) {
  if (value === null || value === undefined) {
    return null;
  }

  return positiveNumber(value, name);
}

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`MEXC request failed with HTTP ${response.status}.`);
  }

  return response.json();
}

export async function getMexcPublicMarketData({
  symbol,
  interval = "5m",
  limit = 12,
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  if (
    typeof symbol !== "string" ||
    !/^[A-Z0-9]{2,30}$/.test(symbol)
  ) {
    throw new RangeError("symbol must be a normalized MEXC symbol.");
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new RangeError("limit must be an integer from 1 to 1000.");
  }

  if (!/^[0-9]+[mhdw]$/.test(interval)) {
    throw new RangeError("interval is invalid.");
  }

  const encodedSymbol = encodeURIComponent(symbol);
  const encodedInterval = encodeURIComponent(interval);

  const [exchangeInfo, ticker, candles] = await Promise.all([
    getJson(
      `${BASE_URL}/api/v3/exchangeInfo?symbol=${encodedSymbol}`,
      fetchImpl
    ),
    getJson(
      `${BASE_URL}/api/v3/ticker/price?symbol=${encodedSymbol}`,
      fetchImpl
    ),
    getJson(
      `${BASE_URL}/api/v3/klines?symbol=${encodedSymbol}&interval=${encodedInterval}&limit=${Math.min(limit + 1, 1000)}`,
      fetchImpl
    ),
  ]);

  const markets = exchangeInfo?.symbols;

  if (!Array.isArray(markets)) {
    throw new Error("MEXC exchange information has no symbols list.");
  }

  const market = markets.find((item) => item.symbol === symbol);

  if (!market) {
    throw new Error(`MEXC market ${symbol} was not found.`);
  }

  if (market.status !== "1" || market.isSpotTradingAllowed !== true) {
    throw new Error(`MEXC Spot market ${symbol} is not enabled.`);
  }

  if (!Array.isArray(market.orderTypes) || !market.orderTypes.includes("MARKET")) {
    throw new Error(`MEXC Spot market ${symbol} does not support MARKET orders.`);
  }

  if (market.tradeSideType !== "1" && market.tradeSideType !== 1) {
    throw new Error(
      `MEXC Spot market ${symbol} does not permit both BUY and SELL for HAR.`
    );
  }

  if (!Array.isArray(market.filters)) {
    throw new Error("MEXC market filters are missing.");
  }

  const price = positiveNumber(ticker?.price, "ticker price");

  if (ticker?.symbol !== symbol) {
    throw new Error("MEXC ticker symbol does not match the requested market.");
  }

  if (!Array.isArray(candles) || candles.length < limit) {
    throw new Error("MEXC returned an unexpected number of candles.");
  }

  const intervalMatch = /^(\d+)([mhdw])$/.exec(interval);

  if (!intervalMatch) {
    throw new RangeError("interval is invalid.");
  }

  const intervalUnits = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  const intervalCount = Number(intervalMatch[1]);
  const intervalMs = intervalCount * intervalUnits[intervalMatch[2]];

  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    throw new RangeError("interval duration is invalid.");
  }

  if (typeof now !== "function") {
    throw new TypeError("now must be a function returning a finite timestamp.");
  }

  const currentTime = now();

  if (!Number.isFinite(currentTime)) {
    throw new TypeError("now must be a function returning a finite timestamp.");
  }
  const completedCandles = candles.filter((candle, index) => {
    if (!Array.isArray(candle) || candle.length < 7) {
      throw new Error(`MEXC candle ${index} is invalid.`);
    }

    const openTime = Number(candle[0]);
    const closeTime = Number(candle[6]);

    if (
      !Number.isSafeInteger(openTime) ||
      !Number.isSafeInteger(closeTime) ||
      openTime < 0 ||
      !Number.isSafeInteger(openTime + intervalMs) ||
      closeTime < openTime ||
      closeTime > openTime + intervalMs
    ) {
      throw new Error(`MEXC candle ${index} has invalid timestamps.`);
    }

    return closeTime < currentTime;
  });

  for (let index = 1; index < completedCandles.length; index += 1) {
    const previousOpen = Number(completedCandles[index - 1][0]);
    const currentOpen = Number(completedCandles[index][0]);

    if (currentOpen - previousOpen !== intervalMs) {
      throw new Error("MEXC candles are not in continuous chronological order.");
    }
  }

  if (completedCandles.length < limit) {
    throw new Error("MEXC returned too few completed candles.");
  }

  const selectedCandles = completedCandles.slice(-limit);
  const closingPrices = selectedCandles.map((candle, index) =>
    positiveNumber(candle[4], `candle ${index} close`)
  );

  const minQuantity = positiveNumber(
    market.baseSizePrecision,
    "baseSizePrecision"
  );

  const quantityStep = null;

  const quoteAmountPrecision = positiveNumber(
    market.quoteAmountPrecision,
    "quoteAmountPrecision"
  );

  const quoteAmountPrecisionMarket = optionalPositiveNumber(
    market.quoteAmountPrecisionMarket,
    "quoteAmountPrecisionMarket"
  );

  const maxQuoteAmount = positiveNumber(
    market.maxQuoteAmount,
    "maxQuoteAmount"
  );

  const maxQuoteAmountMarket = optionalPositiveNumber(
    market.maxQuoteAmountMarket,
    "maxQuoteAmountMarket"
  );

  const makerCommissionValue = market.makerCommission;
  const takerCommissionValue = market.takerCommission;

  if (
    makerCommissionValue === null ||
    makerCommissionValue === undefined ||
    (typeof makerCommissionValue === "string" && makerCommissionValue.trim() === "") ||
    takerCommissionValue === null ||
    takerCommissionValue === undefined ||
    (typeof takerCommissionValue === "string" && takerCommissionValue.trim() === "")
  ) {
    throw new RangeError("MEXC public commission metadata is invalid.");
  }

  const makerCommission = Number(makerCommissionValue);
  const takerCommission = Number(takerCommissionValue);

  if (
    !Number.isFinite(makerCommission) ||
    makerCommission < 0 ||
    !Number.isFinite(takerCommission) ||
    takerCommission < 0
  ) {
    throw new RangeError("MEXC public commission metadata is invalid.");
  }

  if (
    !Number.isInteger(market.baseAssetPrecision) ||
    market.baseAssetPrecision < 0 ||
    !Number.isInteger(market.quoteAssetPrecision) ||
    market.quoteAssetPrecision < 0
  ) {
    throw new RangeError("MEXC asset precision metadata is invalid.");
  }

  return {
    exchange: "MEXC",
    symbol,
    price,
    closingPrices,
    rules: {
      quantityStep,
      minQuantity,
      baseAssetPrecision: market.baseAssetPrecision,
      quoteAssetPrecision: market.quoteAssetPrecision,
      quoteAmountPrecision,
      quoteAmountPrecisionMarket,
      maxQuoteAmount,
      maxQuoteAmountMarket,
      makerCommission,
      takerCommission,
    },
  };
}
