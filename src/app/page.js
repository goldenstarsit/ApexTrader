"use client";

import { useEffect, useState } from "react";
import { mergeMarketResults } from "./market-data-state.js";
import { formatAge, formatTimestamp } from "./market-data-format.js";

const markets = [
  { symbol: "BTCUSDT", pair: "BTC / USDT" },
  { symbol: "ETHUSDT", pair: "ETH / USDT" },
  { symbol: "BNBUSDT", pair: "BNB / USDT" },
];

const strategies = [
  {
    name: "DCA Strategy",
    detail: "Dollar-cost averaging",
    status: "Not configured",
  },
  {
    name: "Grid Strategy",
    detail: "Grid-based trading",
    status: "Not configured",
  },
];

function formatPrice(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value);
}

function formatChange(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}



function Sidebar() {
  return (
    <aside className="sidebar">
      <a className="brand" href="#overview" aria-label="Apex Trader home">
        <span className="brand-mark">A</span>
        <span>
          <strong>Apex Trader</strong>
          <small>Trading workspace</small>
        </span>
      </a>

      <p className="nav-label">WORKSPACE</p>
      <nav className="navigation" aria-label="Main navigation">
        <a className="nav-link active" href="#overview">
          <span aria-hidden="true">◫</span> Overview
        </a>
        <a className="nav-link" href="#markets">
          <span aria-hidden="true">⌁</span> Markets
        </a>
        <a className="nav-link" href="#strategies">
          <span aria-hidden="true">⟳</span> Strategies
        </a>
        <a className="nav-link" href="#risk">
          <span aria-hidden="true">◇</span> Risk management
        </a>
      </nav>

      <div className="sidebar-footer">
        <span className="status-dot" />
        <span>
          <strong>Public market data</strong>
          <small>No exchange account connected</small>
        </span>
      </div>
    </aside>
  );
}

function MetricCard({ label, value, note }) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-note">{note}</p>
    </article>
  );
}

function MarketTable() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [clockNow, setClockNow] = useState(null);

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let activeController = null;

    async function loadMarkets() {
      if (stopped || inFlight) {
        return;
      }

      inFlight = true;
      const controller = new AbortController();
      activeController = controller;

      try {
        const outcomes = await Promise.allSettled(
          markets.map(async (market) => {
            const response = await fetch(
              `/api/market-data?symbol=${market.symbol}&interval=5m&limit=12`,
              { signal: controller.signal, cache: "no-store" },
            );

            if (!response.ok) {
              const body = await response.json().catch(() => null);
              throw new Error(
                body?.error?.message || `Market request failed (${response.status}).`,
              );
            }

            const body = await response.json();
            const result = body?.data;

            if (
              result?.symbol !== market.symbol ||
              !Number.isFinite(result.price) ||
              !Array.isArray(result.closingPrices) ||
              result.closingPrices.length < 2 ||
              !result.closingPrices.every(
                (price) => Number.isFinite(price) && price > 0,
              )
            ) {
              throw new Error(`Invalid market data received for ${market.symbol}.`);
            }

            const firstClose = result.closingPrices[0];
            const lastClose =
              result.closingPrices[result.closingPrices.length - 1];

            return {
              ...market,
              price: result.price,
              change:
                ((lastClose - firstClose) / firstClose) * 100,
            };
          }),
        );

        if (!stopped) {
          const failedCount = outcomes.filter(
            (outcome) => outcome.status === "rejected",
          ).length;

          setData((previousData) =>
            mergeMarketResults(markets, outcomes, previousData),
          );
          setError(
            failedCount === 0
              ? ""
              : `${failedCount} market request${failedCount === 1 ? "" : "s"} failed. Check each row's status.`,
          );
          setUpdatedAt(new Date());
        }
      } catch (requestError) {
        if (!stopped && requestError.name !== "AbortError") {
          setError(
            requestError.message ||
              "Market data is temporarily unavailable. Please retry shortly.",
          );
        }
      } finally {
        inFlight = false;

        if (!stopped) {
          setLoading(false);
        }

        if (activeController === controller) {
          activeController = null;
        }
      }
    }

    loadMarkets();
    const timer = setInterval(loadMarkets, 30_000);
    const clockTimer = setInterval(() => setClockNow(Date.now()), 1000);

    return () => {
      stopped = true;
      clearInterval(timer);
      clearInterval(clockTimer);
      activeController?.abort();
    };
  }, []);

  return (
    <section className="panel" id="markets">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">MARKET WATCH</p>
          <h2>Market overview</h2>
        </div>
        <span className="live-tag">
          <span className="status-dot" />
          MEXC public
        </span>
      </div>

      <div className="market-status" aria-live="polite">
        {loading && <p>Loading live market data…</p>}
        {!loading && (
          <div>
            <p>
              {updatedAt
                ? `Last refresh attempt: ${updatedAt.toLocaleTimeString()}`
                : "Waiting for market data"}
            </p>
            <p>Last successful update and its age are shown for each market below.</p>
          </div>
        )}
        {error && (
          <p className="market-error" role="status">
            {error}
          </p>
        )}
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Trading pair</th>
              <th>Last price</th>
              <th>Recent candle move</th>
              <th>Last successful update</th>
              <th>Data status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((market) => (
              <tr key={market.symbol}>
                <td className="pair-name">{market.pair}</td>
                <td>
                  {market.price === null
                    ? "—"
                    : formatPrice(market.price)}
                </td>
                <td
                  className={
                    market.change > 0
                      ? "positive"
                      : market.change < 0
                        ? "negative"
                        : ""
                  }
                >
                  {market.change === null
                    ? "—"
                    : formatChange(market.change)}
                </td>
                <td>
                  <span>{formatTimestamp(market.lastSuccessfulAt)}</span>
                  <small className="market-age">
                    {formatAge(market.lastSuccessfulAt, clockNow)}
                  </small>
                </td>
                <td className={`market-freshness ${market.freshness}`}>
                  <span>
                    {market.freshness === "fresh"
                      ? "Fresh"
                      : market.freshness === "stale"
                        ? "Stale"
                        : "Unavailable"}
                  </span>
                  {market.errorMessage && (
                    <small className="market-row-error">
                      {market.errorMessage}
                    </small>
                  )}
                </td>
              </tr>
            ))}

            {loading && data.length === 0 && (
              <tr>
                <td colSpan={5}>Fetching prices from MEXC…</td>
              </tr>
            )}

            {!loading && data.length === 0 && error && (
              <tr>
                <td colSpan={5}>No market data available.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="panel-footnote">
        Prices come from the MEXC public API through this app’s market-data
        route. Recent candle move compares the first and last closing prices
        in the returned candle window; it is not the 24-hour change.
        Updates are attempted every 30 seconds. No trading orders are sent.
      </p>
    </section>
  );
}

