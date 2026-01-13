# Changelog

All notable changes to TON Yields Bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-01-13

### Added
- **YieldFi Protocol Integration**
  - yUSD vault (9.03% APY)
  - vyUSD vault (10.13% APY)
  - Fallback APY data until TAC contract addresses available
  - See [YIELDFI_INTEGRATION.md](YIELDFI_INTEGRATION.md) for details
  
### Notes
- YieldFi yields currently use static APY values from their frontend
- TVL data pending (will show $0 until smart contract integration)
- Future update will add direct ERC-4626 vault queries once contracts are deployed on TAC

## [1.0.0] - 2026-01-09

### Added
- **Core Features**
  - Telegram bot with grammY framework
  - Daily automated posts at 9:00 UTC using Deno.cron
  - DefiLlama API integration for TON native protocols
  - Merkl API integration for TAC dApps (Chain ID 239)
  
- **Data Processing**
  - Asset classification (TON, Stablecoins, BTC)
  - Correlated pairs filtering (prevents IL risk)
  - Duplicate asset labeling for multiple pools
  - APR to APY conversion for Merkl rewards
  
- **Message Formatting**
  - Group yields by asset type
  - Group by protocol within categories
  - Top 5 yield opportunities section
  - HTML formatting with clickable protocol links
  - APY breakdown (base + rewards)
  - Human-readable TVL display ($1.5M format)
  
- **Protocol Support**
  - TON Native: Storm Trade, EVAA, Affluent, Hipo, Ston.fi, DeDust, Tonstakers, Daolama, FIVA, Swap.coffee
  - TAC dApps: Curve, Morpho, Euler, Carbon, Snap
  
- **Bot Commands**
  - `/start` - Welcome message
  - `/help` - Help information
  - `/yields` - Get current yields snapshot
  
- **Developer Tools**
  - Test mode (console output without Telegram)
  - Manual post trigger (`--post-now`)
  - Environment configuration with `.env`
  - Comprehensive logging

### Security
- Exclude memecoins (NOT, DOGS, HMSTR, CATI, etc.)
- Filter minimum TVL ($10k threshold)
- Validate APY ranges (0% - 10,000%)
- Gitignore for sensitive data (.env)

### Documentation
- README with setup instructions
- MERKL_INTEGRATION.md for TAC integration
- .env.example template
- ROADMAP.md for project tracking
- TODO.md for quick tasks
- This CHANGELOG.md

## [1.2.0] - 2026-01-12

### Added
- **Euler Integration**
  - Direct smart contract integration using ethers.js
  - Fetches vault data from Euler contracts on TAC chain via RPC
  - Reads supply APY directly from `interestRateInfo.supplyAPY` (25 decimals precision)
  - Batch processing of verified vaults (5 vaults per batch)
  - Support for Euler Perspective and VaultLens contracts
  - Real-time on-chain data (no indexer delays)

- **Technical Improvements**
  - Added ethers.js v6 to dependencies (npm:ethers@^6.13.0)
  - TAC RPC endpoint integration (https://rpc.ankr.com/tac)
  - Enhanced vault data transformation with fallback structure handling
  - BigInt to APY conversion utilities

### Changed
- Updated data sources to include four sources: DefiLlama, Merkl, Morpho Goldsky, and Euler Contracts
- Improved error handling for contract calls
- Enhanced batch processing with retry logic

### Documentation
- Created EULER_INTEGRATION.md with technical details
- Updated TODO.md to mark Euler as completed
- Updated ROADMAP.md with Euler integration status

## [1.1.0] - 2026-01-10

### Added
- **Morpho Integration**
  - Morpho Goldsky subgraph integration for TAC chain lending markets
  - GraphQL query support for Morpho Blue markets
  - Supply APY (LENDER rates) extraction
  - Test token filtering (BMW, LADA, etc.)
  - Minimum token balance threshold for active markets

- **Technical Improvements**
  - `--allow-import` flag added to all deno tasks
  - Cleaned up test scripts after Morpho research
  - Enhanced market filtering (min 10 tokens, min 0.1% APY)

### Changed
- Updated data sources to include three APIs: DefiLlama, Merkl, and Morpho Goldsky
- Improved protocol URL mappings for TAC dApps
- Enhanced asset classification for TAC-bridged assets

### Fixed
- Corrected corrupted deno.json task definition for `test-msg`
- Added missing `--unstable-cron` flag to `post` task

## [Unreleased]

### Planned
- Historical APY tracking (7-day averages)
- APY delta vs yesterday
- TON wallet yields (Telegram Wallet, MyTonWallet, Tonkeeper)
- Carbon DeFi DEX exploration
- Alert system for APY changes
- ETH and TAC asset clusters
- Web dashboard with Fresh

---

## Version Guidelines

- **Major (X.0.0)**: Breaking changes, major redesign
- **Minor (1.X.0)**: New features, protocol additions
- **Patch (1.0.X)**: Bug fixes, small improvements

---

**Legend:**
- `Added` - New features
- `Changed` - Changes to existing functionality
- `Deprecated` - Features being removed in future
- `Removed` - Features removed
- `Fixed` - Bug fixes
- `Security` - Security improvements
