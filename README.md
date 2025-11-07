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

### Core Contracts (BNB Mainnet)

| Contract | Address |
|----------|---------|
| **Router** | [0x6Ddd5E057112Bb89909Fb29c847E21f3cdEb0b83](https://bscscan.com/address/0x6Ddd5E057112Bb89909Fb29c847E21f3cdEb0b83) |
| **HAVEN Factory** | [0x1F9592f6d9F5E0BB74f33E0383490889ff273d0F](https://bscscan.com/address/0x1F9592f6d9F5E0BB74f33E0383490889ff273d0F) |
| **BNB Factory** | [0xACa75645477cc778Fea1F4676F13DcB4002a7A55](https://bscscan.com/address/0xACa75645477cc778Fea1F4676F13DcB4002a7A55) |
| **HAVEN Token** | [0x0Cce89Fb7f51aDB16Cd1e18be58457a70F5D93e7](https://bscscan.com/address/0x0Cce89Fb7f51aDB16Cd1e18be58457a70F5D93e7) |
| **Test Token (BNB)** | [0x619E5F39A2aaCB5b978384deF6e03D75543878E9](https://bscscan.com/address/0x619E5F39A2aaCB5b978384deF6e03D75543878E9) |

### Helper Contracts

| Contract | Address |
|----------|---------|
| **Graduation Helper (HAVEN)** | [0xa712C4cAf86Db9A081B01cc6BC2E161Ad4facde5](https://bscscan.com/address/0xa712C4cAf86Db9A081B01cc6BC2E161Ad4facde5) |
| **Graduation Helper (BNB)** | [0xBBe87C5EA93D62f97564f8c00f8C22729Af502Ab](https://bscscan.com/address/0xBBe87C5EA93D62f97564f8c00f8C22729Af502Ab) |
| **Address Predictor (HAVEN)** | [0x3652bb6275AE44603e0155F55298D5B1004D3151](https://bscscan.com/address/0x3652bb6275AE44603e0155F55298D5B1004D3151) |
| **Address Predictor (BNB)** | [0x00d07083292f830905E97eDE6E76286299C436C8](https://bscscan.com/address/0x00d07083292f830905E97eDE6E76286299C436C8) |
| **Deployer Library** | [0x1a581B32f0d2788f0ec25a4683A891e91Df988ba](https://bscscan.com/address/0x1a581B32f0d2788f0ec25a4683A891e91Df988ba) |

### Standard Contracts

| Contract | Address |
|----------|---------|
| **PancakeSwap Router V2** | [0x10ED43C718714eb63d5aA57B78B54704E256024E](https://bscscan.com/address/0x10ED43C718714eb63d5aA57B78B54704E256024E) |
| **WBNB** | [0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c](https://bscscan.com/address/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c) |

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

- **Website**: [haven.science](https://haven.science/)
- **Documentation**: [docs.haven.science](https://docs.haven.science/)
- **Twitter**: [@HavenLabs_](https://x.com/HavenLabs_)
- **Telegram**: [t.me/haven_labs](https://t.me/haven_labs)
- **Discord**: [discord.gg/3bMDdEqf](https://discord.com/invite/3bMDdEqf)
- **Linktree**: [linktr.ee/HavenLabs](https://linktr.ee/HavenLabs)

## Support

For questions and support, please join our [Telegram community](https://t.me/haven_labs) or [Discord server](https://discord.com/invite/3bMDdEqf).
