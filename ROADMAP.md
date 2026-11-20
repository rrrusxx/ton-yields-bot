# TON Yields Bot - Development Roadmap

## 📊 Project Overview

Telegram bot that aggregates yield opportunities from TON DeFi (the TON coin is called GRAM since June 2026), posting daily summaries to a Telegram channel.

**Current Version:** v1.4.0  
**Status:** ✅ In production (GitHub Actions, scheduled for 08:00 UTC; GitHub usually starts it 6-10 hours late)

---

## 📍 Status and Plan (November 20, 2026)

**v1.4.0 (hotfix after the November 2026 audit):** Hipo restored, TOP-5 rules, TAC sources and the Midas vault removed, Affluent marked as hacked, Ethena and GTC TVL fixed, Hipo and Storm vault TVL from Palette, 7-day averages limited to the last 7 days, HTML escaping with one-line names capped at 64 characters, sturdier handling of "NaN" values and GTC renames, DeDust GRAM-USDT pools from DeDust's own API, Ston.fi GRAM-USDT pools labelled v1/v2, leftover `Deno.cron` removed, first unit tests. Details in [CHANGELOG.md](CHANGELOG.md).

**Next, in order:**
1. **Own on-chain engine.** Realized APY of all six LSTs from each contract's exchange rate over whole validation cycles, net of protocol fees, for every LST including Tonstakers and Bemo (decided 2026-11-20); Palette becomes a cross-check and "⛓ on-chain" goes into the footer. Then EVAA, Storm vaults and tsUSDe; DEX pools from Ston.fi and DefiLlama instead of Swap.coffee.
2. **Hosting.** Run the daily job on a scheduler that starts on time and alerts on failure. Proposed: Supabase Cron + Edge Function + Postgres for history, plus a healthchecks.io watchdog. GitHub Actions stays for code and manual runs.
3. **Reliability.** Retries, one DefiLlama download per run, source fallbacks, a source health summary, a guard against duplicate posts, stable history keys.
4. **New post format.** Top yields per asset, a "since yesterday" block, a Telegram Rich Messages pilot in the test channel.
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

- Swap.coffee is the only source for most LST and DEX rows; when it fails, those rows disappear from the post.
- The GitHub schedule starts hours late, and a public repo loses its schedule after 60 days without commits.
- Tonco GRAM-USDT shows an outlier APR (often above 70%); it stays in the GRAM-USDT section and never enters the TOP-5.
- When Palette is down, Hipo and Storm Trade vault TVLs fall back to Swap.coffee, which reports them 9-20% too low (Hipo at hGRAM supply x GRAM price, Storm without locked funds).
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

### v1.4.0 (Current) - November 2026
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
