# Apex Trader

A modular trading platform built around configurable strategies, separated
application modules, and risk management.

## Current Status

This project currently contains a responsive dashboard prototype with
illustrative market data. Exchange connectivity and trade execution are not
implemented.

## Technology

- JavaScript (ES modules)
- Next.js App Router and React
- Plain CSS
- pnpm
- SQLite planned for the initial persistence layer

## Architecture Goals

- Separate the dashboard from trading and business logic.
- Use abstractions and dependency inversion between application modules.
- Keep exchange access, balances, persistence, execution, and risk management
  behind clear interfaces.
- Give each strategy type its own configuration abstraction and implementation.
- Keep database access replaceable for a future migration from SQLite.
- Start with a single-user setup while allowing future expansion.

## Planned Strategies

- Dollar-cost averaging (DCA)
- Grid trading

Strategy execution, exchange connectivity, persistent balances, and production
risk controls remain future work.

## Requirements

- Node.js compatible with the installed Next.js version
- pnpm

## Development

Install dependencies:

    pnpm install

Start the development server:

    pnpm dev

Open http://localhost:3000 in your browser.

## Verification

Run lint checks:

    pnpm lint

Run the production build in Termux:

    pnpm build --webpack

## Safety

Displayed prices, balances, and profit-and-loss figures are illustrative only.
They are not live financial information. Real trading must remain disabled until
exchange integration, execution safeguards, and risk controls are implemented
and tested.
