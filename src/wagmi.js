import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { bsc } from 'wagmi/chains'
import { http } from 'wagmi'

// Get environment variables
const BSC_RPC_URL = import.meta.env.VITE_BSC_RPC_URL || 'https://bsc-dataseed.binance.org'
const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'dda28931f6ced9e4b38159861b689ea6'

export const config = getDefaultConfig({
  appName: 'HAVEN Robot Marketplace',
  projectId: PROJECT_ID,
  chains: [bsc],
  transports: {
    [bsc.id]: http(BSC_RPC_URL),
  },
  ssr: false,
})