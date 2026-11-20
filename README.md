# TON Yields Bot

A Telegram bot that publishes a daily digest of TON DeFi yields (the TON coin is called GRAM since June 2026): liquid staking, lending, vaults and stable pools, with APY, TVL and links to each protocol's app.

Link - https://t.me/ton_yields_daily

## Features

- Groups opportunities by asset (GRAM and its liquid staking tokens, stablecoins), then by protocol
- TOP-5 of the day: known TVL of at least $10K, APY up to 100%, no hacked protocols, one place per protocol and asset class
- Shows only yields without impermanent loss in the asset sections; GRAM-USDT pools get their own section and never enter the TOP-5
- APY with a 7-day average and direction arrows, utilisation for lending vaults, TVL with a ⚠️ flag below $10K, a 🚨 mark for hacked protocols
- TON DeFi TVL with its 24h change in the header
- Posts once a day to a Telegram channel

## Data Sources

- **DefiLlama**: EVAA and other TON pools, Ethena sUSDe APY and tsUSDe TVL on TON, the GRAM price, the header TVL
- **Swap.coffee**: liquid staking (Tonstakers, Stakee, Hipo, KTON, Bemo), Storm Trade, Ston.fi and Tonco pools
- **Palette**: APR overrides for the pools it covers, plus TVL for Hipo and the Storm Trade vaults (applied on top of the other sources)
- **GTC (Gift To Credit)**: GRAM and USDT lending vaults
- **DeDust**: GRAM-USDT pools (and impermanent-loss-free pairs from $10K TVL), from DeDust's own API

## Setup

### Prerequisites

1. [Deno](https://deno.com/) 2.x
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
# Unit tests (no network, nothing is sent)
deno task test

# Build the digest and post it to the channel in .env
deno task post

# Send a short test message to the channel in .env
deno task test-msg
```

Without a bot token (no `.env` in the current directory and no `TELEGRAM_BOT_TOKEN` variable), `deno task start` fetches the data and prints the digest to the console instead of sending it.

## Deployment (GitHub Actions)

`.github/workflows/daily-post.yml` runs `deno task post` once a day. It is scheduled for 08:00 UTC, but GitHub usually starts scheduled runs 6-10 hours late; it can also be started by hand (`workflow_dispatch`).

1. Add repository secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID`.
2. Push to `main`: the next scheduled run posts the new version.

The 7-day APY history and the 24h TVL change live in Deno KV (`./data/kv.db`), carried between runs by `actions/cache`.

## Documentation

- **[ROADMAP.md](ROADMAP.md)** - Status, plan and known issues
- **[TODO.md](TODO.md)** - Quick task list
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and release notes
- **[ETHENA_INTEGRATION.md](ETHENA_INTEGRATION.md)** - How the Ethena tsUSDe row is built
- Removed TAC integrations, kept for reference: [MERKL_INTEGRATION.md](MERKL_INTEGRATION.md), [MORPHO_INTEGRATION.md](MORPHO_INTEGRATION.md), [EULER_INTEGRATION.md](EULER_INTEGRATION.md), [YIELDFI_INTEGRATION.md](YIELDFI_INTEGRATION.md)

## License

MIT
