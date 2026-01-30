# TON Yields Bot

A Telegram bot that aggregates and publishes daily yield/APY data from almost all TON blockchain protocols (Including TAC _(TON network extension)_ dApps) and their Telegram Mini Apps.

Link - https://t.me/ton_yields_daily

## Features

- Fetches yield data from DefiLlama API
- Fetches yield data from Merkl API (For TAC dApps)
- Fetches yield data from Goldsky API
- Fetches yield data from TON and TAC onchain contracts
- Groups opportunities by asset type (TON, Stablecoins, BTC and more major assets)
- Shows APY (base + rewards), TVL, and direct links
- Posts daily updates to a Telegram channel

## Setup

### Prerequisites


2. A Telegram Bot (create via [@BotFather](https://t.me/BotFather))
3. A Telegram Channel with your bot as admin

### Configuration

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your credentials:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_CHANNEL_ID=@your_channel_here
   ```

### Running Locally

```bash
# Development mode (with hot reload)
deno task dev

# Production mode
deno task start
```

## Deployment (Deno Deploy)

1. Push your code to GitHub
2. Go to [Deno Deploy](https://deno.com/deploy)
3. Create a new project and link your repository
4. Set environment variables in the dashboard:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHANNEL_ID`
5. Deploy!

The bot will automatically post daily updates at 9:00 UTC.

## Data Sources

- **DefiLlama API** - Aggregated yield data from TON protocols
- **Merkl API** - TAC dApps rewards (Curve, Morpho, Euler, Carbon, Snap)
- Protocols tracked: 20+ protocols across TON and TAC chains

## Documentation

- **[ROADMAP.md](ROADMAP.md)** - Complete development roadmap and feature tracking
- **[TODO.md](TODO.md)** - Quick task list for day-to-day development
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and release notes
- **[MERKL_INTEGRATION.md](MERKL_INTEGRATION.md)** - TAC integration details

## License

MIT
