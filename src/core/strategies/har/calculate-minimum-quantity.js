function decimalValue(value) {
  if (!Number.isFinite(value)) {
    throw new RangeError("Decimal comparison requires finite numbers.");
  }

  const text = String(value).toLowerCase();
  const [coefficient, exponentText] = text.split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const negative = coefficient.startsWith("-");
  const unsigned = negative ? coefficient.slice(1) : coefficient;
  const parts = unsigned.split(".");
  const fractionLength = (parts[1] ?? "").length;
  const digits = parts.join("");
  let integer = BigInt(digits || "0");
  let scale = fractionLength - exponent;

  if (negative) {
    integer = -integer;
  }

  if (scale < 0) {
    integer *= 10n ** BigInt(-scale);
    scale = 0;
  }

  return { integer, scale };
}

function compareDecimals(left, right) {
  const a = typeof left === "object" ? left : decimalValue(left);
  const b = typeof right === "object" ? right : decimalValue(right);
  const scale = Math.max(a.scale, b.scale);
  const leftInteger =
    a.integer * 10n ** BigInt(scale - a.scale);
  const rightInteger =
    b.integer * 10n ** BigInt(scale - b.scale);

  return leftInteger < rightInteger
    ? -1
    : leftInteger > rightInteger
      ? 1
      : 0;
}

function multiplyDecimals(left, right) {
  const a = typeof left === "object" ? left : decimalValue(left);
  const b = typeof right === "object" ? right : decimalValue(right);

  return {
    integer: a.integer * b.integer,
    scale: a.scale + b.scale,
  };
}

function addDecimals(left, right) {
  const a = typeof left === "object" ? left : decimalValue(left);
  const b = typeof right === "object" ? right : decimalValue(right);
  const scale = Math.max(a.scale, b.scale);

  return {
    integer:
      a.integer * 10n ** BigInt(scale - a.scale) +
      b.integer * 10n ** BigInt(scale - b.scale),
    scale,
  };
}

function assertPositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function decimalPlaces(value) {
  const text = String(value).toLowerCase();
  const [coefficient, exponentText] = text.split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const fractionLength = (coefficient.split(".")[1] ?? "").length;

  return Math.max(0, fractionLength - exponent);
}

function ceilDecimalRatio(numerator, denominator) {
  const a = typeof numerator === "object"
    ? numerator
    : decimalValue(numerator);
  const b = typeof denominator === "object"
    ? denominator
    : decimalValue(denominator);

  if (a.integer <= 0n || b.integer <= 0n) {
    throw new RangeError("Quantity ratio requires positive values.");
  }

  const scaledNumerator =
    a.integer * 10n ** BigInt(b.scale);
  const scaledDenominator =
    b.integer * 10n ** BigInt(a.scale);

  return (
    scaledNumerator + scaledDenominator - 1n
  ) / scaledDenominator;
}

function quantityFromStepUnits(units, step) {
  const precision = decimalPlaces(step);

  if (precision > 12) {
    throw new RangeError("Quantity calculation exceeds supported precision.");
  }

  const stepParts = decimalValue(step);
  const scaledInteger = units * stepParts.integer;
  const digits = scaledInteger.toString();
  const padded = digits.padStart(stepParts.scale + 1, "0");
  const quantityText = stepParts.scale === 0
    ? digits
    : `${padded.slice(0, -stepParts.scale)}.${padded.slice(-stepParts.scale)}`;
  const quantity = Number(quantityText);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new RangeError("Calculated quantity must be positive and finite.");
  }

  return quantity;
}

export function calculateMinimumQuantity({
  side,
  price,
  quantityStep,
  minQuantity = quantityStep,
  minQuoteAmount,
  maxQuoteAmount = Infinity,
  availableQuoteBalance,
  availableBaseBalance,
  feeRate,
  maxTradeValue,
}) {
  if (side !== "BUY" && side !== "SELL") {
    throw new RangeError('side must be "BUY" or "SELL".');
  }

  assertPositive(price, "price");
  assertPositive(quantityStep, "quantityStep");
  assertPositive(minQuantity, "minQuantity");
  assertPositive(minQuoteAmount, "minQuoteAmount");
  assertPositive(maxTradeValue, "maxTradeValue");

  if (
    !(maxQuoteAmount === Infinity ||
      (Number.isFinite(maxQuoteAmount) && maxQuoteAmount > 0))
  ) {
    throw new RangeError(
      "maxQuoteAmount must be positive or Infinity."
    );
  }

  if (
    !Number.isFinite(feeRate) ||
    feeRate < 0 ||
    feeRate > 1
  ) {
    throw new RangeError("feeRate must be between 0 and 1.");
  }

  assertNonNegative(availableQuoteBalance, "availableQuoteBalance");
  assertNonNegative(availableBaseBalance, "availableBaseBalance");

  const quantityUnitsFromMinimum = ceilDecimalRatio(
    minQuantity,
    quantityStep
  );
  const quoteValuePerStep = multiplyDecimals(price, quantityStep);
  const quantityUnitsFromValue = ceilDecimalRatio(
    minQuoteAmount,
    quoteValuePerStep
  );
  const quantityUnits = quantityUnitsFromMinimum > quantityUnitsFromValue
    ? quantityUnitsFromMinimum
    : quantityUnitsFromValue;
  const quantity = quantityFromStepUnits(quantityUnits, quantityStep);
  const tradeValue = quantity * price;
  const fee = tradeValue * feeRate;
  const totalCost = tradeValue + fee;

  if (
    !Number.isFinite(tradeValue) ||
    !Number.isFinite(fee) ||
    !Number.isFinite(totalCost)
  ) {
    throw new RangeError("Calculated trade values must be finite.");
  }

  const exactTradeValue = multiplyDecimals(quantity, price);
  const exactFee = multiplyDecimals(exactTradeValue, feeRate);
  const exactTotalCost = addDecimals(exactTradeValue, exactFee);

  if (compareDecimals(exactTradeValue, minQuoteAmount) < 0) {
    throw new RangeError(
      "Quantity does not satisfy the minimum quote amount."
    );
  }

  if (compareDecimals(quantity, minQuantity) < 0) {
    throw new RangeError("Quantity is below the minimum quantity.");
  }

  if (
    maxQuoteAmount !== Infinity &&
    compareDecimals(exactTradeValue, maxQuoteAmount) > 0
  ) {
    throw new RangeError("Trade exceeds the exchange maximum quote amount.");
  }

  if (compareDecimals(exactTradeValue, maxTradeValue) > 0) {
    throw new RangeError("Trade exceeds the Risk Manager limit.");
  }

  if (
    side === "BUY" &&
    compareDecimals(exactTotalCost, availableQuoteBalance) > 0
  ) {
    throw new RangeError("Insufficient simulated quote balance.");
  }

  if (
    side === "SELL" &&
    compareDecimals(quantity, availableBaseBalance) > 0
  ) {
    throw new RangeError("Insufficient simulated base balance.");
  }

  return {
    side,
    quantity,
    price,
    tradeValue,
    fee,
    feeRate,
    totalCost,
    minQuantity,
    quantityStep,
    minQuoteAmount,
  };
}

function assertNonNegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `${name} must be a non-negative finite number.`
    );
  }
}
