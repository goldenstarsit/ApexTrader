export function formatAge(timestamp, now) {
  if (!timestamp) {
    return "Never";
  }

  if (!Number.isFinite(now)) {
    return "Unknown";
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - Date.parse(timestamp)) / 1000),
  );

  if (!Number.isFinite(elapsedSeconds)) {
    return "Unknown";
  }

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const minutes = Math.floor(elapsedSeconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}

export function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "Never";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleTimeString();
}

export function formatPrice(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value);
}

export function formatChange(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