function StrategyPanel() {
  return (
    <section className="panel" id="strategies">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AUTOMATION</p>
          <h2>Your strategies</h2>
        </div>
        <span className="count-tag">{strategies.length} templates</span>
      </div>

      <div className="strategy-list">
        {strategies.map((strategy) => (
          <article className="strategy-item" key={strategy.name}>
            <div className="strategy-icon" aria-hidden="true">
              {strategy.name.startsWith("DCA") ? "D" : "G"}
            </div>
            <div className="strategy-info">
              <h3>{strategy.name}</h3>
              <p>{strategy.detail}</p>
            </div>
            <span className="strategy-status">{strategy.status}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="app-shell" id="overview">
      <Sidebar />

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">TRADING PLATFORM</p>
            <h1>Overview</h1>
          </div>
          <span className="environment-badge">
            <span className="status-dot" />
            Simulation mode
          </span>
        </header>

        <section className="welcome-section">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h2>Trade with a plan.</h2>
            <p className="welcome-copy">
              Monitor markets, prepare strategies, and keep risk management
              at the center of your workflow.
            </p>
          </div>
          <div className="welcome-decoration" aria-hidden="true">
            <span>APEX</span>
            <strong>01</strong>
          </div>
        </section>

        <section className="metrics-grid" aria-label="Account summary">
          <MetricCard
            label="Portfolio balance"
            value="$10,000.00"
            note="Illustrative starting balance"
          />
          <MetricCard
            label="Active strategies"
            value="0"
            note="No strategies running"
          />
          <MetricCard
            label="Today's P&L"
            value="$0.00"
            note="No trades recorded"
          />
        </section>

        <div className="content-grid">
          <MarketTable />
          <StrategyPanel />
        </div>

        <section className="risk-notice" id="risk">
          <span className="risk-icon" aria-hidden="true">
            ◇
          </span>
          <div>
            <h2>Risk controls come first</h2>
            <p>
              Trading is disabled in this initial interface. Market prices are
              public exchange data; account balances and strategy metrics
              remain illustrative until their respective modules are connected.
            </p>
          </div>
        </section>

        <footer className="page-footer">
          <span>Apex Trader</span>
          <span>Simulation · Public market data</span>
        </footer>
      </main>
    </div>
  );
}
