# TON Yields Bot - Development Roadmap

## 📊 Project Overview

Telegram bot that aggregates yield opportunities from TON blockchain and TAC (The Application Chain), posting daily summaries to a Telegram channel.

**Current Version:** v1.0 (MVP)  
**Status:** ✅ Production Ready

---

## ✅ Completed Features (v1.0 - MVP)

### Core Infrastructure
- [x] Deno + TypeScript project setup
- [x] Environment configuration (.env)
- [x] TypeScript interfaces for yields data
- [x] Error handling and logging

### Data Sources
- [x] DefiLlama API integration (TON native protocols)
- [x] Merkl API integration (TAC dApps - Chain ID 239)
- [x] Morpho Goldsky subgraph integration (TAC lending markets)
- [x] Asset classification (TON, Stablecoins, BTC)
- [x] Correlated pairs filtering (no IL risk)
- [x] Protocol URL mappings (TMAs and websites)

### Protocols Integrated
- [x] TON Native: Storm Trade, EVAA, Affluent, Hipo, Ston.fi, DeDust, Tonstakers, etc.
- [x] TAC dApps (via Merkl): Carbon, Snap, Curve
- [x] TAC dApps (via Goldsky): Morpho lending markets
- [x] TAC dApps (via contracts): Euler lending vaults

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
- [x] Daily scheduler (Deno.cron at 9:00 UTC)
- [x] Bot commands (/start, /help, /yields)
- [x] Test mode (console output without Telegram)
- [x] Manual post trigger (--post-now)

### Data Filtering
- [x] Minimum TVL threshold ($10k)
- [x] APY validation (0% - 10,000%)
- [x] Exclude memecoins (NOT, DOGS, HMSTR, etc.)
- [x] Correlated pairs only (TON-stTON, USDT-USDC, etc.)
- [x] Filter uncorrelated LP pairs (no WTAC-TON, USD₮-TON, etc.)

### Deployment Ready
- [x] Deno Deploy configuration
- [x] .env.example template
- [x] README with setup instructions
- [x] MERKL_INTEGRATION.md documentation

---

## 🚧 In Progress (v1.1)

### Euler Integration ✅
- [x] Euler contract integration via ethers.js
- [x] Direct on-chain data fetching
- [x] Supply APY calculation from contracts
- [ ] Test Euler yields in production

### GitHub & Deployment
- [ ] Push code to GitHub repository (including Euler)
- [ ] Deploy to Deno Deploy
- [ ] Set up environment variables in Deno Deploy
- [ ] Test automated daily posts

---

## 📋 Planned Features

### v1.2 - Enhanced Data & Analytics

#### Historical Tracking
- [ ] Store daily yield snapshots
- [ ] Calculate 7-day average APYs
- [ ] Show APY delta vs yesterday (△ +0.5%)
- [ ] Track APY trends (📈 rising, 📉 falling)

#### Additional Data Sources
- [ ] Direct protocol APIs (higher accuracy)
  - [ ] Tonstakers API
  - [ ] EVAA API
  - [ ] Ston.fi API
- [ ] Manual yield entries (for protocols without APIs)
  - [ ] Telegram Wallet (t.me/wallet)
  - [ ] MyTonWallet (MTW)
  - [ ] Tonkeeper

#### More TAC dApps
- [ ] ZeroLend (Lending)
- [ ] IPOR Fusion
- [ ] Market.win
- [ ] Additional Bancor pools

---

### v1.3 - User Experience

#### Message Enhancements
- [ ] Asset emojis (💎 TON, 💵 USDT, ₿ BTC)
- [ ] Medal indicators (🥇🥈🥉 for top performers per category)
- [ ] Better visual separators
- [ ] Footer with statistics (Total TVL, # of opportunities)

#### Bot Features
- [ ] Subscribe/unsubscribe commands
- [ ] Query specific protocol (/evaa, /curve)
- [ ] Query specific asset (/ton, /usdt)
- [ ] Compare protocols side-by-side
- [ ] Set custom alert thresholds

---

### v1.4 - Alerts & Notifications

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

### v1.5 - Analytics Dashboard

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

- None currently reported

---

## 📝 Notes

### Design Decisions
- **Why correlated pairs only?** To avoid showing opportunities with impermanent loss risk
- **Why Merkl for TAC?** Merkl aggregates reward campaigns that aren't on DefiLlama
- **Why daily updates?** Balance between freshness and spam prevention

### Technical Debt
- Consider caching Merkl/DefiLlama responses (reduce API calls)
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

### v1.0 (Current) - January 2026
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

**Last Updated:** January 2026  
**Maintainer:** Ruslan Romanov
