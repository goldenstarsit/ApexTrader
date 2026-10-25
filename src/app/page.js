const marketData = [
  { pair: "BTC / USDT", price: "$67,420.50", change: "+2.41%", positive: true },
  { pair: "ETH / USDT", price: "$3,520.80", change: "+1.18%", positive: true },
  { pair: "BNB / USDT", price: "$612.40", change: "-0.62%", positive: false },
];

const strategies = [
  { name: "DCA Strategy", detail: "Dollar-cost averaging", status: "Not configured" },
  { name: "Grid Strategy", detail: "Grid-based trading", status: "Not configured" },
];

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
          <strong>Demo workspace</strong>
          <small>No exchange connected</small>
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
  return (
    <section className="panel" id="markets">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">MARKET WATCH</p>
          <h2>Market overview</h2>
        </div>
        <span className="demo-tag">Sample data</span>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Trading pair</th>
              <th>Last price</th>
              <th>24h change</th>
            </tr>
          </thead>
          <tbody>
            {marketData.map((market) => (
              <tr key={market.pair}>
                <td className="pair-name">{market.pair}</td>
                <td>{market.price}</td>
                <td className={market.positive ? "positive" : "negative"}>
                  {market.change}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-footnote">
        Illustrative prices only — not live exchange data.
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
          <span className="risk-icon" aria-hidden="true">◇</span>
          <div>
            <h2>Risk controls come first</h2>
            <p>
              Trading is disabled in this initial interface. Exchange
              connectivity, strategy execution, and risk controls will be
              implemented in later milestones.
            </p>
          </div>
        </section>

        <footer className="page-footer">
          <span>Apex Trader</span>
          <span>Prototype · Demo data only</span>
        </footer>
      </main>
    </div>
  );
}
