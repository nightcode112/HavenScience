# HavenScience

A decentralized token launchpad with bonding curve mechanisms built on **BNB Smart Chain (BSC)** and compatible with other EVM networks.

## Technology Stack

- **Blockchain**: BNB Smart Chain + EVM-compatible chains
- **Smart Contracts**: Solidity ^0.8.20
- **Frontend**: React + Vite + ethers.js + wagmi + RainbowKit
- **Backend**: Supabase + Node.js API endpoints
- **Development**: Hardhat, OpenZeppelin libraries
- **Real-time**: WebSocket-based blockchain indexer

## Supported Networks

- **BNB Smart Chain Mainnet** (Chain ID: 56)
- **BNB Smart Chain Testnet** (Chain ID: 97)

## Contract Addresses

| Network  | Factory Contract | HAVEN Token | Router V2 | WBNB |
|----------|------------------|-------------|-----------|------|
| BNB Mainnet | 0x3DeF438082Abd8dbCf03bf58a8Ad1510eaFa4629 | 0x3c06AF089F1188c8357b29bDf9f98B36E51f7690 | 0x10ED43C718714eb63d5aA57B78B54704E256024E | 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c |
| BNB Testnet | TBD | TBD | TBD | 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd |

## Features

- **Bonding Curve Token Launch**: Fair launch mechanism with automated market making
- **Multi-Pair Support**: Create tokens paired with BNB or HAVEN
- **Low-Cost Transactions**: Gas-efficient design optimized for BNB Smart Chain
- **Real-time Indexing**: WebSocket-based blockchain event monitoring
- **AI-Powered Agents**: Create intelligent trading agents with customizable strategies
- **Advanced Trading Interface**: TradingView charts, price feeds, and trade history
- **Creator Fees**: Built-in fee collection for token creators
- **Graduation Mechanism**: Automatic liquidity migration to PancakeSwap at threshold

## Project Structure

```
├── api/                    # Backend API endpoints
│   ├── blockchain/         # Blockchain data endpoints
│   ├── robot/             # AI agent endpoints
│   └── ipfs/              # IPFS upload handlers
├── contracts/             # Solidity smart contracts
├── scripts/               # Blockchain indexing scripts
├── src/
│   ├── haven-reskin/      # Main application UI
│   ├── contracts/         # Contract ABIs
│   └── lib/               # Utility libraries
└── public/                # Static assets
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A BSC RPC endpoint (Alchemy, Binance, etc.)
- Supabase account for database
- WalletConnect Project ID

### Installation

1. Clone the repository:
```bash
git clone https://github.com/nightcode112/HavenScience.git
cd HavenScience
```

2. Install dependencies:
```bash
npm install
```

3. Copy `.env.example` to `.env` and fill in your configuration:
```bash
cp .env.example .env
```

4. Configure environment variables in `.env`:
```env
VITE_BSC_RPC_URL=your_bsc_rpc_url
VITE_FACTORY_ADDRESS=0x3DeF438082Abd8dbCf03bf58a8Ad1510eaFa4629
VITE_XTOKEN_ADDRESS=0x3c06AF089F1188c8357b29bDf9f98B36E51f7690
VITE_ROUTER_V2_ADDRESS=0x10ED43C718714eb63d5aA57B78B54704E256024E
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_KEY=your_supabase_anon_key
```

5. Run the development server:
```bash
npm run dev
```

6. (Optional) Run the blockchain indexer:
```bash
cd scripts
npm install
node realtime-indexer.js
```

## Smart Contract Development

### Compile Contracts

```bash
npx hardhat compile
```

### Deploy Router Contract

```bash
node contracts/deploy-router.js
```

### Verify on BSCScan

```bash
npx hardhat verify --network bsc <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Architecture

### Bonding Curve Mechanism

- **Initial Phase**: Tokens are bought/sold through a bonding curve
- **Graduation**: When reaching 17,000 BNB/HAVEN, liquidity migrates to PancakeSwap
- **Fee Structure**: Creator fees + protocol fees on each trade

### Real-time Indexing

The indexer monitors:
- Token creation events
- Buy/sell transactions
- Graduation events
- Creator fee collections

Data is stored in Supabase for fast queries and real-time updates.

## Security

- Contracts use OpenZeppelin libraries for standard implementations
- Reentrancy guards on all state-changing functions
- Timelocks on critical contract upgrades
- Audited bonding curve mathematics

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

This project is private and proprietary.

## Links

- **Website**: [havenscience.xyz](https://havenscience.xyz)
- **Twitter**: [@HavenScience](https://twitter.com/HavenScience)
- **Telegram**: [t.me/HavenScience](https://t.me/HavenScience)

## Support

For questions and support, please join our [Telegram community](https://t.me/HavenScience).
