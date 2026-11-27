# TON Yields Bot - Development Roadmap

## 📊 Project Overview

Telegram bot that aggregates yield opportunities from TON DeFi (the TON coin is called GRAM since June 2026), posting daily summaries to a Telegram channel.

**Current Version:** v1.7.0  
**Status:** ✅ In production (GitHub Actions, started at 08:00 UTC by a cron-job.org job set up on 2026-11-25, with GitHub's late fallback schedule as the backup; see HOSTING.md)

---

## 📍 Status and Plan (November 23, 2026)

**v1.4.0 (hotfix after the November 2026 audit):** Hipo restored, TOP-5 rules, TAC sources and the Midas vault removed, Affluent marked as hacked, Ethena and GTC TVL fixed, Hipo and Storm vault TVL from Palette, 7-day averages limited to the last 7 days, HTML escaping with one-line names capped at 64 characters, sturdier handling of "NaN" values and GTC renames, DeDust GRAM-USDT pools from DeDust's own API, Ston.fi GRAM-USDT pools labelled v1/v2, leftover `Deno.cron` removed, first unit tests. Details in [CHANGELOG.md](CHANGELOG.md).

**v1.5.0:** own on-chain engine for the six LSTs (APY and 7d value from the contracts, net of protocol fees) and the Storm Trade GRAM and USDT vaults (7-day APY, LP-pool TVL), "⛓️ on-chain" in the footer. Details in [ONCHAIN_INTEGRATION.md](ONCHAIN_INTEGRATION.md).

**Next, in order:**
1. **On-chain engine, the rest.** EVAA and tsUSDe from their contracts (the Storm vaults are done); DEX pools from Ston.fi and DefiLlama instead of Swap.coffee.
2. **Hosting.** Done (v1.6.0 in code, live since 2026-11-25): a cron-job.org job starts the GitHub workflow at 08:00 UTC, with a once-a-day guard. The 08:30 retry job and the healthchecks.io watchdog are ready in code and HOSTING.md but postponed by the owner. Supabase and Deno Deploy were considered and not used (see HOSTING.md).
3. **Reliability.** Retries, one DefiLlama download per run, source fallbacks, a source health summary, stable history keys.
4. **Growth plan (agreed 2026-11-27).** Stage 1 done in v1.7.0 (new yields, buttons, local time, cleanup); the owner updates the channel description, pins the methodology note, sets the welcome message and posts a release note. Stage 2: a "since yesterday" block, a weekly image card for protocols and the owner's X, a Rich Messages pilot in the test channel (keep the web-readable copy). Stage 3: a static "GRAM (TON) yields today" page on GitHub Pages, evening alerts on big moves, short explainers. Later, if Telegram Serverless is free: an interactive bot and a Mini App. No paid ads for now.
5. **Platform.** Interactive bot and a Mini App dashboard.

---

## ✅ Completed Features (v1.0 - MVP)

### Core Infrastructure
- [x] Deno + TypeScript project setup
- [x] Environment configuration (.env)
- [x] TypeScript interfaces for yields data
- [x] Error handling and logging

### Data Sources
- [x] DefiLlama API integration (TON native protocols)
- [x] Merkl API integration (TAC dApps - Chain ID 239) (removed in v1.4.0)
- [x] Morpho Goldsky subgraph integration (TAC lending markets) (removed in v1.4.0)
- [x] Asset classification (TON, Stablecoins, BTC)
- [x] Correlated pairs filtering (no IL risk)
- [x] Protocol URL mappings (TMAs and websites)

### Protocols Integrated
- [x] TON Native: Storm Trade, EVAA, Affluent, Hipo, Ston.fi, DeDust, Tonstakers, etc.
- [x] TAC dApps (via Merkl): Carbon, Snap, Curve (removed in v1.4.0)
- [x] TAC dApps (via Goldsky): Morpho lending markets (removed in v1.4.0)
- [x] TAC dApps (via contracts): Euler lending vaults (removed in v1.4.0)
- [x] TAC dApps (via fallback): YieldFi (yUSD, vyUSD vaults) (removed in v1.4.0)

### Message Formatting
- [x] Group yields by asset type
- [x] Group by protocol within categories
- [x] Top 5 yield opportunities section
- [x] Clickable protocol links (HTML)
- [x] APY display with rewards breakdown
- [x] TVL display (human-readable format)
- [x] Duplicate asset labeling (#1, #2, etc.)
- [x] Clean pool names (remove "Provide liquidity to" prefix)

### Telegram Bot
- [x] grammY bot framework integration
- [x] HTML message formatting
- [x] Daily schedule (GitHub Actions at 08:00 UTC; Deno.cron removed in v1.4.0)
- [x] Bot commands (/start, /help) defined, but inactive: the bot only broadcasts and does not poll for updates
- [x] Test mode (console output without Telegram)
- [x] Manual post trigger (--post-now)

### Data Filtering
- [x] Minimum TVL threshold ($10k)
- [x] APY validation (0% - 10,000%)
- [x] Exclude memecoins (NOT, DOGS, HMSTR, etc.)
- [x] Correlated pairs only (TON-stTON, USDT-USDC, etc.)
- [x] Filter uncorrelated LP pairs out of the asset sections (GRAM-USDT pools have their own section since Jan 2026)

### Deployment Ready
- [x] Deno Deploy configuration (replaced by GitHub Actions)
- [x] .env.example template
- [x] README with setup instructions
- [x] MERKL_INTEGRATION.md documentation

---

## 📋 Planned Features

For the current order of work see "Status and Plan" at the top. The lists below are older ideas.

### Enhanced Data & Analytics

#### Historical Tracking
- [x] Store daily yield snapshots
- [x] Calculate 7-day average APYs
- [ ] Show APY delta vs yesterday (△ +0.5%)
- [x] Track APY trends (↑/↓ against the 7-day average)

#### Additional Data Sources
- [ ] Direct protocol APIs (higher accuracy)
  - [ ] Tonstakers API
  - [ ] EVAA API
  - [ ] Ston.fi API
- [ ] Manual yield entries (for protocols without APIs)
  - [ ] Walt (formerly Telegram Wallet)
  - [ ] MyTonWallet (MTW)
  - [ ] Tonkeeper

---

### User Experience

#### Message Enhancements
- [x] Asset emojis in section headers (💎 GRAM, 💵 stablecoins, ₿ BTC)
- [ ] Medal indicators (🥇🥈🥉 for top performers per category)
- [ ] Better visual separators
- [x] Header with statistics (TON DeFi TVL, # of opportunities)

#### Bot Features
- [ ] Subscribe/unsubscribe commands
- [ ] Query specific protocol (/evaa, /curve)
- [ ] Query specific asset (/ton, /usdt)
- [ ] Compare protocols side-by-side
- [ ] Set custom alert thresholds

---

### Alerts & Notifications

#### Smart Alerts
- [ ] APY change alerts (>1% increase/decrease)
- [ ] New yield opportunity alerts
- [ ] High yield alerts (>threshold APY)
- [ ] TVL change alerts (protocol growth/decline)

#### Alert Delivery
- [ ] Separate alerts channel
- [ ] User-specific DM alerts
- [ ] Configurable alert frequency
- [ ] Alert filtering by asset type

---

### Analytics Dashboard

#### Web Interface (Optional)
- [ ] Fresh framework web dashboard
- [ ] Interactive yield charts
- [ ] Historical data visualization
- [ ] Protocol comparison tools
- [ ] Export data to CSV/JSON

#### Advanced Analytics
- [ ] Risk scoring (IL risk, protocol security)
- [ ] Yield efficiency metrics
- [ ] Best opportunities by timeframe
- [ ] Portfolio optimizer suggestions

---

## 💡 Future Ideas (Backlog)

### Integrations
- [ ] More blockchains (Solana, Ethereum L2s)
- [ ] Cross-chain yield comparison
- [ ] Bridge yield opportunities
- [ ] Liquid staking aggregation

### Advanced Features
- [ ] AI-powered yield recommendations
- [ ] Wallet integration (track user positions)
- [ ] Auto-compound calculators
- [ ] Tax reporting features
- [ ] Multi-language support (Russian, Chinese)

### Community
- [ ] User yield submissions
- [ ] Community voting on protocols
- [ ] Yield farming guides
- [ ] Educational content

---

## 🐛 Known Issues

- Swap.coffee is the only source for most DEX rows; when it fails, those rows disappear from the post (LST and Storm vault rows survive: they come from the contracts).
- Until the HOSTING.md setup is done, the post still waits for GitHub's late schedule; afterwards only the fallback depends on it (and GitHub switches a schedule off after 60 days without commits).
- Tonco GRAM-USDT shows an outlier APR (often above 70%); it stays in the GRAM-USDT section and never enters the TOP-5.
- On-chain windows end at "now", not at a round boundary. KTON and Bemo payouts drift up to about 13 minutes around the cycle, so now and then a window counts a payout too many or too few. reconcile() catches it at the start of the one-cycle window, but not at "now", which both windows share (about 0.1% of runs per KTON or Bemo token, value off by about 20%). Aligning the windows to the validation round would make both values exact.
- Lending rows mix TVL meanings: EVAA shows free liquidity (supply minus borrow), GTC shows total deposits.
- No final check against Telegram's 4,096-character limit (names are capped at 64 characters; the post uses about 2,000 today).
- The header TVL counts bridges, so it is about 8% above DefiLlama's TON chain figure.

---

## 📝 Notes

### Design Decisions
- **Why correlated pairs only?** To avoid showing opportunities with impermanent loss risk
- **Why daily updates?** Balance between freshness and spam prevention

### Technical Debt
- Download the DefiLlama pools file once per run (today defillama.ts and ethena.ts each fetch it)
- Add retry logic for failed API calls
- Implement rate limiting for bot commands

---

## 🎯 Priority Legend

- 🔴 High Priority - Critical for next release
- 🟡 Medium Priority - Important but not blocking
- 🟢 Low Priority - Nice to have
- 💭 Research Needed - Needs investigation

---

## 📅 Version History

### v1.7.0 (Current) - November 2026
- TON Whales native staking (pool estimate) and wsTON (on-chain); Share and How-we-calculate buttons; time in the reader's time zone; consistent row labels; Affluent removed

### v1.6.1 - November 2026
- GTC no longer credited in the footer's sources line
- DefiLlama requests wait up to 90 s (its cold cache took 56 s on 2026-11-24)

### v1.6.0 - November 2026
- On-time start at 08:00 UTC through an outside scheduler, once-a-day guard, healthchecks.io watchdog, test runs on GitHub (see HOSTING.md)

### v1.5.0 - November 2026
- Own on-chain engine for the six liquid staking tokens and the Storm Trade GRAM and USDT vaults
- toncenter key as a secret; a wrong key is dropped and the run goes on without it
- Only GRAM and its staking tokens as single tokens in the GRAM section

### v1.4.0 - November 2026
- Hotfix after the audit: Hipo restored, TOP-5 rules, TAC and Midas sources removed, Affluent flagged as hacked, Ethena, GTC, Hipo and Storm TVL fixed, honest 7-day averages, HTML escaping

### v1.0 - January 2026
- Initial MVP release
- DefiLlama + Merkl integration
- Daily Telegram posts
- Correlated pairs filtering

---

## 🤝 Contributing

To add a new task or feature request:

1. Add it to the appropriate section above
2. Use `- [ ]` for uncompleted tasks
3. Use `- [x]` for completed tasks
4. Include priority emoji if applicable
5. Commit changes to GitHub

---

**Last Updated:** November 2026  
**Maintainer:** Ruslan Romanov
