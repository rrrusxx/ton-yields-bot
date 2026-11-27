# TON Yields Bot

A Telegram bot that publishes a daily digest of TON DeFi yields (the TON coin is called GRAM since June 2026): liquid staking, lending, vaults and stable pools, with APY, TVL and links to each protocol's app.

Link - https://t.me/ton_yields_daily

## Features

- Groups opportunities by asset (GRAM and its liquid staking tokens, stablecoins), then by protocol
- TOP-5 of the day: known TVL of at least $10K, APY up to 100%, no hacked protocols, one place per protocol and asset class
- Shows only yields without impermanent loss in the asset sections; GRAM-USDT pools get their own section and never enter the TOP-5
- APY with a 7-day average and direction arrows, utilisation for lending vaults, TVL with a ⚠️ flag below $10K, a 🚨 mark for hacked protocols
- TON DeFi TVL with its 24h change in the header
- Posts once a day to a Telegram channel, with Share and How-we-calculate buttons and the time in each reader's time zone
- "Since yesterday" block: TOP-5 changes, notable APY moves, pools that joined or left, newly flagged hacks
- A weekly image card on Mondays (liquid staking 7-day APY measured on-chain, the best stablecoin pools)
- Optional rich message format (`POST_FORMAT=rich`): tables and collapsible sections in the app; the channel's web page shows such posts only as a stub, so the default stays the classic post

## Data Sources

- **On-chain** (contracts read through toncenter): APY, 7-day APY and TVL of the seven liquid staking tokens (with TON Whales' wsTON), and APY over the last 7 days and TVL of the Storm Trade GRAM and USDT vaults, see [ONCHAIN_INTEGRATION.md](ONCHAIN_INTEGRATION.md)
- **DefiLlama**: EVAA and other TON pools, Ethena sUSDe APY and tsUSDe TVL on TON, the GRAM price, the header TVL
- **Swap.coffee**: Ston.fi and Tonco pools, and the fallback for liquid staking and Storm Trade rows
- **Palette**: APR overrides for EVAA's USDT pools; for the liquid staking tokens (APR, and Hipo's TVL) and the Storm Trade vaults (APR) only when they fall back to Swap.coffee, otherwise a logged cross-check
- **GTC (Gift To Credit)**: GRAM and USDT lending vaults
- **tonapi**: TON Whales native staking (the open nominator pools; their own APY estimate, marked "est.")
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

`.github/workflows/daily-post.yml` runs `deno task post`. An outside scheduler (cron-job.org) starts it at 08:00 UTC through GitHub's `workflow_dispatch` API, because GitHub's own schedule starts runs hours late; `daily-post-fallback.yml` keeps that late schedule as a fallback. The bot posts at most once per UTC day. A retry at 08:30 and a healthchecks.io watchdog are supported but not set up for this channel yet (see "Current setup" in HOSTING.md). Setup and day-to-day details: [HOSTING.md](HOSTING.md).

1. Add repository secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID` (and optionally `TONCENTER_API_KEY`, which speeds up the on-chain engine, `HC_PING_URL` for the watchdog, and `TEST_TELEGRAM_BOT_TOKEN` / `TEST_TELEGRAM_CHANNEL_ID` for test runs).
2. Push to `main`: the next post uses the new version (a run on a day whose post is already out does nothing).

The 7-day APY history and the 24h TVL change live in Deno KV (`./data/kv.db`), carried between runs by `actions/cache`.

## Documentation

- **[ROADMAP.md](ROADMAP.md)** - Status, plan and known issues
- **[TODO.md](TODO.md)** - Quick task list
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and release notes
- **[ONCHAIN_INTEGRATION.md](ONCHAIN_INTEGRATION.md)** - How liquid staking and Storm Trade vault yields are read from the contracts
- **[HOSTING.md](HOSTING.md)** - How the daily run starts on time, the once-a-day guard, the watchdog, and the one-time setup
- **[ETHENA_INTEGRATION.md](ETHENA_INTEGRATION.md)** - How the Ethena tsUSDe row is built
- Removed TAC integrations, kept for reference: [MERKL_INTEGRATION.md](MERKL_INTEGRATION.md), [MORPHO_INTEGRATION.md](MORPHO_INTEGRATION.md), [EULER_INTEGRATION.md](EULER_INTEGRATION.md), [YIELDFI_INTEGRATION.md](YIELDFI_INTEGRATION.md)

## License

MIT
