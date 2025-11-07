import { config as dotenvConfig } from 'dotenv';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-verify';

dotenvConfig();

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    bsc: {
      type: 'http',
      url: process.env.BSC_RPC_URL || process.env.VITE_BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: process.env.BSC_PRIVATE_KEY ? [process.env.BSC_PRIVATE_KEY] : [],
    },
    bscTestnet: {
      type: 'http',
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: process.env.BSC_PRIVATE_KEY ? [process.env.BSC_PRIVATE_KEY] : [],
    }
  },
  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY || ""
  },
  sourcify: {
    enabled: false
  }
};
