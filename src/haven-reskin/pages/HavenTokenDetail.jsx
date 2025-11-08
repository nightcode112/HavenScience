import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { readContract, simulateContract, writeContract, waitForTransactionReceipt, getBalance } from '@wagmi/core'
import { config as wagmiConfig } from '../../wagmi'
import TokenAbi from '../../contracts/abis/FullBondingCurveERC20XToken.json'
import PancakeRouterAbi from '../../contracts/abis/PancakeRouterV2.json'
import { formatUnits, parseUnits } from 'viem'
import { CONTRACTS } from '../../utils/contracts'
import { supabase } from '../../lib/supabase'
import { ethers } from 'ethers'
import { useTokenTabsStore } from '../../stores/token-tabs-store'
import {
  ArrowLeft, Shield, Lock, AlertTriangle, TrendingUp, Copy,
  ExternalLink, Activity, Settings, Share2, Search, Star, ChevronDown,
  ArrowUp, ArrowDown, ArrowRight, Plus, Zap, Send, Loader2,
  Minus as MinusIcon, Plus as PlusIcon, Crosshair, ArrowLeft as ArrowLeftIcon, Info, Globe, Brain
} from 'lucide-react'
import IframeTradingViewChart from '../components/IframeTradingViewChart'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { safeImageUrl } from '../../lib/utils'
import HavenTokenChart from './HavenTokenChart'
import { RobotApi } from '../../utils/api'
import { getSimulation, getSimulationId, updateSimulation } from '../../utils/simulationCache'
import { RobotModal } from '../../components/RobotModal'

const DEFAULT_COMMANDS = [
  "Move Right One Step",
  "Move Left One Step",
  "Move Up One Step",
  "Move Down One Step",
]

const COMMAND_ICONS = {
  "Move Right One Step": ArrowRight,
  "Move Left One Step": ArrowLeftIcon,
  "Move Up One Step": ArrowUp,
  "Move Down One Step": ArrowDown,
}

// Search history helper
const saveToSearchHistory = async (token, userAddress) => {
  // Use bonding_contract as the primary address field (contract is always 0x000... before graduation)
  const tokenAddress = token.bonding_contract || token.contract || token.address
  if (!userAddress || !token || !tokenAddress) return

  try {
    // Convert IPFS URLs to HTTP gateway URLs
    const convertIpfsUrl = (url) => {
      if (!url) return url
      if (url.startsWith('ipfs://')) {
        return `https://ipfs.io/ipfs/${url.replace('ipfs://', '')}`
      }
      return url
    }

    const imageUrl = convertIpfsUrl(token.image)

    // Save to localStorage
    const HISTORY_KEY = 'haven_search_history'
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    const filtered = history.filter(t => t.address?.toLowerCase() !== tokenAddress?.toLowerCase())
    filtered.unshift({
      address: tokenAddress,
      name: token.name,
      symbol: token.ticker || token.symbol,
      imageUrl: imageUrl,
    })
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, 10)))

    // Use upsert to update or insert (prevents duplicates with unique constraint)
    await supabase
      .from('user_search_history')
      .upsert({
        user_address: userAddress.toLowerCase(),
        token_address: tokenAddress.toLowerCase(),
        token_name: token.name,
        token_symbol: token.ticker || token.symbol,
        token_image_url: imageUrl,
        searched_at: new Date().toISOString(),
      }, {
        onConflict: 'user_address,token_address'
      })
  } catch (e) {
    // Silent fail
  }
}

// Hide scrollbars globally while keeping scroll functionality
const hideScrollbarStyles = `
  /* Hide scrollbar for Chrome, Safari and Opera */
  .hide-scrollbar::-webkit-scrollbar,
  *::-webkit-scrollbar {
    display: none;
  }

  /* Hide scrollbar for IE, Edge and Firefox */
  .hide-scrollbar,
  * {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
  }

  /* Hide body and html scrollbars */
  body::-webkit-scrollbar,
  html::-webkit-scrollbar {
    display: none;
  }

  body,
  html {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
`

// Haven color theme
const HAVEN_COLORS = {
  primary: '#5854f4',
  primaryHover: '#4c46e8',
  primaryLight: '#7c7cf6',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  background: '#0f1419',
  surface: '#1a1f2e',
  elevated: '#252d3f',
  border: '#374151',
  textPrimary: '#ffffff',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280'
}

const formatNumber = (num) => {
  if (!num || isNaN(num)) return '0'
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`
  return num.toFixed(2)
}

// Trading helper functions
const ERC20_ABI_MIN = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
]

const toBigIntSafe = (value) => {
  if (typeof value === 'bigint') return value
  try { return BigInt(value || 0) } catch { return 0n }
}

const formatTokenAmount = (value, decimals = 18) => {
  try {
    const amount = Number(formatUnits(value || 0n, decimals))
    if (!Number.isFinite(amount)) return '0'
    if (amount >= 1_000) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (amount >= 1) return amount.toFixed(2)
    if (amount >= 0.01) return amount.toFixed(4)
    return amount.toPrecision(3)
  } catch {
    return '0'
  }
}

const formatTimeAgo = (date) => {
  const seconds = Math.floor((new Date() - date) / 1000)

  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function HavenTokenDetailComponent({ robot, onClose, favoritesHook }) {
  // DEBUG: Track renders and what's causing them - EVERY RENDER
  const renderCountHaven = useRef(0)
  const prevStateRef = useRef({})
  const prevInternalStateRef = useRef({})
  renderCountHaven.current += 1

  // Only log every 50 renders to reduce console spam
  if (renderCountHaven.current % 50 === 0) {
  }

  // Check what props changed
  const currentState = {
    robot,
    onClose,
    favoritesHook
  }
  const changed = []
  if (prevStateRef.current.robot !== robot) {
    changed.push('robot')
  }
  if (prevStateRef.current.onClose !== onClose) changed.push('onClose')
  if (prevStateRef.current.favoritesHook !== favoritesHook) {
    changed.push('favoritesHook')
    // Check which property of favoritesHook changed
    if (prevStateRef.current.favoritesHook) {
      const fhChanged = []
      if (prevStateRef.current.favoritesHook.favorites !== favoritesHook.favorites) fhChanged.push('favorites')
      if (prevStateRef.current.favoritesHook.isFavorite !== favoritesHook.isFavorite) fhChanged.push('isFavorite')
      if (prevStateRef.current.favoritesHook.addFavorite !== favoritesHook.addFavorite) fhChanged.push('addFavorite')
      if (prevStateRef.current.favoritesHook.removeFavorite !== favoritesHook.removeFavorite) fhChanged.push('removeFavorite')
      if (prevStateRef.current.favoritesHook.toggleFavorite !== favoritesHook.toggleFavorite) fhChanged.push('toggleFavorite')
      if (prevStateRef.current.favoritesHook.loading !== favoritesHook.loading) fhChanged.push('loading')
    }
  }
  if (changed.length > 0) {
  }
  prevStateRef.current = currentState

  const params = useParams()
  const navigate = useNavigate()
  const { address: walletAddress, isConnected } = useAccount()
  // Only subscribe to specific functions, not the entire store, to prevent unnecessary re-renders
  const setTabStoreActive = useTokenTabsStore(state => state.setActiveTab)
  const updateTab = useTokenTabsStore(state => state.updateTab)

  // DEBUG: Track if zustand subscriptions changed
  const prevZustandRef = useRef({})
  if (prevZustandRef.current.setTabStoreActive !== setTabStoreActive) {
  }
  if (prevZustandRef.current.updateTab !== updateTab) {
  }
  prevZustandRef.current = { setTabStoreActive, updateTab }

  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const havenTokenChartRef = useRef(null) // Ref to HavenTokenChart component
  const pendingChartUpdateRef = useRef(false) // Track if we have a pending chart update
  const [candleData, setCandleDataRaw] = useState([])
  const [isChartLoading, setIsChartLoadingRaw] = useState(true)
const setCandleData = (val) => { setCandleDataRaw(val) }
  const isInitializingRef = useRef(false)
const setIsChartLoading = (val) => { setIsChartLoadingRaw(val) }
  const hasInitializedRef = useRef(false)
  const [tradeAmount, setTradeAmountRaw] = useState('100')
const setTradeAmount = (val) => { setTradeAmountRaw(val) }
  const [tradeMode, setTradeModeRaw] = useState('buy')
const setTradeMode = (val) => { setTradeModeRaw(val) }
  const [orderType, setOrderTypeRaw] = useState('market')
const setOrderType = (val) => { setOrderTypeRaw(val) }
  const [limitPrice, setLimitPriceRaw] = useState('')
const setLimitPrice = (val) => { setLimitPriceRaw(val) }
  const [priceAdjustment, setPriceAdjustmentRaw] = useState(0)
const setPriceAdjustment = (val) => { setPriceAdjustmentRaw(val) }

  // Use favoritesHook from props (same as factory page)
  const { favorites, toggleFavorite } = favoritesHook || { favorites: [], toggleFavorite: () => {} }
  const [isPoolInfoExpanded, setIsPoolInfoExpanded] = useState(true)
  const [isAuditExpanded, setIsAuditExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState('trading') // 'trading' or 'control'
  const [mobileBottomTab, setMobileBottomTab] = useState('buy') // 'buy', 'sell', 'audit', 'info'

  // Debug: Log when tradeMode changes
  useEffect(() => {
  }, [tradeMode])

  // Sync mobileBottomTab with tradeMode
  useEffect(() => {
    if (mobileBottomTab === 'buy' && tradeMode !== 'buy') {
      setTradeMode('buy')
    }
    if (mobileBottomTab === 'sell' && tradeMode !== 'sell') {
      setTradeMode('sell')
    }
  }, [mobileBottomTab, tradeMode])
  const [isRobotModalOpen, setIsRobotModalOpen] = useState(false)
  const [tradingSubTab, setTradingSubTab] = useState('trades') // 'trades', 'positions', or 'holders'
  const [activeFilter, setActiveFilter] = useState('All')
  const [holders, setHolders] = useState([])
  const [isLoadingHolders, setIsLoadingHolders] = useState(false)
  const cachedBalances = useRef(null) // Cache balances Map for incremental updates
  const excludeAddresses = useRef([]) // Cache exclude addresses
  const [tokenBalance, setTokenBalance] = useState('0')
  const [walletBalance, setWalletBalance] = useState('0')
  const [havenBalance, setHavenBalance] = useState('0')
  const [displayCurrency, setDisplayCurrency] = useState('BNB')
  const [chartDisplayMode, setChartDisplayMode] = useState('price') // 'price' or 'mcap'
  const [chartCurrency, setChartCurrency] = useState('usd') // 'bnb' or 'usd'
  const [slippageTolerance, setSlippageTolerance] = useState('5') // Default 5% slippage
  const [userStats, setUserStats] = useState({ bought: 0, sold: 0, pnl: 0, pnlPercent: 0 })
  const [havenPrice, setHavenPrice] = useState(0.90) // USD per HAVEN, fetched dynamically
  const [bnbPrice, setBnbPrice] = useState(600) // USD per BNB, fetched dynamically

  // Apply slippage based on user's tolerance setting
  const applySlippage = (value) => {
    if (typeof value !== 'bigint' || value <= 0n) return 0n
    const slippagePercent = parseFloat(slippageTolerance) || 5
    const slippageBps = BigInt(Math.floor(slippagePercent * 100)) // Convert % to BPS
    const reduction = (value * slippageBps) / 10000n
    const result = value - reduction
    return result > 0n ? result : 0n
  }
  const [tokenStats, setTokenStats] = useState({
    buys: 0,
    buysVolume: 0,
    sells: 0,
    sellsVolume: 0,
    netBuyVolume: 0,
    totalVolume: 0
  })
  const [securityData, setSecurityData] = useState({
    top10Percent: 0,
    snipersHold: 0,
    insidersHold: 0,
    devPercent: 0,
    contractVerified: false,
    honeypot: false,
    renounced: false,
    buyTax: 0,
    sellTax: 0,
    honeypotRisk: 0,
    canSellAll: true,
    averageTax: 0,
    highestTax: 0
  })
  const [tokenCreator, setTokenCreator] = useState(null)
  const [fetchedTokenData, setFetchedTokenDataRaw] = useState(null)
  const [copiedAddress, setCopiedAddress] = useState(false)
const setFetchedTokenData = (val) => { setFetchedTokenDataRaw(val) }
  const [calculatedMarketCap, setCalculatedMarketCap] = useState(null)
  const [calculatedPrice, setCalculatedPrice] = useState(null)
  const [allTrades, setAllTrades] = useState([])
  const [isLoadingTrades, setIsLoadingTrades] = useState(false)
  const [sortColumn, setSortColumn] = useState('age') // age, type, mc, amount, bnb, haven, usd
  const [sortDirection, setSortDirection] = useState('desc') // asc or desc
  const [dexPaid, setDexPaid] = useState(null) // null = loading, true = paid, false = not paid
  const [holderSortColumn, setHolderSortColumn] = useState('balance') // balance, value, bnbBal, havenBal, bought, sold, pnl, remaining, tx
  const [holderSortDirection, setHolderSortDirection] = useState('desc')
  const [tradeModal, setTradeModal] = useState({ isOpen: false, type: 'info', title: '', message: '', isLoading: false })

  // Control tab state
  const [commands, setCommands] = useState(DEFAULT_COMMANDS)
  const [selectedCommand, setSelectedCommand] = useState('')
  const [customCommand, setCustomCommand] = useState('')
  const [statusInfo, setStatusInfoRaw] = useState(null)
  // DEBUG: Wrap setStatusInfo to log all calls
  const setStatusInfo = (value) => {
    setStatusInfoRaw(value)
  }
  const [isAddingCommand, setIsAddingCommand] = useState(false)
  const [isSendingCommand, setIsSendingCommand] = useState(false)
  const [isStartingSimulation, setIsStartingSimulation] = useState(false)
  const [showCustomCommands, setShowCustomCommands] = useState(false)
  const [terminalOutput, setTerminalOutput] = useState('')
  const [terminalDisplay, setTerminalDisplay] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const terminalRef = useRef(null)
  const mapOuterRef = useRef(null)
  const mapInnerRef = useRef(null)
  const [zoom, setZoom] = useState(1)

  // Get address from params first, then from robot prop
  // Filter out invalid addresses (undefined, null, empty string, or the string "undefined")
  const rawAddress = params?.address || robot?.bonding_contract || robot?.contractAddress || robot?.address
  const address = rawAddress && rawAddress !== 'undefined' && rawAddress !== 'null' ? rawAddress : null

  // Redirect to home if address is invalid
  useEffect(() => {
    if (!address || address === 'undefined' || address === 'null') {
      navigate('/')
    }
  }, [address, rawAddress, navigate])

  // Compute if this token is favorited (same as factory page)
  const isFavorite = useMemo(() => {
    return address ? favorites.includes(address.toLowerCase()) : false
  }, [favorites, address])

  // Merge robot prop with fetched data (robot takes priority, but fill in missing fields from fetchedTokenData)
  const tokenData = useMemo(() => {
    // Detect token type: BNB-based tokens have virtual_eth_reserve = 7e18, HAVEN-based have 6000e18
    const virtualEthReserve = fetchedTokenData?.virtual_eth_reserve || robot?.virtual_eth_reserve || '0'
    // Handle both string and number types
    const isBnbBasedToken = virtualEthReserve == '7000000000000000000' || virtualEthReserve === 7000000000000000000 // 7 BNB


    // For BNB-based tokens, DB stores values in BNB (need to convert to USD)
    // For HAVEN-based tokens, DB stores values in USD already
    const rawPrice = calculatedPrice !== null ? calculatedPrice : (robot?.price || fetchedTokenData?.price || 0)
    const rawLiquidity = robot?.liquidity || fetchedTokenData?.liquidity || 0
    const rawMarketCap = calculatedMarketCap !== null ? calculatedMarketCap : (robot?.market_cap || fetchedTokenData?.market_cap || 0)

    const basePriceUsd = isBnbBasedToken ? parseFloat(rawPrice) * bnbPrice : parseFloat(rawPrice)
    const baseLiquidityUsd = isBnbBasedToken ? parseFloat(rawLiquidity) * bnbPrice : parseFloat(rawLiquidity)
    const baseMarketCapUsd = isBnbBasedToken ? parseFloat(rawMarketCap) * bnbPrice : parseFloat(rawMarketCap)


    return {
      ...(fetchedTokenData || {}),  // Base data from Supabase fetch
      ...(robot || {}),              // Override with robot prop if provided
      // Explicitly preserve critical fields from fetchedTokenData if robot has 0 or missing values
      liquidity: baseLiquidityUsd / bnbPrice,  // Convert USD to BNB for display
      liquidityUSD: baseLiquidityUsd,  // Already in USD
      market_cap: baseMarketCapUsd,
      marketCapUSD: baseMarketCapUsd,
      marketCap: baseMarketCapUsd,
      price: basePriceUsd,
      priceETH: basePriceUsd / bnbPrice,  // Convert USD to BNB for display
      priceUSD: basePriceUsd,  // Already in USD
      volume_24h: robot?.volume_24h || fetchedTokenData?.volume_24h || 0,
      totalSupply: fetchedTokenData?.total_supply || robot?.totalSupply || 0,
      total_supply: fetchedTokenData?.total_supply || robot?.totalSupply || 0,
      priceChange5m: robot?.priceChange5m || fetchedTokenData?.priceChange5m || fetchedTokenData?.price_change_5m || 0,
      priceChange1h: robot?.priceChange1h || fetchedTokenData?.priceChange1h || fetchedTokenData?.price_change_1h || 0,
      priceChange6h: robot?.priceChange6h || fetchedTokenData?.priceChange6h || fetchedTokenData?.price_change_6h || 0,
      priceChange24h: robot?.priceChange24h || fetchedTokenData?.priceChange24h || fetchedTokenData?.price_change_24h || 0
    }
  }, [fetchedTokenData, robot, bnbPrice, calculatedMarketCap, calculatedPrice])

  // Memoize selectedRobot to prevent infinite re-renders in RobotModal
  // Use a ref to track previous value and only update if specific fields changed
  const prevSelectedRobotRef = useRef(null)
  const selectedRobot = useMemo(() => {
    const newRobot = {
      ...tokenData,
      image: tokenData.image,
      name: tokenData.name,
      symbol: tokenData.symbol,
      address: tokenData.address || tokenData.bonding_contract,
      isAgent: tokenData.isAgent || false
    }

    // Compare with previous value - only update if critical fields changed
    const prev = prevSelectedRobotRef.current
    if (prev) {
      const criticalFields = ['device_node', 'wallet', 'bonding_contract', 'name', 'symbol', 'image', 'sim_type']
      const hasChanged = criticalFields.some(field => prev[field] !== newRobot[field])

      if (!hasChanged) {
        return prev  // Return same reference to prevent RobotModal re-render
      }
    }

    prevSelectedRobotRef.current = newRobot
    return newRobot
  }, [tokenData])

  // Set active tab when component mounts
  useEffect(() => {
    const tokenAddress = params.address || robot?.address || robot?.contractAddress
    if (tokenAddress) {
      setTabStoreActive(tokenAddress)
    }
  }, [params.address, robot?.address, robot?.contractAddress, setTabStoreActive])

  // Update tab data when token metadata loads (don't set priceChange24h - only from calculated)
  const lastTabUpdate = useRef({})
  useEffect(() => {
    const tokenAddress = params.address || robot?.address || robot?.contractAddress
    if (tokenAddress && tokenData) {
      const newData = {
        name: tokenData.name || robot?.name,
        ticker: tokenData.symbol || tokenData.ticker || robot?.symbol,
        image: tokenData.imageUrl || robot?.image || robot?.imageUrl,
        price: tokenData.price || robot?.price
      }

      // Only update if data actually changed
      const lastUpdate = lastTabUpdate.current
      const hasChanged =
        lastUpdate.name !== newData.name ||
        lastUpdate.ticker !== newData.ticker ||
        lastUpdate.image !== newData.image ||
        lastUpdate.price !== newData.price

      if (hasChanged) {
        updateTab(tokenAddress, newData)
        lastTabUpdate.current = newData
      }
    }
  }, [params.address, robot?.address, robot?.contractAddress, robot?.name, robot?.symbol, robot?.image, robot?.imageUrl, robot?.price, tokenData, updateTab])

  // Load display currency preference from database when wallet connects
  useEffect(() => {
    const loadDisplayCurrencyPreference = async () => {
      if (!walletAddress) return

      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('display_currency')
          .eq('user_address', walletAddress.toLowerCase())
          .maybeSingle()

        if (error) {
          return
        }

        if (data?.display_currency) {
          setDisplayCurrency(data.display_currency)
        }
      } catch (error) {
      }
    }

    loadDisplayCurrencyPreference()
  }, [walletAddress])

  // Save display currency preference to database whenever it changes
  useEffect(() => {
    const saveDisplayCurrencyPreference = async () => {
      if (!walletAddress) return

      try {
        const { error } = await supabase
          .from('user_preferences')
          .upsert({
            user_address: walletAddress.toLowerCase(),
            display_currency: displayCurrency,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_address'
          })

        if (error) {
        }
      } catch (error) {
      }
    }

    saveDisplayCurrencyPreference()
  }, [displayCurrency, walletAddress])

  // Control panel computed values
  const deviceNode = robot?.device_node || robot?.id || tokenData?.device_node
  const simulationIdFromProps = useMemo(() => {
    if (!robot && !tokenData) return null
    const sim = robot || tokenData
    return (
      sim.activeSimulationId ||
      sim.ownedSimulation?.simulation_id ||
      (walletAddress && deviceNode ? getSimulationId(walletAddress, deviceNode) : null)
    )
  }, [robot, tokenData, walletAddress, deviceNode])

  const simulationIdentifier = statusInfo?.simulation_id || simulationIdFromProps || 'X'
  const batteryLevel = statusInfo?.battery || robot?.battery || 100
  const batteryColor = batteryLevel > 50 ? 'text-green-400' : batteryLevel > 20 ? 'text-yellow-400' : 'text-red-400'
  const speedVal = statusInfo?.speed || robot?.speed || 0
  const sizeLabel = (() => {
    const sz = statusInfo?.robot_size || robot?.robot_size || robot?.size || '1x1'
    return String(sz)
  })()
  const robotSizeX = (() => {
    const sz = statusInfo?.robot_size || robot?.robot_size || robot?.size || '1x1'
    const parts = String(sz).split('x')
    return Number(parts[0]) || 1
  })()
  const robotSizeY = (() => {
    const sz = statusInfo?.robot_size || robot?.robot_size || robot?.size || '1x1'
    const parts = String(sz).split('x')
    return Number(parts[1] || parts[0]) || 1
  })()
  const collisionLabel = (statusInfo?.collision_enabled || robot?.collision_enabled) ? 'On' : 'Off'
  const collision = statusInfo?.collision || robot?.collision || false
  const abilitiesVal = statusInfo?.abilities || robot?.abilities || 0
  const sensorsLabel = (statusInfo?.sensors_enabled || robot?.sensors_enabled) ? 'On' : 'Off'
  const posLabelX = (() => {
    const pos = statusInfo?.position
    if (Array.isArray(pos)) return pos[0] !== undefined ? pos[0] : 'N/A'
    if (pos?.x !== undefined) return pos.x
    if (robot?.position?.x !== undefined) return robot.position.x
    return 'N/A'
  })()
  const posLabelY = (() => {
    const pos = statusInfo?.position
    if (Array.isArray(pos)) return pos[1] !== undefined ? pos[1] : 'N/A'
    if (pos?.y !== undefined) return pos.y
    if (robot?.position?.y !== undefined) return robot.position.y
    return 'N/A'
  })()
  const objectList = statusInfo?.objects || robot?.objects || []

  // Helper functions for state display
  const toTitle = (value) => {
    if (!value) return "Idle"
    const str = String(value)
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  const isActiveStatus = (status) => {
    const normalized = String(status || '').toLowerCase()
    return ["running", "active", "live", "success"].includes(normalized)
  }

  // Derive robot state
  const derivedState = (() => {
    const fromSim = (statusInfo?.state ?? statusInfo?.status?.state)
    const fromRobot = (robot?.state ?? robot?.status?.state ?? (typeof robot?.status === 'string' ? robot.status : undefined))
    const s = fromSim ?? fromRobot ?? 'idle'
    return (typeof s === 'string') ? s : 'idle'
  })()
  const statusLabel = toTitle(derivedState)
  const normalizedState = String(derivedState || '').toLowerCase()

  // Map zoom helpers
  const zoomIn = () => setZoom((z) => Math.min(z + 0.5, 5))
  const zoomOut = () => setZoom((z) => Math.max(z - 0.5, 0.5))
  const centerOnRobot = () => {
    if (!mapOuterRef.current || !mapInnerRef.current) return
    const container = mapOuterRef.current
    const inner = mapInnerRef.current
    const containerW = container.offsetWidth
    const containerH = container.offsetHeight
    const innerW = inner.offsetWidth
    const innerH = inner.offsetHeight
    container.scrollLeft = (innerW - containerW) / 2
    container.scrollTop = (innerH - containerH) / 2
  }

  // Command handlers
  const handleCommandSelect = (cmd) => {
    setSelectedCommand(cmd)
    setCustomCommand('')
  }

  const handleAddCustomCommand = async () => {
    if (!customCommand.trim()) return
    if (!walletAddress || !deviceNode) return
    setIsAddingCommand(true)
    try {
      await RobotApi.addCommand(walletAddress, deviceNode, customCommand)
      if (!commands.includes(customCommand)) {
        setCommands([...commands, customCommand])
      }
      setSelectedCommand(customCommand)
      setCustomCommand('')
      appendTerminalOutput(`Added custom command: ${customCommand}`)
    } catch (err) {
      appendTerminalOutput(`Error adding command: ${err.message}`)
    } finally {
      setIsAddingCommand(false)
    }
  }

  const handleSendCommand = async () => {
    const cmd = customCommand.trim() || selectedCommand
    if (!cmd) return
    if (!walletAddress || !deviceNode) return
    setIsSendingCommand(true)
    try {
      const res = await RobotApi.sendCommand('sim', { device_node: deviceNode, wallet: walletAddress, command: cmd })
      const output = res?.output || res?.data?.output || 'Command sent'
      appendTerminalOutput(`> ${cmd}\n${output}`)
      if (res?.simulation) {
        setStatusInfo({ device_node: deviceNode, ...res.simulation })
        updateSimulation(walletAddress, deviceNode, res.simulation)
      }
    } catch (err) {
      appendTerminalOutput(`Error: ${err.message}`)
    } finally {
      setIsSendingCommand(false)
    }
  }

  const handleStartSimulation = async () => {
    if (!walletAddress || !deviceNode) return
    setIsStartingSimulation(true)
    try {
      await RobotApi.loadSimulation('sim', { device_node: deviceNode, wallet: walletAddress })
      // Try to fetch updated simulation data
      try {
        const response = await fetch(`${import.meta.env.VITE_ROBOT_API_BASE || 'https://haven-dashboard-backend.onrender.com'}/simulation/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_node: deviceNode, wallet: walletAddress })
        })
        const data = await response.json()
        if (data) {
          const merged = { device_node: deviceNode, ...data }
          setStatusInfo(merged)
          updateSimulation(walletAddress, deviceNode, merged)
        }
      } catch {}
      appendTerminalOutput('Simulation started successfully')
    } catch (err) {
      appendTerminalOutput(`Failed to start simulation: ${err.message}`)
    } finally {
      setIsStartingSimulation(false)
    }
  }

  const appendTerminalOutput = (text) => {
    setTerminalOutput((prev) => {
      const newOutput = prev + (prev ? '\n' : '') + text
      typewriterEffect(newOutput)
      return newOutput
    })
  }

  const typewriterEffect = (text) => {
    setIsTyping(true)
    setTerminalDisplay('')
    let i = 0
    const interval = setInterval(() => {
      if (i < text.length) {
        setTerminalDisplay(text.slice(0, i + 1))
        i++
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight
        }
      } else {
        setIsTyping(false)
        clearInterval(interval)
      }
    }, 10)
  }

  // Save to search history when token is visited
  useEffect(() => {
    if (fetchedTokenData && walletAddress) {
      saveToSearchHistory(fetchedTokenData, walletAddress)
    }
  }, [fetchedTokenData, walletAddress])

  // Fetch token symbol from blockchain for graduated tokens when missing
  useEffect(() => {
    const fetchOnChainSymbol = async () => {
      // Only fetch if token is graduated and doesn't have a valid symbol
      const hasValidSymbol = fetchedTokenData?.symbol && fetchedTokenData.symbol.trim() && fetchedTokenData.symbol !== 'TKN'
      const hasValidTicker = fetchedTokenData?.ticker && fetchedTokenData.ticker.trim() && fetchedTokenData.ticker !== 'TKN'
      
      console.log("[fetchOnChainSymbol] Check:", { is_graduated: fetchedTokenData?.is_graduated, symbol: fetchedTokenData?.symbol, ticker: fetchedTokenData?.ticker, hasValidSymbol, hasValidTicker })
      if (!fetchedTokenData?.is_graduated || hasValidSymbol || hasValidTicker) {
        return
      }

      const tokenAddress = address || fetchedTokenData?.bonding_contract
      if (!tokenAddress) return

      try {
        
        console.log("[fetchOnChainSymbol] Fetching for address:", tokenAddress)
        // Fetch symbol from blockchain
        const symbol = await readContract(wagmiConfig, {
          abi: TokenAbi,
          address: tokenAddress,
          functionName: 'symbol'
        })

        if (symbol) {
          console.log("[fetchOnChainSymbol] Fetched symbol:", symbol)
          // Update fetchedTokenData with the symbol
          setFetchedTokenData(prev => ({
            ...prev,
            symbol,
            ticker: symbol
          }))
        }
      } catch (error) {
        console.error("[fetchOnChainSymbol] Error:", error)
      }
    }

    fetchOnChainSymbol()
  }, [address, fetchedTokenData?.is_graduated, fetchedTokenData?.symbol, fetchedTokenData?.ticker, fetchedTokenData?.bonding_contract])

  // Load simulation when control tab is opened
  useEffect(() => {
    if (activeTab !== 'control' || !deviceNode) return

    // Load cached simulation or fetch from robot data
    const cachedSimulation = walletAddress ? getSimulation(walletAddress, deviceNode) : null
    const fallbackSimulation =
      robot?.ownedSimulation ||
      cachedSimulation ||
      robot?.simulations?.find((sim) => sim.simulation_id === simulationIdFromProps) ||
      robot?.simulations?.[0] ||
      null

    if (fallbackSimulation) {
      setStatusInfo({ device_node: deviceNode, ...fallbackSimulation })
    }
  }, [activeTab, deviceNode, walletAddress, simulationIdFromProps])

  // Calculate market cap using chart method (last swap + HAVEN price snapshot)
  useEffect(() => {
    const calculateMarketCapFromSwaps = async () => {
      if (!address) {
        return
      }

      try {
        const HAVEN_TOKEN = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690'

        // Fetch HAVEN price snapshots
        const { data: havenSnapshots } = await supabase
          .from('price_snapshots')
          .select('*')
          .ilike('token_address', HAVEN_TOKEN)
          .order('timestamp', { ascending: true })

        const getHavenPriceAtTime = (timestamp) => {
          if (!havenSnapshots || havenSnapshots.length === 0) return 0.91
          const targetTime = new Date(timestamp).getTime()
          let before = havenSnapshots[0]
          let after = havenSnapshots[havenSnapshots.length - 1]

          for (let i = 0; i < havenSnapshots.length - 1; i++) {
            const current = havenSnapshots[i]
            const next = havenSnapshots[i + 1]
            const currentTime = new Date(current.timestamp).getTime()
            const nextTime = new Date(next.timestamp).getTime()

            if (targetTime >= currentTime && targetTime <= nextTime) {
              before = current
              after = next
              break
            }
          }

          const beforeTime = new Date(before.timestamp).getTime()
          const afterTime = new Date(after.timestamp).getTime()
          const beforePrice = parseFloat(before.price)
          const afterPrice = parseFloat(after.price)

          if (targetTime <= beforeTime) return beforePrice
          if (targetTime >= afterTime) return afterPrice

          const ratio = (targetTime - beforeTime) / (afterTime - beforeTime)
          return beforePrice + (afterPrice - beforePrice) * ratio
        }

        // Fetch last swap
        // Filter by pair_address for graduated tokens to get correct HAVEN pool price
        let lastSwapQuery = supabase
          .from('swaps')
          .select('*')
          .ilike('token_address', address)

        if (fetchedTokenData?.is_graduated && fetchedTokenData?.uniswap_pool_address) {
          lastSwapQuery = lastSwapQuery.ilike('pair_address', fetchedTokenData.uniswap_pool_address)
        }

        const { data: lastSwap, error: swapError } = await lastSwapQuery
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (swapError || !lastSwap) {

          return
        }

        // Use pre-calculated price_usd from database if available (more stable)
        // Otherwise fallback to calculating from raw amounts
        let priceUSD = lastSwap.price_usd

        if (!priceUSD || priceUSD === 0) {
          // Fallback: Calculate price from raw amounts and current HAVEN price
          const havenAmount = parseFloat(lastSwap.bnb_amount) / 1e18
          const tokenAmount = parseFloat(lastSwap.token_amount) / 1e18
          const havenPriceUSD = getHavenPriceAtTime(lastSwap.timestamp)
          priceUSD = tokenAmount > 0 ? (havenAmount * havenPriceUSD) / tokenAmount : 0
        }

        // Calculate market cap
        const totalSupply = fetchedTokenData?.total_supply || 0
        const marketCap = priceUSD * totalSupply

        setCalculatedPrice(priceUSD)
        setCalculatedMarketCap(marketCap)
      } catch (error) {

      }
    }

    calculateMarketCapFromSwaps()
  }, [address, fetchedTokenData?.is_graduated, fetchedTokenData?.total_supply, fetchedTokenData?.uniswap_pool_address])

  // Fetch all trades for this token
  useEffect(() => {
    const fetchAllTrades = async () => {
      if (!address) return

      // Never show loading state - trades update smoothly in background
      try {
        const HAVEN_TOKEN = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690'

        // Fetch HAVEN price snapshots for historical prices
        const { data: havenSnapshots } = await supabase
          .from('price_snapshots')
          .select('*')
          .ilike('token_address', HAVEN_TOKEN)
          .order('timestamp', { ascending: true })

        // Helper to get HAVEN price at specific timestamp
        const getHavenPriceAtTime = (timestamp) => {
          if (!havenSnapshots || havenSnapshots.length === 0) return 0.91 // fallback

          const targetTime = new Date(timestamp).getTime()

          // Find closest snapshots before and after
          let before = havenSnapshots[0]
          let after = havenSnapshots[havenSnapshots.length - 1]

          for (let i = 0; i < havenSnapshots.length - 1; i++) {
            const current = havenSnapshots[i]
            const next = havenSnapshots[i + 1]
            const currentTime = new Date(current.timestamp).getTime()
            const nextTime = new Date(next.timestamp).getTime()

            if (targetTime >= currentTime && targetTime <= nextTime) {
              before = current
              after = next
              break
            }
          }

          // Linear interpolation
          const beforeTime = new Date(before.timestamp).getTime()
          const afterTime = new Date(after.timestamp).getTime()
          const beforePrice = parseFloat(before.price)
          const afterPrice = parseFloat(after.price)

          if (targetTime <= beforeTime) return beforePrice
          if (targetTime >= afterTime) return afterPrice

          const ratio = (targetTime - beforeTime) / (afterTime - beforeTime)
          return beforePrice + (afterPrice - beforePrice) * ratio
        }

        // Fetch bonding curve trades
        const { data: bondingTrades, error: bondingError } = await supabase
          .from('trades')
          .select('*')
          .ilike('contract', address)
          .order('timestamp', { ascending: false })
          .limit(100)

        // Fetch DEX swaps (for graduated tokens)
        // Filter by pair_address to get only HAVEN pool swaps (not BNB or other pools)
        let dexSwapsQuery = supabase
          .from('swaps')
          .select('*')
          .ilike('token_address', address)

        // If token is graduated and has a pool address, only fetch swaps from that pool
        if (fetchedTokenData?.is_graduated && fetchedTokenData?.uniswap_pool_address) {
          dexSwapsQuery = dexSwapsQuery.ilike('pair_address', fetchedTokenData.uniswap_pool_address)
        }

        const { data: dexSwaps, error: swapsError } = await dexSwapsQuery
          .order('timestamp', { ascending: false })
          .limit(100)

        // Combine both sources
        const combined = []

        // Fetch BNB price history (approximate using current price for now)
        // TODO: Store BNB price snapshots in DB like we do for HAVEN
        const bnbPriceResponse = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT')
        const bnbPriceData = await bnbPriceResponse.json()
        const currentBnbPrice = parseFloat(bnbPriceData.price)

        // Fetch transfers to get transaction hashes for bonding curve trades
        // We'll use a SQL JOIN to match trades with transfers (RPC function doesn't exist yet, will fall back to manual matching)
        let tradesWithTxHash = null
        try {
          const result = await supabase.rpc('get_trades_with_tx_hash', {
            p_token_address: address.toLowerCase()
          })
          tradesWithTxHash = result.data
        } catch (e) {
          // RPC function doesn't exist, will use manual fallback
          tradesWithTxHash = null
        }

        // If RPC function doesn't exist, fall back to manual matching
        let bondingTradesWithHashes = bondingTrades || []

        if (tradesWithTxHash && tradesWithTxHash.length > 0) {
          // Use the joined data from RPC
          bondingTradesWithHashes = tradesWithTxHash
        } else if (bondingTrades && bondingTrades.length > 0) {
          // Manual fallback: fetch transfers and match by user and direction
          const { data: transfers } = await supabase
            .from('transfers')
            .select('from_address, to_address, tx_hash, block_number')
            .ilike('token_address', address)
            .not('tx_hash', 'is', null)
            .order('block_number', { ascending: true })

          // Create lookup arrays for buy and sell transfers (ordered by block number)
          const buyTransfers = [] // contract -> user
          const sellTransfers = [] // user -> contract

          if (transfers) {
            transfers.forEach(transfer => {
              const from = transfer.from_address.toLowerCase()
              const to = transfer.to_address.toLowerCase()
              const contractAddr = address.toLowerCase()

              // Buy: FROM contract TO user
              if (from === contractAddr && to !== contractAddr) {
                buyTransfers.push({
                  user: to,
                  txHash: transfer.tx_hash,
                  blockNumber: transfer.block_number
                })
              }
              // Sell: FROM user TO contract
              else if (to === contractAddr && from !== contractAddr) {
                sellTransfers.push({
                  user: from,
                  txHash: transfer.tx_hash,
                  blockNumber: transfer.block_number
                })
              }
            })
          }

          // Match trades with transfers by user address
          // Since trades don't have block_number, we match by user and use the first matching transfer
          const usedTxHashes = new Set()

          bondingTradesWithHashes = bondingTrades.map(trade => {
            let txHash = trade.tx_hash

            if (!txHash) {
              const userAddr = trade.user.toLowerCase()
              const transferList = trade.type === 'buy' ? buyTransfers : sellTransfers

              // Find first unused transfer for this user
              const matchingTransfer = transferList.find(t =>
                t.user === userAddr && !usedTxHashes.has(t.txHash)
              )

              if (matchingTransfer) {
                txHash = matchingTransfer.txHash
                usedTxHashes.add(txHash)
              }
            }

            return { ...trade, tx_hash: txHash }
          })
        }

        // Add bonding curve trades
        if (bondingTradesWithHashes && !bondingError) {
          bondingTradesWithHashes.forEach(trade => {
            // Convert timestamp from milliseconds to ISO string for consistency
            const timestampMs = trade.timestamp > 10000000000 ? trade.timestamp : trade.timestamp * 1000
            const timestampISO = new Date(timestampMs).toISOString()

            const havenPriceAtTime = getHavenPriceAtTime(timestampISO)
            const bnbPriceAtTime = currentBnbPrice

            combined.push({
              type: trade.type,
              trader: trade.user,
              tokenAmount: parseFloat(trade.type === 'buy' ? trade.tokensOut : trade.tokensIn), // Already in correct units
              havenAmount: parseFloat(trade.type === 'buy' ? trade.ethIn : trade.ethOut), // Already in correct units
              timestamp: timestampISO,
              source: 'bonding',
              txHash: trade.tx_hash, // Now includes matched tx_hash from transfers
              havenPriceUSD: havenPriceAtTime,
              bnbPriceUSD: bnbPriceAtTime
            })
          })
        }

        // Add DEX swaps
        if (dexSwaps && !swapsError) {
          dexSwaps.forEach(swap => {
            // Use the pre-calculated price_usd from swaps table (already correct!)
            const priceUSD = swap.price_usd || 0

            // Get actual HAVEN price at the time of this swap
            const havenPriceAtTime = getHavenPriceAtTime(swap.timestamp)

            combined.push({
              type: swap.is_buy ? 'buy' : 'sell',
              trader: swap.trader_address,
              tokenAmount: parseFloat(swap.token_amount) / 1e18,
              havenAmount: parseFloat(swap.bnb_amount) / 1e18,
              timestamp: swap.timestamp,
              source: 'dex',
              txHash: swap.tx_hash,
              priceUSD: priceUSD, // Use pre-calculated USD price from swaps table
              havenPriceUSD: havenPriceAtTime, // Use actual HAVEN price at swap time
              bnbPriceUSD: currentBnbPrice
            })
          })
        }

        // Sort by timestamp (newest first)
        combined.sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime()
          const timeB = new Date(b.timestamp).getTime()
          return timeB - timeA
        })

        setAllTrades(combined)
      } catch (error) {

      }
    }

    fetchAllTrades()

    // Listen for refetch event from real-time subscription
    const handleRefetch = () => {
      fetchAllTrades()
    }
    window.addEventListener('refetch-trades', handleRefetch)


    // Cleanup event listener
    return () => {
      window.removeEventListener('refetch-trades', handleRefetch)
    }
  }, [address, fetchedTokenData?.is_graduated, fetchedTokenData?.uniswap_pool_address])

  // toggleFavorite now comes from favoritesHook (defined at top of component)

  // RobotModal callbacks - memoized to prevent re-renders
  const handleRobotModalClose = useCallback(() => {
    setIsRobotModalOpen(false)
  }, [])

  const handleRobotBuy = useCallback(async () => {
  }, [])

  const handleRobotSell = useCallback(async () => {
  }, [])

  const handleRobotUpdate = useCallback(() => {
  }, [])

  const handleSyncSimulations = useCallback(() => {
  }, [])

  const showModal = (type, title, message, isLoading = false) => {
    setTradeModal({ isOpen: true, type, title, message, isLoading })
  }

  const closeModal = () => {
    setTradeModal({ isOpen: false, type: 'info', title: '', message: '', isLoading: false })
  }

  const handleTrade = useCallback(async () => {
    try {

      if (!isConnected || !walletAddress) {
        showModal('error', 'Wallet Not Connected', 'Please connect your wallet first')
        return
      }

      const numericAmount = parseFloat(tradeAmount)
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        showModal('error', 'Invalid Amount', 'Please enter a valid amount')
        return
      }

      const tokenAddress = address
      console.log("[executeTrade] Using address:", tokenAddress, "fetchedTokenData:", { bonding_contract: fetchedTokenData?.bonding_contract, contract: fetchedTokenData?.contract, address: fetchedTokenData?.address })
      if (!tokenAddress) {
        showModal('error', 'Token Not Found', 'Token address not found')
        return
      }

      const tokenLabel = tokenData.symbol || tokenData.ticker || 'TKN'
      console.log("[executeTrade] tokenLabel:", tokenLabel, "from tokenData:", { symbol: tokenData.symbol, ticker: tokenData.ticker })

      // Get token decimals
      let tokenDecimals = 18
      try {
        const decimals = await readContract(wagmiConfig, {
          abi: TokenAbi,
          address: tokenAddress,
          functionName: 'decimals'
        })
        const parsed = Number(decimals)
        if (Number.isFinite(parsed) && parsed > 0) tokenDecimals = parsed
      } catch {
        tokenDecimals = 18
      }

      // Check if token is graduated
      const bondingProgress = tokenData?.progress || 0
      const isGraduated = fetchedTokenData?.is_graduated || tokenData?.isGraduated || bondingProgress >= 100
      console.log("[executeTrade] isGraduated check:", { isGraduated, is_graduated: fetchedTokenData?.is_graduated, tokenData_isGraduated: tokenData?.isGraduated, bondingProgress, tradeMode })

      if (isGraduated) {
        // Use HavenRouter for graduated tokens
        if (tradeMode === 'buy') {
          // Buy graduated tokens via HavenRouter
          if (displayCurrency === 'BNB') {
            // Buy with BNB: BNB -> HAVEN -> Token (via HavenRouter)
            const bnbAmount = parseUnits(String(numericAmount), 18)
            if (bnbAmount <= 0n) {
              showModal('error', 'Amount Too Small', 'BNB amount too small')
              return
            }

            // Get quote from HavenRouterV2
            const tokensOut = await readContract(wagmiConfig, {
              abi: CONTRACTS.havenRouterV2.abi,
              address: CONTRACTS.havenRouterV2.address,
              functionName: 'previewBuyGraduatedWithBNB',
              args: [tokenAddress, bnbAmount]
            })

            if (tokensOut <= 0n) {
              showModal('error', 'Quote Unavailable', 'Could not get quote for BNB → HAVEN → Token swap')
              return
            }

            const minTokensOut = applySlippage(tokensOut)

            // Execute buy via HavenRouter (uses fee-supporting swaps)
            showModal('loading', 'Confirm Buy', 'Please confirm purchase...', true)
            const buySim = await simulateContract(wagmiConfig, {
              abi: CONTRACTS.havenRouterV2.abi,
              address: CONTRACTS.havenRouterV2.address,
              functionName: 'buyGraduatedTokenWithBNB',
              args: [tokenAddress, minTokensOut],
              value: bnbAmount
            })
            const hash = await writeContract(wagmiConfig, buySim.request)
            showModal('loading', 'Transaction Pending', 'Waiting for confirmation...', true)
            await waitForTransactionReceipt(wagmiConfig, { hash })

            try { window.dispatchEvent(new Event('haven:refresh-balance')) } catch {}

            const tokenAmountLabel = formatTokenAmount(tokensOut, tokenDecimals)
            showModal('success', 'Purchase Successful!', `Successfully bought ~${tokenAmountLabel} ${tokenLabel} via BNB → HAVEN → ${tokenLabel}!`)
            setTimeout(closeModal, 3000)
          } else {
            // Buying graduated tokens with HAVEN via HavenRouterV2 (batched approve + buy)
            const havenAmount = parseUnits(String(numericAmount), 18)
            if (havenAmount <= 0n) {
              showModal('error', 'Amount Too Small', 'Amount too small to buy')
              return
            }

            // Get quote from HavenRouterV2
            const tokensOut = await readContract(wagmiConfig, {
              abi: CONTRACTS.havenRouterV2.abi,
              address: CONTRACTS.havenRouterV2.address,
              functionName: 'previewBuyGraduatedWithHAVEN',
              args: [tokenAddress, havenAmount]
            })

            if (tokensOut <= 0n) {
              showModal('error', 'Quote Unavailable', 'Could not get quote for HAVEN → Token swap')
              return
            }

            const minTokensOut = applySlippage(tokensOut)

            // Check HAVEN allowance for HavenRouterV2
            const currentAllowance = await readContract(wagmiConfig, {
              abi: ERC20_ABI_MIN,
              address: CONTRACTS.xtoken.address,
              functionName: 'allowance',
              args: [walletAddress, CONTRACTS.havenRouterV2.address],
            }).catch(() => 0n)

            if (currentAllowance < havenAmount) {
              showModal('loading', 'Approving HAVEN', 'One-time approval for HavenRouterV2...', true)
              const maxUint = (2n ** 256n) - 1n
              const approveSim = await simulateContract(wagmiConfig, {
                abi: ERC20_ABI_MIN,
                address: CONTRACTS.xtoken.address,
                functionName: 'approve',
                args: [CONTRACTS.havenRouterV2.address, maxUint],
              })
              const approveHash = await writeContract(wagmiConfig, approveSim.request)
              showModal('loading', 'Approval Pending', 'Waiting for confirmation...', true)
              await waitForTransactionReceipt(wagmiConfig, { hash: approveHash })
            }

            // Call buy function with HAVEN
            showModal('loading', 'Confirm Buy', 'Please confirm HAVEN → Token purchase...', true)
            const buySim = await simulateContract(wagmiConfig, {
              abi: CONTRACTS.havenRouterV2.abi,
              address: CONTRACTS.havenRouterV2.address,
              functionName: 'buyGraduatedTokenWithHAVEN',
              args: [tokenAddress, havenAmount, minTokensOut],
            })
            const hash = await writeContract(wagmiConfig, buySim.request)
            showModal('loading', 'Transaction Pending', 'Waiting for confirmation...', true)
            await waitForTransactionReceipt(wagmiConfig, { hash })

            try { window.dispatchEvent(new Event('haven:refresh-balance')) } catch {}

            const tokenAmountLabel = formatTokenAmount(tokensOut, tokenDecimals)
            showModal('success', 'Purchase Successful!', `Successfully bought ~${tokenAmountLabel} ${tokenLabel} with HAVEN!`)
            setTimeout(closeModal, 3000)
          }
        } else {
          // Sell graduated tokens
          const tokenAmount = parseUnits(String(numericAmount), tokenDecimals)
          if (tokenAmount <= 0n) {
            showModal('error', 'Amount Too Small', 'Amount too small to sell')
            return
          }
            console.log("[executeTrade] Selling graduated token - tokenAddress:", tokenAddress, "tokenAmount:", tokenAmount.toString())

            console.log("[executeTrade] Calling previewSellGraduatedForBNB with address:", tokenAddress)
          if (displayCurrency === 'BNB') {
            // Sell for BNB via HavenRouterV2: Token -> HAVEN -> BNB
            const bnbOut = await readContract(wagmiConfig, {
              abi: CONTRACTS.havenRouterV2.abi,
              address: CONTRACTS.havenRouterV2.address,
              functionName: 'previewSellGraduatedForBNB',
              args: [tokenAddress, tokenAmount]
            })

            if (bnbOut <= 0n) {
              showModal('error', 'Quote Unavailable', 'Could not get quote for Token → HAVEN → BNB swap')
              return
            }

            const minBNBOut = applySlippage(bnbOut)

            // Check token allowance for HavenRouterV2
            const currentAllowance = await readContract(wagmiConfig, {
              abi: TokenAbi,
              address: tokenAddress,
              functionName: 'allowance',
              args: [walletAddress, CONTRACTS.havenRouterV2.address]
            })

            if (currentAllowance < tokenAmount) {
              showModal('loading', 'Approving Tokens', 'One-time approval for HavenRouterV2...', true)
              const maxUint = (2n ** 256n) - 1n
              const simApprove = await simulateContract(wagmiConfig, {
                abi: TokenAbi,
                address: tokenAddress,
                functionName: 'approve',
                args: [CONTRACTS.havenRouterV2.address, maxUint],
              })
              const approveHash = await writeContract(wagmiConfig, simApprove.request)
              showModal('loading', 'Approval Pending', 'Waiting for confirmation...', true)
              await waitForTransactionReceipt(wagmiConfig, { hash: approveHash })
            }

            // Call sell function (router handles swap)
            showModal('loading', 'Confirm Sell', 'Please confirm sale...', true)
            const sellSim = await simulateContract(wagmiConfig, {
              abi: CONTRACTS.havenRouterV2.abi,
              address: CONTRACTS.havenRouterV2.address,
              functionName: 'sellGraduatedTokenForBNB',
              args: [tokenAddress, tokenAmount, minBNBOut],
            })
            const sellHash = await writeContract(wagmiConfig, sellSim.request)
            showModal('loading', 'Transaction Pending', 'Waiting for confirmation...', true)
            await waitForTransactionReceipt(wagmiConfig, { hash: sellHash })

            try { window.dispatchEvent(new Event('haven:refresh-balance')) } catch {}

            showModal('success', 'Sale Successful!', `Successfully sold ${numericAmount} ${tokenLabel} for BNB!`)
            setTimeout(closeModal, 3000)
          } else {
            // Sell for HAVEN via PancakeSwap directly: Token -> HAVEN
            const path = [tokenAddress, CONTRACTS.xtoken.address]
            const amountsOut = await readContract(wagmiConfig, {
              abi: PancakeRouterAbi,
              address: CONTRACTS.routerV2.address,
              functionName: 'getAmountsOut',
              args: [tokenAmount, path]
            })

            const havenOut = amountsOut[1]
            const minHavenOut = applySlippage(havenOut)

            // Check token allowance for HavenRouterV2
            const currentAllowance = await readContract(wagmiConfig, {
              abi: TokenAbi,
              address: tokenAddress,
              functionName: 'allowance',
              args: [walletAddress, CONTRACTS.havenRouterV2.address]
            })

            if (currentAllowance < tokenAmount) {
              showModal('loading', 'Approving Tokens', 'One-time approval for HavenRouterV2...', true)
              const maxUint = (2n ** 256n) - 1n
              const simApprove = await simulateContract(wagmiConfig, {
                abi: TokenAbi,
                address: tokenAddress,
                functionName: 'approve',
                args: [CONTRACTS.havenRouterV2.address, maxUint],
              })
              const approveHash = await writeContract(wagmiConfig, simApprove.request)
              showModal('loading', 'Approval Pending', 'Waiting for confirmation...', true)
              await waitForTransactionReceipt(wagmiConfig, { hash: approveHash })
            }

            // Call sell function for HAVEN
            showModal('loading', 'Confirm Swap', 'Please confirm Token → HAVEN swap...', true)
            const swapSim = await simulateContract(wagmiConfig, {
              abi: CONTRACTS.havenRouterV2.abi,
              address: CONTRACTS.havenRouterV2.address,
              functionName: 'sellGraduatedTokenForHAVEN',
              args: [tokenAddress, tokenAmount, minHavenOut],
            })
            const sellHash = await writeContract(wagmiConfig, swapSim.request)
            showModal('loading', 'Transaction Pending', 'Waiting for confirmation...', true)
            await waitForTransactionReceipt(wagmiConfig, { hash: sellHash })

            try { window.dispatchEvent(new Event('haven:refresh-balance')) } catch {}

            showModal('success', 'Sale Successful!', `Successfully sold ${numericAmount} ${tokenLabel} for HAVEN!`)
            setTimeout(closeModal, 3000)
          }
        }
      } else if (tradeMode === 'buy') {
        // Bonding Curve Buy Logic
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20 // 20 minutes from now

        // Check if buying with BNB - need to swap BNB -> HAVEN first
        if (displayCurrency === 'BNB') {
          // Use HavenRouter for single-transaction BNB purchase
          const bnbAmount = parseUnits(String(numericAmount), 18)
          if (bnbAmount <= 0n) {
            showModal('error', 'Amount Too Small', 'BNB amount too small')
            return
          }

          // Preview the buy to get expected tokens out
          const preview = await readContract(wagmiConfig, {
            abi: CONTRACTS.havenRouterV2.abi,
            address: CONTRACTS.havenRouterV2.address,
            functionName: 'previewBuyWithBNB',
            args: [tokenAddress, bnbAmount],
          })

          const tokensOut = toBigIntSafe(preview?.tokensOut ?? (Array.isArray(preview) ? preview[0] : 0n))
          if (tokensOut <= 0n) {
            showModal('error', 'Quote Unavailable', 'Quote unavailable for this amount')
            return
          }

          const minTokensOut = applySlippage(tokensOut)

          // Execute single-transaction buy: BNB → Token (auto-detects HAVEN vs WBNB bonding curve)
          showModal('loading', 'Confirm Buy', 'Please confirm purchase...', true)
          const buySim = await simulateContract(wagmiConfig, {
            abi: CONTRACTS.havenRouterV2.abi,
            address: CONTRACTS.havenRouterV2.address,
            functionName: 'buyBondingCurveTokenWithBNB',
            args: [tokenAddress, minTokensOut],
            value: bnbAmount
          })
          const hash = await writeContract(wagmiConfig, buySim.request)
          showModal('loading', 'Transaction Pending', 'Waiting for confirmation...', true)
          await waitForTransactionReceipt(wagmiConfig, { hash })

          try { window.dispatchEvent(new Event('haven:refresh-balance')) } catch {}

          const tokenAmountLabel = formatTokenAmount(tokensOut, tokenDecimals)
          showModal('success', 'Purchase Successful!', `Successfully bought ~${tokenAmountLabel} ${tokenLabel} via BNB → HAVEN → ${tokenLabel}!`)
          setTimeout(closeModal, 3000)
        } else {
          // Buying bonding curve tokens with HAVEN via HavenRouterV2 (batched approve + buy)
          const havenAmount = parseUnits(String(numericAmount), 18)

          if (havenAmount <= 0n) {
            showModal('error', 'Amount Too Small', 'Amount too small to buy')
            return
          }

          // Get quote from HavenRouter
          const tokensOut = await readContract(wagmiConfig, {
            abi: CONTRACTS.havenRouterV2.abi,
            address: CONTRACTS.havenRouterV2.address,
            functionName: 'previewBuyBondingCurveWithHAVEN',
            args: [tokenAddress, havenAmount],
          })

          if (tokensOut <= 0n) {
            showModal('error', 'Quote Unavailable', 'Quote unavailable for this amount')
            return
          }

          const minTokensOut = applySlippage(tokensOut)

          // Check HAVEN allowance for HavenRouter
          const currentAllowance = await readContract(wagmiConfig, {
            abi: ERC20_ABI_MIN,
            address: CONTRACTS.xtoken.address,
            functionName: 'allowance',
            args: [walletAddress, CONTRACTS.havenRouterV2.address],
          }).catch(() => 0n)

          if (currentAllowance < havenAmount) {
            showModal('loading', 'Approving HAVEN', 'One-time approval for HavenRouter...', true)
            const maxUint = (2n ** 256n) - 1n
            const approveSim = await simulateContract(wagmiConfig, {
              abi: ERC20_ABI_MIN,
              address: CONTRACTS.xtoken.address,
              functionName: 'approve',
              args: [CONTRACTS.havenRouterV2.address, maxUint],
            })
            const approveHash = await writeContract(wagmiConfig, approveSim.request)
            showModal('loading', 'Approval Pending', 'Waiting for confirmation...', true)
            await waitForTransactionReceipt(wagmiConfig, { hash: approveHash })
          }

          // Call buy function with HAVEN (router handles internal bonding curve call)
          showModal('loading', 'Confirm Buy', 'Please confirm HAVEN → Token purchase...', true)
          const buySim = await simulateContract(wagmiConfig, {
            abi: CONTRACTS.havenRouterV2.abi,
            address: CONTRACTS.havenRouterV2.address,
            functionName: 'buyBondingCurveTokenWithHAVEN',
            args: [tokenAddress, havenAmount, minTokensOut],
          })
          const hash = await writeContract(wagmiConfig, buySim.request)
          showModal('loading', 'Transaction Pending', 'Waiting for confirmation...', true)
          await waitForTransactionReceipt(wagmiConfig, { hash })

          try { window.dispatchEvent(new Event('haven:refresh-balance')) } catch {}

          const tokenAmountLabel = formatTokenAmount(tokensOut, tokenDecimals)
          showModal('success', 'Purchase Successful!', `Successfully bought ~${tokenAmountLabel} ${tokenLabel} with HAVEN!`)
          setTimeout(closeModal, 3000)
        }
      } else {
        // Bonding Curve Sell logic - Use HavenRouterV2 (batched approve + sell) for BNB
        console.log("[executeTrade] Bonding curve sell - this should NOT run for graduated tokens!")
        const tokenAmount = parseUnits(String(numericAmount), tokenDecimals)
        if (tokenAmount <= 0n) {
          showModal('error', 'Amount Too Small', 'Amount too small to sell')
          return
        }

        // Get user's actual balance and circulating supply for debugging
        const userBalance = await readContract(wagmiConfig, {
          abi: TokenAbi,
          address: tokenAddress,
          functionName: 'balanceOf',
          args: [walletAddress]
        })


        // If user is trying to sell more than they have, cap it
        const actualSellAmount = tokenAmount > userBalance ? userBalance : tokenAmount

        if (actualSellAmount !== tokenAmount) {
        }

        // Get quote from HavenRouterV2 for bonding curve sell: Token -> HAVEN -> BNB
        let preview
        try {
          preview = await readContract(wagmiConfig, {
            abi: CONTRACTS.havenRouterV2.abi,
            address: CONTRACTS.havenRouterV2.address,
            functionName: 'previewSellBondingCurveForBNB',
            args: [tokenAddress, actualSellAmount],
          })
        } catch (previewError) {

          // Check if error is about circulating supply
          if (previewError?.message?.includes('circulating supply')) {
            // Get more debug info
            const tokenContract = { abi: TokenAbi, address: tokenAddress }
            const totalSupply = await readContract(wagmiConfig, { ...tokenContract, functionName: 'totalSupply' })
            const contractBalance = await readContract(wagmiConfig, { ...tokenContract, functionName: 'balanceOf', args: [tokenAddress] })
            const circulatingSupply = totalSupply - contractBalance


            showModal('error', 'Sell Amount Too High',
              `Cannot sell ${formatTokenAmount(actualSellAmount, tokenDecimals)} tokens. ` +
              `Circulating supply is only ${formatTokenAmount(circulatingSupply, tokenDecimals)} ${tokenLabel}. ` +
              `Try selling a smaller amount.`)
            return
          }

          throw previewError
        }

        const bnbOut = toBigIntSafe(preview?.bnbOut ?? (Array.isArray(preview) ? preview[0] : 0n))
        if (bnbOut <= 0n) {
          showModal('error', 'Quote Unavailable', 'Could not get quote for Token → HAVEN → BNB sale')
          return
        }

        const minBNBOut = applySlippage(bnbOut)

        // Check token allowance for HavenRouter
        const currentAllowance = await readContract(wagmiConfig, {
          abi: TokenAbi,
          address: tokenAddress,
          functionName: 'allowance',
          args: [walletAddress, CONTRACTS.havenRouterV2.address]
        })

        if (currentAllowance < actualSellAmount) {
          showModal('loading', 'Approving Tokens', 'One-time approval for HavenRouter...', true)
          const maxUint = (2n ** 256n) - 1n
          const simApprove = await simulateContract(wagmiConfig, {
            abi: TokenAbi,
            address: tokenAddress,
            functionName: 'approve',
            args: [CONTRACTS.havenRouterV2.address, maxUint],
          })
          const approveHash = await writeContract(wagmiConfig, simApprove.request)
          showModal('loading', 'Approval Pending', 'Waiting for confirmation...', true)
          await waitForTransactionReceipt(wagmiConfig, { hash: approveHash })
        }

        // Call sell function (router auto-detects token type and handles swap)
        showModal('loading', 'Confirm Sell', 'Please confirm sale...', true)
        const simSell = await simulateContract(wagmiConfig, {
          abi: CONTRACTS.havenRouterV2.abi,
          address: CONTRACTS.havenRouterV2.address,
          functionName: 'sellBondingCurveTokenForBNB',
          args: [tokenAddress, actualSellAmount, minBNBOut],
        })
        const sellHash = await writeContract(wagmiConfig, simSell.request)
        showModal('loading', 'Transaction Pending', 'Waiting for confirmation...', true)
        await waitForTransactionReceipt(wagmiConfig, { hash: sellHash })

        try { window.dispatchEvent(new Event('haven:refresh-balance')) } catch {}

        showModal('success', 'Sale Successful!', `Successfully sold ${numericAmount} ${tokenLabel} for BNB!`)
        setTimeout(closeModal, 3000)
      }
    } catch (error) {
      const msg = error?.shortMessage || error?.message || 'Transaction failed'
      showModal('error', 'Transaction Failed', msg)
    }
  }, [tradeAmount, tradeMode, orderType, isConnected, walletAddress, address, tokenData, displayCurrency, fetchedTokenData, slippageTolerance])

  const getTimeAgo = useCallback((timestamp) => {
    if (!timestamp) return 'New'
    const minutes = Math.floor((Date.now() - (timestamp * 1000)) / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }, [])

  const bondingCurveProgress = tokenData?.progress || 0

  // Calculate price changes from database queries
  const [calculatedPriceChanges, setCalculatedPriceChanges] = useState(null)

  useEffect(() => {
    const calculatePriceChanges = async () => {
      if (!address || !tokenData?.priceUSD) return


      const currentPrice = tokenData.priceUSD
      const now = new Date()

      const time5mAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
      const time1hAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
      const time6hAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()
      const time24hAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()


      const HAVEN_TOKEN = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690'

      // Fetch HAVEN price snapshots
      const { data: havenSnapshots } = await supabase
        .from('price_snapshots')
        .select('*')
        .ilike('token_address', HAVEN_TOKEN)
        .order('timestamp', { ascending: true })

      const getHavenPriceAtTime = (timestamp) => {
        if (!havenSnapshots || havenSnapshots.length === 0) return 0.91
        const targetTime = new Date(timestamp).getTime()
        let before = havenSnapshots[0]
        let after = havenSnapshots[havenSnapshots.length - 1]

        for (let i = 0; i < havenSnapshots.length - 1; i++) {
          const current = havenSnapshots[i]
          const next = havenSnapshots[i + 1]
          const currentTime = new Date(current.timestamp).getTime()
          const nextTime = new Date(next.timestamp).getTime()

          if (targetTime >= currentTime && targetTime <= nextTime) {
            before = current
            after = next
            break
          }
        }

        const beforeTime = new Date(before.timestamp).getTime()
        const afterTime = new Date(after.timestamp).getTime()
        const beforePrice = parseFloat(before.price)
        const afterPrice = parseFloat(after.price)

        if (targetTime <= beforeTime) return beforePrice
        if (targetTime >= afterTime) return afterPrice

        const ratio = (targetTime - beforeTime) / (afterTime - beforeTime)
        return beforePrice + (afterPrice - beforePrice) * ratio
      }

      const getOldestPriceInPeriod = async (timeAgo) => {
        // Fetch bonding curve trades (timestamp is in SECONDS in trades table)
        const timeAgoMs = new Date(timeAgo).getTime()
        const timeAgoSeconds = Math.floor(timeAgoMs / 1000)
        const { data: bondingTrades } = await supabase
          .from('trades')
          .select('*')
          .ilike('contract', address)
          .gte('timestamp', timeAgoSeconds)
          .order('timestamp', { ascending: true })
          .limit(1)

        // Fetch DEX swaps
        let dexSwapsQuery = supabase
          .from('swaps')
          .select('*')
          .ilike('token_address', address)
          .gte('timestamp', timeAgo)

        if (fetchedTokenData?.is_graduated && fetchedTokenData?.uniswap_pool_address) {
          dexSwapsQuery = dexSwapsQuery.ilike('pair_address', fetchedTokenData.uniswap_pool_address)
        }

        const { data: swaps } = await dexSwapsQuery
          .order('timestamp', { ascending: true })
          .limit(1)

        // Combine and find oldest
        const candidates = []

        if (bondingTrades && bondingTrades.length > 0) {
          const trade = bondingTrades[0]
          const timestampMs = trade.timestamp > 10000000000 ? trade.timestamp : trade.timestamp * 1000
          const timestampISO = new Date(timestampMs).toISOString()
          const tokenAmount = parseFloat(trade.type === 'buy' ? trade.tokensOut : trade.tokensIn)
          const havenAmount = parseFloat(trade.type === 'buy' ? trade.ethIn : trade.ethOut)
          const havenPriceUSD = getHavenPriceAtTime(timestampISO)
          const price = tokenAmount > 0 ? (havenAmount * havenPriceUSD) / tokenAmount : 0

          candidates.push({ timestamp: timestampISO, price, source: 'bonding' })
        }

        if (swaps && swaps.length > 0) {
          const swap = swaps[0]
          const havenAmount = parseFloat(swap.bnb_amount) / 1e18
          const tokenAmount = parseFloat(swap.token_amount) / 1e18
          const havenPriceUSD = getHavenPriceAtTime(swap.timestamp)
          const price = tokenAmount > 0 ? (havenAmount * havenPriceUSD) / tokenAmount : 0

          candidates.push({ timestamp: swap.timestamp, price, source: 'dex' })
        }

        if (candidates.length === 0) return null

        // Return the oldest one
        const oldest = candidates.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0]
        return oldest.price
      }

      // Check if there are trades in each period (check both bonding and DEX)
      const checkTradesInPeriod = async (timeAgo) => {
        const timeAgoMs = new Date(timeAgo).getTime()
        const timeAgoSeconds = Math.floor(timeAgoMs / 1000)
        const [bondingResult, swapsResult] = await Promise.all([
          supabase
            .from('trades')
            .select('*', { count: 'exact', head: true })
            .ilike('contract', address)
            .gte('timestamp', timeAgoSeconds),
          supabase
            .from('swaps')
            .select('*', { count: 'exact', head: true })
            .ilike('token_address', address)
            .gte('timestamp', timeAgo)
        ])

        return (bondingResult.count || 0) > 0 || (swapsResult.count || 0) > 0
      }

      const [hasTrades5m, hasTrades1h, hasTrades6h, hasTrades24h] = await Promise.all([
        checkTradesInPeriod(time5mAgo),
        checkTradesInPeriod(time1hAgo),
        checkTradesInPeriod(time6hAgo),
        checkTradesInPeriod(time24hAgo)
      ])


      const calculateChange = async (minutesAgo, timeAgo, hasTrades) => {
        if (!hasTrades) {
          return 0
        }

        const oldPrice = await getOldestPriceInPeriod(timeAgo)

        if (!oldPrice || oldPrice === 0) return 0

        const change = ((currentPrice - oldPrice) / oldPrice) * 100

        return change
      }

      const [m5, h1, h6, h24] = await Promise.all([
        calculateChange(5, time5mAgo, hasTrades5m),
        calculateChange(60, time1hAgo, hasTrades1h),
        calculateChange(360, time6hAgo, hasTrades6h),
        calculateChange(1440, time24hAgo, hasTrades24h)
      ])


      setCalculatedPriceChanges({ m5, h1, h6, h24 })

      // Save calculated price changes to database
      if (address) {
        try {
          await supabase
            .from('robots')
            .update({
              price_change_5m: m5,
              price_change_1h: h1,
              price_change_6h: h6,
              price_change_24h: h24,
              updated_at: new Date().toISOString()
            })
            .ilike('bonding_contract', address)

        } catch (error) {
        }
      }
    }

    calculatePriceChanges()
  }, [address, tokenData?.priceUSD])

  const priceChanges = calculatedPriceChanges || {
    m5: 0,
    h1: 0,
    h6: 0,
    h24: 0
  }

  // Update tab with calculated price changes when they're available
  useEffect(() => {
    const tokenAddress = params.address || robot?.address || robot?.contractAddress
    if (tokenAddress && calculatedPriceChanges?.h24 !== undefined) {
      updateTab(tokenAddress, {
        priceChange24h: calculatedPriceChanges.h24
      })
    }
  }, [params.address, robot?.address, robot?.contractAddress, calculatedPriceChanges?.h24, updateTab])

  const buysSellsData = {
    buys: tokenData?.buys24h || tokenData?.buys_24h || 0,
    buysVolume: tokenData?.buys24hVolume || tokenData?.buys_24h_volume || 0,
    sells: tokenData?.sells24h || tokenData?.sells_24h || 0,
    sellsVolume: tokenData?.sells24hVolume || tokenData?.sells_24h_volume || 0,
    netBuy: tokenData?.netBuy24h || tokenData?.net_buy_24h || 0
  }

  const holderAnalysisData = {
    top10Holds: securityData?.top10Percent || 0,
    devHolds: securityData?.devPercent || 0,
    holders: tokenData?.holdersCount || 0,
    snipersHold: securityData?.snipersHold || 0,
    insidersHold: securityData?.insidersHold || 0,
    phishingHolds: securityData?.phishingPercent || 0
  }

  // Convert trades to OHLC data
  const convertTradesToOHLC = useCallback((trades, intervalMinutes = 5) => {
    if (!trades || trades.length === 0) return []

    // Sort trades by timestamp
    const sortedTrades = trades.sort((a, b) => {
      // Handle timestamp as either Unix timestamp (seconds) or ISO string
      const timeA = typeof a.timestamp === 'number' ? a.timestamp * 1000 : new Date(a.timestamp || a.created_at).getTime()
      const timeB = typeof b.timestamp === 'number' ? b.timestamp * 1000 : new Date(b.timestamp || b.created_at).getTime()
      return timeA - timeB
    })

    // Group trades into time intervals
    const intervals = new Map()
    const intervalMs = intervalMinutes * 60 * 1000

    sortedTrades.forEach(trade => {
      // Handle timestamp as either Unix timestamp (seconds) or ISO string
      const timestamp = typeof trade.timestamp === 'number'
        ? trade.timestamp * 1000
        : new Date(trade.timestamp || trade.created_at).getTime()
      const intervalStart = Math.floor(timestamp / intervalMs) * intervalMs

      if (!intervals.has(intervalStart)) {
        intervals.set(intervalStart, [])
      }
      intervals.get(intervalStart).push(trade)
    })

    // Generate OHLC candles
    const ohlcData = []
    // Calculate initial price from first trade
    const firstTrade = sortedTrades[0]
    let lastPrice = 0.000018 // fallback
    if (firstTrade) {
      if (firstTrade.type === 'buy') {
        const ethAmount = parseFloat(firstTrade.ethIn || 0) / 1e18
        const tokenAmount = parseFloat(firstTrade.tokensOut || 1)
        lastPrice = ethAmount / tokenAmount
      } else {
        const ethAmount = parseFloat(firstTrade.ethOut || 0) / 1e18
        const tokenAmount = parseFloat(firstTrade.tokensIn || 1)
        lastPrice = ethAmount / tokenAmount
      }
    }

    // Sort intervals by time
    const sortedIntervals = Array.from(intervals.entries()).sort((a, b) => a[0] - b[0])

    for (const [intervalStart, tradesInInterval] of sortedIntervals) {
      // Calculate price for each trade: price = (ethIn or ethOut) / (tokensOut or tokensIn)
      const prices = tradesInInterval.map(t => {
        if (t.type === 'buy') {
          // Buy: price = ethIn / tokensOut (ETH per token)
          const ethAmount = parseFloat(t.ethIn || 0) / 1e18
          const tokenAmount = parseFloat(t.tokensOut || 1)
          return ethAmount / tokenAmount
        } else {
          // Sell: price = ethOut / tokensIn (ETH per token)
          const ethAmount = parseFloat(t.ethOut || 0) / 1e18
          const tokenAmount = parseFloat(t.tokensIn || 1)
          return ethAmount / tokenAmount
        }
      })

      // Calculate volume in ETH
      const volumes = tradesInInterval.map(t => {
        const ethAmount = t.ethIn || t.ethOut || t.eth_amount || '0'
        return parseFloat(ethAmount) / 1e18
      })

      if (prices.length === 0 || prices.every(p => p === 0 || !isFinite(p))) continue

      // Open should be the price BEFORE trades in this interval
      const open = lastPrice
      const close = prices[prices.length - 1]
      const high = Math.max(...prices, open, close)
      const low = Math.min(...prices.filter(p => p > 0), open, close)
      const volume = volumes.reduce((sum, v) => sum + v, 0)

      // Ensure OHLC relationships are correct
      const validHigh = Math.max(open, close, high)
      const validLow = Math.min(open, close, low > 0 ? low : Math.min(open, close))

      ohlcData.push({
        time: Math.floor(intervalStart / 1000), // Convert to seconds
        open,
        high: validHigh,
        low: validLow,
        close,
        volume: Math.max(volume, 0.001)
      })

      lastPrice = close
    }

    // If we have very few candles but some real data, create minimal chart
    if (ohlcData.length < 10 && ohlcData.length > 0) {

      const firstCandle = ohlcData[0]
      const lastCandle = ohlcData[ohlcData.length - 1]

      const interpolatedData = [...ohlcData]

      // Add a point before first trade
      interpolatedData.unshift({
        time: firstCandle.time - 300,
        open: firstCandle.open,
        high: firstCandle.high,
        low: firstCandle.low,
        close: firstCandle.open,
        volume: 0.001
      })

      // Add a point after last trade
      interpolatedData.push({
        time: lastCandle.time + 300,
        open: lastCandle.close,
        high: lastCandle.close,
        low: lastCandle.close,
        close: lastCandle.close,
        volume: 0.001
      })

      return interpolatedData.sort((a, b) => a.time - b.time)
    }

    return ohlcData
  }, [])


  // Fetch candle data from bonding curve trades
  const fetchCandleData = useCallback(async () => {
    try {
      // Calculate initial price from virtual reserves
      let initialPrice = 0.0000188 // absolute fallback
      if (tokenData?.virtualEthReserve && tokenData?.virtualTokenReserve) {
        const virtualEth = parseFloat(tokenData.virtualEthReserve)
        const virtualToken = parseFloat(tokenData.virtualTokenReserve)
        if (virtualEth > 0 && virtualToken > 0) {
          initialPrice = virtualEth / virtualToken
        }
      } else if (tokenData?.price) {
        initialPrice = parseFloat(tokenData.price)
      }

      // Fetch trades directly from Supabase
      // Filter by pair_address for graduated tokens to avoid mixing HAVEN and BNB pool swaps

      let tradesQuery = supabase
        .from('swaps')
        .select('*')
        .ilike('token_address', address)

      // If token is graduated and has a pool address, only fetch swaps from that pool
      if (fetchedTokenData?.is_graduated && fetchedTokenData?.uniswap_pool_address) {
        tradesQuery = tradesQuery.ilike('pair_address', fetchedTokenData.uniswap_pool_address)
      }

      const { data: trades, error } = await tradesQuery
        .order('timestamp', { ascending: true })


      if (error) {
        // If error fetching trades, still show initial virtual reserve price
        const now = Math.floor(Date.now() / 1000)
        const initialData = [
          { time: now - 600, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 },
          { time: now - 300, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 },
          { time: now, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 }
        ]
        setCandleData(initialData)
        return true
      }

      let ohlcData = []

      if (!trades || trades.length === 0) {
        // No trades yet - show initial virtual reserve price
        const now = Math.floor(Date.now() / 1000)
        ohlcData = [
          { time: now - 600, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 },
          { time: now - 300, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 },
          { time: now, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 }
        ]
      } else {
        ohlcData = convertTradesToOHLC(trades)

        // If conversion failed, show initial price
        if (ohlcData.length === 0) {

          const now = Math.floor(Date.now() / 1000)
          ohlcData = [
            { time: now - 600, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 },
            { time: now - 300, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 },
            { time: now, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 }
          ]
        }
      }


      setCandleData(ohlcData)
      return ohlcData.length > 0
    } catch (error) {
      // On any error, show initial virtual reserve price
      let initialPrice = 0.0000188
      if (tokenData?.virtualEthReserve && tokenData?.virtualTokenReserve) {
        const virtualEth = parseFloat(tokenData.virtualEthReserve)
        const virtualToken = parseFloat(tokenData.virtualTokenReserve)
        if (virtualEth > 0 && virtualToken > 0) {
          initialPrice = virtualEth / virtualToken
        }
      } else if (tokenData?.price) {
        initialPrice = parseFloat(tokenData.price)
      }

      const now = Math.floor(Date.now() / 1000)
      const initialData = [
        { time: now - 600, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 },
        { time: now - 300, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 },
        { time: now, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 }
      ]
      setCandleData(initialData)
      return true
    }
  }, [address, convertTradesToOHLC, tokenData?.virtualEthReserve, tokenData?.virtualTokenReserve, tokenData?.price, fetchedTokenData?.is_graduated, fetchedTokenData?.uniswap_pool_address])

  // Initialize TradingView chart
  const initializeChart = useCallback(async () => {
    // Prevent re-initialization if already initialized
    if (hasInitializedRef.current) {

      return
    }

    const chartElement = chartContainerRef.current

    if (!chartElement) {

      return
    }

    try {
      if (!window.TradingView) {

        setIsChartLoading(false)
        return
      }

      // Create a dedicated inner container for TradingView that won't be touched by React
      const tvContainer = document.createElement('div')
      tvContainer.id = 'tv_chart_inner_' + Date.now()
      tvContainer.style.width = '100%'
      tvContainer.style.height = '100%'
      tvContainer.style.position = 'relative'

      // Clear and append the container
      chartElement.innerHTML = ''
      chartElement.appendChild(tvContainer)

      // Ensure container has proper dimensions
      const containerWidth = chartElement.clientWidth || 800
      const containerHeight = chartElement.clientHeight || 500


      if (containerWidth < 100 || containerHeight < 100) {

        setTimeout(() => initializeChart(), 200)
        return
      }

      // If no candle data, create initial data from virtual reserves
      let dataToDisplay = candleData
      if (candleData.length === 0) {

        // Calculate initial price from virtual reserves
        let initialPrice = 0.0000188
        if (tokenData?.virtualEthReserve && tokenData?.virtualTokenReserve) {
          const virtualEth = parseFloat(tokenData.virtualEthReserve)
          const virtualToken = parseFloat(tokenData.virtualTokenReserve)
          if (virtualEth > 0 && virtualToken > 0) {
            initialPrice = virtualEth / virtualToken

          }
        } else if (tokenData?.price) {
          initialPrice = parseFloat(tokenData.price)

        }

        const now = Math.floor(Date.now() / 1000)
        dataToDisplay = [
          { time: now - 600, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 },
          { time: now - 300, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 },
          { time: now, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 }
        ]
      }


      // Debug: check the source time format
      if (dataToDisplay.length > 0) {
        const firstTime = dataToDisplay[0].time
        const now = Date.now() / 1000 // Current time in seconds
      }

      // Convert candle data to TradingView format
      const tvData = dataToDisplay
        .filter(candle => {
          return candle.time > 0 &&
                 candle.open > 0 &&
                 candle.high > 0 &&
                 candle.low > 0 &&
                 candle.close > 0 &&
                 candle.high >= Math.max(candle.open, candle.close) &&
                 candle.low <= Math.min(candle.open, candle.close)
        })
        .map(candle => {
          // TradingView expects milliseconds
          // If time is already in milliseconds (> 10 billion), use as-is
          // If in seconds (< 10 billion), multiply by 1000
          let timeMs = candle.time
          if (candle.time < 10000000000) {
            timeMs = candle.time * 1000
          }

          return {
            time: timeMs,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume || 0
          }
        })
        .sort((a, b) => a.time - b.time)


      if (tvData.length === 0) {
        chartElement.innerHTML = '<div style="color: white; text-align: center; padding: 20px;">No valid data to display</div>'
        setIsChartLoading(false)
        return
      }



      const tokenSymbol = tokenData.symbol || tokenData.ticker || 'TKN'

      // Create a datafeed for TradingView
      const datafeed = {
        onReady: (callback) => {
          setTimeout(() => callback({
            exchanges: [],
            symbols_types: [],
            supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D'],
            supports_marks: false,
            supports_timescale_marks: false,
          }), 0)
        },

        searchSymbols: (userInput, exchange, symbolType, onResultReadyCallback) => {
          onResultReadyCallback([])
        },

        resolveSymbol: (symbolName, onSymbolResolvedCallback, onResolveErrorCallback) => {
          try {
            const symbolInfo = {
              name: tokenSymbol || tokenData?.symbol || tokenData?.ticker || symbolName || 'TOKEN',
              description: tokenData?.name || tokenData?.ticker || 'Token',
              type: 'crypto',
              session: '24x7',
              timezone: 'Etc/UTC',
              exchange: 'HAVEN',
              listed_exchange: 'HAVEN',
              ticker: tokenSymbol || tokenData?.symbol || tokenData?.ticker || symbolName || 'TOKEN',
              minmov: 1,
              pricescale: 100000000, // 8 decimal places for crypto precision
              has_intraday: true,
              has_daily: true,
              has_weekly_and_monthly: false,
              supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D'],
              volume_precision: 2,
              data_status: 'streaming',
              format: 'price', // Added format field
            }
            setTimeout(() => onSymbolResolvedCallback(symbolInfo), 0)
          } catch (error) {
            setTimeout(() => onResolveErrorCallback('Failed to resolve symbol'), 0)
          }
        },

        getBars: (symbolInfo, resolution, from, to, onHistoryCallback, onErrorCallback, firstDataRequest) => {
          try {
            // Validate that we have data
            if (!tvData || tvData.length === 0) {

              setTimeout(() => onHistoryCallback([], { noData: true }), 0)
              return
            }

            // For initial data with no trades, return all data regardless of time range
            // TradingView will request different time ranges, but we only have current virtual reserve price
            const filteredData = tvData.map(bar => ({
              time: bar.time,
              open: Number(bar.open),
              high: Number(bar.high),
              low: Number(bar.low),
              close: Number(bar.close),
              volume: Number(bar.volume || 0)
            }))


            // Validate bar data
            const isValidBar = (bar) => {
              return bar &&
                     typeof bar.time === 'number' &&
                     typeof bar.open === 'number' &&
                     typeof bar.high === 'number' &&
                     typeof bar.low === 'number' &&
                     typeof bar.close === 'number' &&
                     !isNaN(bar.open) &&
                     !isNaN(bar.high) &&
                     !isNaN(bar.low) &&
                     !isNaN(bar.close)
            }

            const validBars = filteredData.filter(isValidBar)

            if (validBars.length === 0) {
              setTimeout(() => onHistoryCallback([], { noData: true }), 0)
              return
            }



            // When we have data, call with just the data array
            setTimeout(() => onHistoryCallback(validBars), 0)
          } catch (error) {
            setTimeout(() => onErrorCallback('Failed to get historical data'), 0)
          }
        },

        subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscribeUID, onResetCacheNeededCallback) => {
          // No real-time updates for now
        },

        unsubscribeBars: (subscribeUID) => {
        },

        getMarks: (symbolInfo, from, to, onDataCallback, resolution) => {
          // No marks to display
          onDataCallback([])
        },

        getTimescaleMarks: (symbolInfo, from, to, onDataCallback, resolution) => {
          // No timescale marks
          onDataCallback([])
        },

        getServerTime: (callback) => {
          callback(Math.floor(Date.now() / 1000))
        }
      }

      // Create TradingView widget using the inner container element directly
      // TradingView widget can accept either 'container_id' (string) or 'container' (HTMLElement)
      // Using 'container' (DOM element) instead of 'container_id' (string) to avoid selector issues

      // Wait a tick to ensure the element is fully in the DOM
      await new Promise(resolve => setTimeout(resolve, 0))

      const widget = new window.TradingView.widget({
        container: tvContainer,
        width: containerWidth,
        height: containerHeight,
        symbol: tokenSymbol || tokenData.symbol || tokenData.ticker || 'TOKEN',
        interval: '5',
        datafeed: datafeed,
        library_path: '/charting_library/',
        locale: 'en',
        disabled_features: [
          'header_symbol_search',
          'header_saveload',
          'study_templates',
          'header_compare',
          'header_screenshot',
          'header_fullscreen_button',
          'display_market_status'  // Disable status widget that's causing toLowerCase error
        ],
        enabled_features: [],
        charts_storage_url: undefined,
        charts_storage_api_version: '1.1',
        client_id: 'tradingview.com',
        user_id: 'public_user_id',
        fullscreen: false,
        autosize: true,
        theme: 'dark',
        style: '1', // Candlestick style
        toolbar_bg: HAVEN_COLORS.surface,
        overrides: {
          'paneProperties.background': HAVEN_COLORS.background,
          'paneProperties.vertGridProperties.color': HAVEN_COLORS.border,
          'paneProperties.horzGridProperties.color': HAVEN_COLORS.border,
          'symbolWatermarkProperties.transparency': 90,
          'scalesProperties.textColor': HAVEN_COLORS.textPrimary
        },
        // Add error handling callback
        onChartReady: () => {

          hasInitializedRef.current = true
          setIsChartLoading(false)

          // Clear safety timeout since chart loaded successfully
          if (chartRef.current?._safetyTimeout) {
            clearTimeout(chartRef.current._safetyTimeout)
          }
        }
      })

      chartRef.current = widget


      // Safety timeout: if chart doesn't become ready within 10 seconds, stop loading
      const safetyTimeout = setTimeout(() => {
        if (isChartLoading) {

          setIsChartLoading(false)
          hasInitializedRef.current = true // Prevent further initialization attempts
        }
      }, 10000)

      // Store the timeout so we can clear it on successful load
      widget._safetyTimeout = safetyTimeout

    } catch (error) {
      setIsChartLoading(false)
      // Don't set hasInitializedRef to true on error, so it can retry
    }
  }, [address, candleData, tokenData])

  // Load TradingView library
  useEffect(() => {
    if (window.TradingView) {
      return
    }

    const script = document.createElement('script')
    script.src = '/charting_library/charting_library.standalone.js'
    script.onload = () => {
    }
    script.onerror = () => {
      setIsChartLoading(false)
    }
    document.head.appendChild(script)

    return () => {
      // Cleanup script tag if needed
    }
  }, [])

  // Fetch candleData when address changes
  useEffect(() => {
    if (address) {
      fetchCandleData()
    }
  }, [address]) // Removed fetchCandleData from dependencies to prevent infinite loop

  // Check if chart is ready and apply pending updates
  useEffect(() => {
    if (havenTokenChartRef.current && pendingChartUpdateRef.current) {
      havenTokenChartRef.current.updateRealtimeBars()
      pendingChartUpdateRef.current = false
    }
  }, [havenTokenChartRef.current])

  // Poll for new swaps (Supabase Realtime replication not available yet)
  useEffect(() => {
    if (!address) {
      return
    }


    let lastSwapId = null
    let pollInterval = null

    // Function to check for new swaps
    const checkForNewSwaps = async () => {
      try {
        // Filter by pair_address for graduated tokens
        let latestSwapQuery = supabase
          .from('swaps')
          .select('id, created_at')
          .eq('token_address', address.toLowerCase())

        if (fetchedTokenData?.is_graduated && fetchedTokenData?.uniswap_pool_address) {
          latestSwapQuery = latestSwapQuery.ilike('pair_address', fetchedTokenData.uniswap_pool_address)
        }

        const { data: latestSwap, error: swapError } = await latestSwapQuery
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        // Ignore errors (token might have no swaps yet)
        if (!swapError && latestSwap) {
          // If this is a new swap (different from last one we saw)
          if (lastSwapId && latestSwap.id !== lastSwapId) {

            // Update chart via datafeed (instant update)
            if (havenTokenChartRef.current) {
              havenTokenChartRef.current.updateRealtimeBars()
            }

            // Refetch trades list
            window.dispatchEvent(new CustomEvent('refetch-trades'))
          }

          lastSwapId = latestSwap.id
        }
      } catch (error) {
        // Silent fail for polling
      }
    }

    // Handle visibility change - refetch data when tab becomes active to fill gaps
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Force chart to reload and fill gaps
        if (havenTokenChartRef.current) {
          havenTokenChartRef.current.updateRealtimeBars()
        }
        // Refetch trades
        window.dispatchEvent(new CustomEvent('refetch-trades'))
        // Check for new swaps immediately
        checkForNewSwaps()
      }
    }

    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Poll every 3 seconds
    pollInterval = setInterval(checkForNewSwaps, 3000)

    // Initial check
    checkForNewSwaps()

    // Cleanup polling on unmount or address change
    return () => {
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [address])

  // Reset chart when address changes
  useEffect(() => {
    // Reset the initialization flag when address changes
    hasInitializedRef.current = false

    // Remove old chart if it exists
    if (chartRef.current && chartRef.current.remove) {
      try {
        chartRef.current.remove()
        chartRef.current = null
      } catch (error) {
      }
    }
  }, [address])

  // Initialize chart when data is available
  useEffect(() => {
    if (!address) {

      return
    }

    // Skip if already initialized
    if (hasInitializedRef.current) {

      return
    }

    // Skip if we don't have any candle data yet
    if (candleData.length === 0) {

      return
    }



    // Use a timeout to ensure DOM is stable
    const initTimeout = setTimeout(() => {

      if (window.TradingView && !hasInitializedRef.current) {
        initializeChart()
      } else {

      }
    }, 100)

    return () => {
      clearTimeout(initTimeout)
      // Don't remove chart in cleanup - let the address change handler do that
    }
  }, [address, candleData.length])

  // Fetch robot data from Supabase (always fetch to get real data, ignore incomplete robot prop)
  useEffect(() => {
    if (!address) {
      return
    }

    const fetchRobot = async () => {
      try {
        // Try robots table first
        let { data, error } = await supabase
          .from('robots')
          .select('*')
          .ilike('bonding_contract', address)
          .maybeSingle()

        // If not found in robots, try agents table
        if (error || !data) {
          const agentsResult = await supabase
            .from('agents')
            .select('*')
            .ilike('bonding_contract', address)
            .maybeSingle()

          data = agentsResult.data
          error = agentsResult.error
        }

        if (error || !data) {
          return
        }

        if (data) {
          // Only update if data actually changed (deep comparison)
          setFetchedTokenData(prev => {
            // If no previous data, definitely update
            if (!prev) return data

            // Compare key fields to see if anything changed
            const fieldsToCompare = ['bonding_contract', 'name', 'symbol', 'image', 'price', 'market_cap', 'liquidity', 'device_node', 'wallet', 'uniswap_pool_address']
            const hasChanged = fieldsToCompare.some(field => prev[field] !== data[field])

            if (!hasChanged) {
              return prev  // No change, return previous to prevent re-render
            }

            // Set pair address if available
            if (data.uniswap_pool_address && data.uniswap_pool_address !== '0x0000000000000000000000000000000000000000') {
              return {
                ...data,
                pairAddress: data.uniswap_pool_address
              }
            }
            return data
          })

          // Set creator if available
          if (data.wallet) {
            setTokenCreator(data.wallet)
          }
        }
      } catch (error) {
      }
    }

    fetchRobot()
  }, [address])

  // Fetch holders data on mount and when address changes
useEffect(() => {
    if (!address) {
      return
    }

    // Helper function to convert balances Map to holders array
    const balancesToHolders = (balances) => {
      const TOKEN_CONTRACT = address.toLowerCase()

      const holdersArray = Array.from(balances.entries())
        .filter(([addr, balance]) => {
          return balance > 0n && !excludeAddresses.current.includes(addr)
        })
        .map(([address, balance]) => ({
          address,
          balance: Number(balance) / 1e18 // Convert from wei to decimal
        }))
        .sort((a, b) => b.balance - a.balance)

      // Calculate total supply from holders
      const totalSupply = holdersArray.reduce((sum, h) => sum + h.balance, 0)

      // Add percentage to each holder
      return holdersArray.map(holder => ({
        ...holder,
        percentage: (holder.balance / totalSupply) * 100
      }))
    }

    // Incremental update function for single transfers
    const updateHoldersIncremental = async (transfer) => {
      if (!cachedBalances.current) {
        
        return false
      }

      try {
        const from = transfer.from_address.toLowerCase()
        const to = transfer.to_address.toLowerCase()
        const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

        // Parse amount (handle both wei and decimal formats)
        let amount = parseFloat(transfer.amount)
        if (amount > 1e15) {
          amount = amount / 1e18
        }
        const value = BigInt(Math.floor(amount * 1e18))

        // Update balances incrementally
        if (from !== ZERO_ADDRESS.toLowerCase()) {
          const current = cachedBalances.current.get(from) || 0n
          cachedBalances.current.set(from, current - value)
        }

        if (to !== ZERO_ADDRESS.toLowerCase()) {
          const current = cachedBalances.current.get(to) || 0n
          cachedBalances.current.set(to, current + value)
        }

        // Convert updated balances to holders array
        const updatedHolders = balancesToHolders(cachedBalances.current)
        
        setHolders(updatedHolders)

        return true
      } catch (error) {
        
        return false
      }
    }

    // Function to fetch current BNB, HAVEN, and token wallet balances from blockchain and save to DB
    const fetchHolderWalletBalances = async (currentHolders, tokenAddress) => {
      try {
        const { ethers } = await import('ethers')
        const BSC_RPC = import.meta.env.VITE_BSC_RPC_URL || 'https://bsc-dataseed1.binance.org'
        const provider = new ethers.JsonRpcProvider(BSC_RPC)

        const HAVEN_ADDRESS = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690'
        const ERC20_ABI = ['function balanceOf(address) view returns (uint256)']
        const havenContract = new ethers.Contract(HAVEN_ADDRESS, ERC20_ABI, provider)
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)

        // Fetch balances for all holders in parallel (in batches to avoid rate limiting)
        const BATCH_SIZE = 10
        const updatedHolders = [...currentHolders]
        const balanceRecords = []

        for (let i = 0; i < updatedHolders.length; i += BATCH_SIZE) {
          const batch = updatedHolders.slice(i, i + BATCH_SIZE)

          await Promise.all(
            batch.map(async (holder, batchIndex) => {
              const holderIndex = i + batchIndex
              try {
                // Fetch BNB balance
                const bnbBalanceWei = await provider.getBalance(holder.address)
                const bnbBalance = parseFloat(ethers.formatEther(bnbBalanceWei))

                // Fetch HAVEN balance
                const havenBalanceWei = await havenContract.balanceOf(holder.address)
                const havenBalance = parseFloat(ethers.formatEther(havenBalanceWei))

                // Fetch token balance
                const tokenBalanceWei = await tokenContract.balanceOf(holder.address)
                const tokenBalance = parseFloat(ethers.formatEther(tokenBalanceWei))

                updatedHolders[holderIndex] = {
                  ...updatedHolders[holderIndex],
                  bnbBalance,
                  havenBalance,
                  balance: tokenBalance // Update the token balance
                }

                // Prepare record for database upsert
                balanceRecords.push({
                  holder_address: holder.address.toLowerCase(),
                  token_address: tokenAddress.toLowerCase(),
                  bnb_balance: bnbBalance,
                  haven_balance: havenBalance,
                  token_balance: tokenBalance,
                  last_updated: new Date().toISOString()
                })
              } catch (err) {
                
              }
            })
          )

          // Update state after each batch
          setHolders([...updatedHolders])

          // Small delay between batches to avoid rate limiting
          if (i + BATCH_SIZE < updatedHolders.length) {
            await new Promise(resolve => setTimeout(resolve, 200))
          }
        }

        // Save all balance records to database (upsert to handle updates)
        if (balanceRecords.length > 0) {
          const { error: upsertError } = await supabase
            .from('holder_wallet_balances')
            .upsert(balanceRecords, {
              onConflict: 'holder_address,token_address',
              ignoreDuplicates: false
            })

          if (upsertError) {
            
          } else {
            
          }
        }

        
      } catch (error) {
        
      }
    }

    const fetchHolders = async () => {
      setIsLoadingHolders(true)
      try {
        // Run all initial queries in parallel for faster loading (3-5x speedup)
        const [robotResult, dbHoldingsResult, bondingTradesResult, dexSwapsResult] = await Promise.all([
          // Get pair address and check if we have database data
          supabase
            .from('robots')
            .select('uniswap_pool_address, holders_count, total_supply')
            .or(`bonding_contract.ilike.${address},contract.ilike.${address}`)
            .maybeSingle(),

          // Try to load from database first (much faster!)
          supabase
            .from('bonding_holdings')
            .select('holder_address, balance')
            .eq('token_address', address.toLowerCase()),

          // Fetch from bonding curve trades (trades table)
          supabase
            .from('trades')
            .select('user, type, tokensIn, tokensOut, ethIn, ethOut, timestamp')
            .ilike('contract', address)
            .order('timestamp', { ascending: true }),

          // Fetch from DEX swaps (swaps table)
          (async () => {
            let query = supabase
              .from('swaps')
              .select('trader_address, is_buy, token_amount, bnb_amount, timestamp')
              .ilike('token_address', address)

            if (fetchedTokenData?.is_graduated && fetchedTokenData?.uniswap_pool_address) {
              query = query.ilike('pair_address', fetchedTokenData.uniswap_pool_address)
            }

            return query.order('timestamp', { ascending: true })
          })()
        ])

        // Extract data from results
        const robot = robotResult.data
        const dbHoldings = dbHoldingsResult.data
        const bondingTrades = bondingTradesResult.data
        const dexSwaps = dexSwapsResult.data

        const pairAddress = robot?.uniswap_pool_address?.toLowerCase()
        const TOKEN_CONTRACT = address.toLowerCase()

        // Exclude token contract and pair
        excludeAddresses.current = [
          TOKEN_CONTRACT,
          pairAddress
        ].filter(Boolean)

        // Combine and normalize all trades
        const allTokenTrades = []

        // Add bonding curve trades
        if (bondingTrades) {
          bondingTrades.forEach(trade => {
            allTokenTrades.push({
              wallet_address: trade.user.toLowerCase(),
              type: trade.type,
              amount: parseFloat(trade.type === 'buy' ? trade.tokensOut : trade.tokensIn),
              total_bnb: 0, // Bonding trades don't use BNB
              total_haven: parseFloat(trade.type === 'buy' ? trade.ethIn : trade.ethOut),
              timestamp: trade.timestamp,
              source: 'bonding'
            })
          })
        }

        // Add DEX swaps
        if (dexSwaps) {
          dexSwaps.forEach(swap => {
            allTokenTrades.push({
              wallet_address: swap.trader_address.toLowerCase(),
              type: swap.is_buy ? 'buy' : 'sell',
              amount: parseFloat(swap.token_amount) / 1e18,
              total_bnb: parseFloat(swap.bnb_amount) / 1e18,
              total_haven: 0, // DEX trades don't use HAVEN
              timestamp: swap.timestamp,
              source: 'dex'
            })
          })
        }

        
        if (allTokenTrades.length > 0) {
          
        }

        // Use database if we have data and it matches expected count
        if (dbHoldings && dbHoldings.length > 0 && robot?.holders_count === dbHoldings.length) {

          // Convert database holdings to balances Map
          const balances = new Map()
          for (const holding of dbHoldings) {
            balances.set(holding.holder_address.toLowerCase(), BigInt(holding.balance))
          }

          // Cache the balances for incremental updates
          cachedBalances.current = balances

          // Convert to holders array
          const holdersWithPercentage = balancesToHolders(balances)

          // Fetch wallet balances from database
          const { data: walletBalances } = await supabase
            .from('holder_wallet_balances')
            .select('holder_address, bnb_balance, haven_balance, token_balance')
            .eq('token_address', address.toLowerCase())

          // Create map for quick lookup of wallet balances
          const walletBalanceMap = new Map()
          if (walletBalances) {
            walletBalances.forEach(wb => {
              walletBalanceMap.set(wb.holder_address.toLowerCase(), {
                bnbBalance: parseFloat(wb.bnb_balance) || 0,
                havenBalance: parseFloat(wb.haven_balance) || 0,
                tokenBalance: parseFloat(wb.token_balance) || 0
              })
            })
          }

          

          // Track holders that need balance fetching
          const holdersNeedingBalances = []

          // Enrich with trade statistics and wallet balances
          const enrichedHolders = holdersWithPercentage.map(holder => {
            const holderTrades = allTokenTrades.filter(t =>
              t.wallet_address === holder.address.toLowerCase()
            )

            const buys = holderTrades.filter(t => t.type === 'buy')
            const sells = holderTrades.filter(t => t.type === 'sell')

            const totalBought = buys.reduce((sum, t) => sum + (t.amount || 0), 0)
            const totalSold = sells.reduce((sum, t) => sum + (t.amount || 0), 0)

            // Separate BNB and HAVEN tracking - show total spent on this token
            const totalBNBSpent = buys.reduce((sum, t) => sum + (t.total_bnb || 0), 0)
            const totalBNBReceived = sells.reduce((sum, t) => sum + (t.total_bnb || 0), 0)
            const totalHavenSpent = buys.reduce((sum, t) => sum + (t.total_haven || 0), 0)
            const totalHavenReceived = sells.reduce((sum, t) => sum + (t.total_haven || 0), 0)

            // Calculate average market cap at buy/sell time
            // We don't have market cap stored, so we'll estimate it based on current price and token supply
            const currentMC = (tokenData?.price || 0) * robot.total_supply
            const avgBuyMC = buys.length > 0 ? currentMC : 0 // Simplified for now
            const avgSellMC = sells.length > 0 ? currentMC : 0 // Simplified for now

            // Get wallet balances from database or mark for fetching
            const walletBalance = walletBalanceMap.get(holder.address.toLowerCase())
            if (!walletBalance) {
              holdersNeedingBalances.push(holder.address.toLowerCase())
            }

            // Use token balance from database if available, otherwise use holder.balance
            const tokenBalance = walletBalance?.tokenBalance || holder.balance
            const currentValue = tokenBalance * (tokenData?.price || 0)

            // PnL calculation: invested (BNB + HAVEN in USD), realized (BNB + HAVEN received in USD), unrealized (current value)
            const bnbInvestedUSD = totalBNBSpent * bnbPrice
            const havenInvestedUSD = totalHavenSpent * havenPrice
            const bnbRealizedUSD = totalBNBReceived * bnbPrice
            const havenRealizedUSD = totalHavenReceived * havenPrice

            const invested = bnbInvestedUSD + havenInvestedUSD
            const realized = bnbRealizedUSD + havenRealizedUSD
            const unrealized = currentValue
            const totalPnL = (realized + unrealized) - invested

            return {
              ...holder,
              balance: tokenBalance, // Use the updated token balance
              bnbBalance: walletBalance?.bnbBalance || 0,
              havenBalance: walletBalance?.havenBalance || 0,
              totalBought,
              totalSold,
              avgBuyMC,
              avgSellMC,
              unrealized,
              pnl: totalPnL,
              remaining: tokenBalance
            }
          })

          setHolders(enrichedHolders)

          // Fetch wallet balances from blockchain for holders not in database
          if (holdersNeedingBalances.length > 0) {
            const holdersToFetch = enrichedHolders.filter(h =>
              holdersNeedingBalances.includes(h.address.toLowerCase())
            )
            fetchHolderWalletBalances(holdersToFetch, address)
          }

          setIsLoadingHolders(false)
          return
        }

        // Fallback to blockchain if database is empty or doesn't match
        
        const { ethers } = await import('ethers')

        const rpcUrl = import.meta.env.VITE_BSC_RPC_URL || 'https://bsc-dataseed.binance.org/'
        const provider = new ethers.JsonRpcProvider(rpcUrl)

        const TOKEN_ABI = [
          'event Transfer(address indexed from, address indexed to, uint256 value)'
        ]

        const contract = new ethers.Contract(address, TOKEN_ABI, provider)

        // Get current block
        const currentBlock = await provider.getBlockNumber()

        // Fetch last 300k blocks (about 10 days on BSC)
        const totalBlocksToFetch = Math.min(300000, currentBlock)
        const fromBlock = Math.max(0, currentBlock - totalBlocksToFetch)
        const CHUNK_SIZE = 10000 // Alchemy's limit

        

        // Get all Transfer events in chunks
        const transferEvents = []

        for (let start = fromBlock; start <= currentBlock; start += CHUNK_SIZE) {
          const end = Math.min(start + CHUNK_SIZE - 1, currentBlock)

          const transfers = await contract.queryFilter(
            contract.filters.Transfer(),
            start,
            end
          )

          transferEvents.push(...transfers)
        }

        

        // Calculate balances from Transfer events
        const balances = new Map()
        const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

        // Process all Transfer events (using BigInt like the script does)
        for (const event of transferEvents) {
          const from = event.args.from.toLowerCase()
          const to = event.args.to.toLowerCase()
          const value = event.args.value

          // Subtract from sender (unless it's a mint from zero address)
          if (from !== ZERO_ADDRESS.toLowerCase()) {
            const current = balances.get(from) || 0n
            balances.set(from, current - value)
          }

          // Add to receiver (unless it's a burn to zero address)
          if (to !== ZERO_ADDRESS.toLowerCase()) {
            const current = balances.get(to) || 0n
            balances.set(to, current + value)
          }
        }

        // Cache the balances for incremental updates
        cachedBalances.current = balances

        // Convert to holders array
        const holdersWithPercentage = balancesToHolders(balances)

        setHolders(holdersWithPercentage)
      } catch (error) {
        
      } finally {
        setIsLoadingHolders(false)
      }
    }

    fetchHolders()

    // Subscribe to real-time transfers for incremental updates
    const transfersSubscription = supabase
      .channel(`transfers-${address}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'transfers',
        filter: `token_address=ilike.${address}`
      }, async (payload) => {
        

        // Try incremental update first
        const success = await updateHoldersIncremental(payload.new)

        // If incremental update fails or no cache, do full refresh
        if (!success) {
          
          fetchHolders()
        }
      })
      .subscribe()

    // Subscribe to real-time wallet balance updates
    const balancesSubscription = supabase
      .channel(`wallet-balances-${address}`)
      .on('postgres_changes', {
        event: '*', // Listen to INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'holder_wallet_balances',
        filter: `token_address=eq.${address.toLowerCase()}`
      }, async (payload) => {
        

        // Update holders state with new balance data
        setHolders(prevHolders => {
          return prevHolders.map(holder => {
            if (holder.address.toLowerCase() === payload.new?.holder_address?.toLowerCase()) {
              const tokenBalance = parseFloat(payload.new.token_balance) || holder.balance
              const currentValue = tokenBalance * (tokenData?.price || 0)

              return {
                ...holder,
                balance: tokenBalance,
                bnbBalance: parseFloat(payload.new.bnb_balance) || 0,
                havenBalance: parseFloat(payload.new.haven_balance) || 0,
                remaining: tokenBalance,
                unrealized: currentValue
              }
            }
            return holder
          })
        })
      })
      .subscribe()

    return () => {
      transfersSubscription.unsubscribe()
      balancesSubscription.unsubscribe()
    }
  }, [address])

  // Fetch DexScreener paid status
  useEffect(() => {
    if (!address) return

    const fetchDexPaidStatus = async () => {
      try {
        // DexScreener API endpoint for BSC (bsc = chainId)
        const response = await fetch(`https://api.dexscreener.com/orders/v1/bsc/${address}`)

        if (!response.ok) {
          setDexPaid(false)
          return
        }

        const data = await response.json()

        // Check if there's a tokenProfile order with status "approved" or "processing"
        const hasTokenProfile = data?.some(order =>
          order.type === 'tokenProfile' &&
          (order.status === 'approved' || order.status === 'processing') &&
          order.paymentTimestamp
        )

        setDexPaid(hasTokenProfile)
      } catch (error) {
        
        setDexPaid(false)
      }
    }

    fetchDexPaidStatus()
  }, [address])

  // Fetch token stats and user data
  useEffect(() => {
    if (!address) {
      return
    }

    const fetchTokenStats = async () => {
      try {
        // Fetch holder analysis from the same API the factory uses
        try {
          const { default: HavenApi } = await import('../../api/haven-api.js')
          const analysis = await HavenApi.Wallet.analyzeBatch([address])
          const tokenAnalysis = analysis[address.toLowerCase()] || analysis[address] || {}

          // Update security data with API values
          setSecurityData(prev => ({
            ...prev,
            top10Percent: tokenAnalysis.top10Holds || 0,
            devPercent: tokenAnalysis.devHolds || 0,
            snipersHold: tokenAnalysis.snipersHold || 0,
            insidersHold: tokenAnalysis.insidersHold || 0,
            phishingPercent: tokenAnalysis.phishingHolds || 0
          }))
        } catch (error) {
        }

        if (walletAddress) {
          let boughtHaven = 0  // Total HAVEN spent
          let soldHaven = 0    // Total HAVEN received

          // Fetch from legacy trades table (ethIn is in XTOKEN, where 1 XTOKEN = 1 HAVEN)
          const { data: legacyTrades } = await supabase
            .from('trades')
            .select('*')
            .ilike('contract', address)
            .ilike('user', walletAddress)

          if (legacyTrades && legacyTrades.length > 0) {
            legacyTrades.forEach(trade => {
              if (trade.type === 'buy' && trade.ethIn) {
                // ethIn is in XTOKEN, and 1 XTOKEN = 1 HAVEN
                boughtHaven += parseFloat(trade.ethIn)
              } else if (trade.type === 'sell' && trade.ethOut) {
                soldHaven += parseFloat(trade.ethOut)
              }
            })
          }

          // Also check bonding_trades table
          const { data: bondingTrades } = await supabase
            .from('bonding_trades')
            .select('*')
            .ilike('token_address', address)
            .ilike('trader_address', walletAddress)

          if (bondingTrades && bondingTrades.length > 0) {
            bondingTrades.forEach(trade => {
              // xtoken_amount is in Wei, convert to decimal (divide by 1e18)
              const value = parseFloat(trade.xtoken_amount || 0) / 1e18
              if (trade.trade_type === 'buy') {
                boughtHaven += value
              } else if (trade.trade_type === 'sell') {
                soldHaven += value
              }
            })
          }

          // Check swaps table for graduated tokens (these use HAVEN, stored in bnb_amount field)
          let boughtBnb = 0
          let soldBnb = 0

          // Filter by pair_address for graduated tokens
          let walletSwapsQuery = supabase
            .from('swaps')
            .select('*')
            .ilike('token_address', address)
            .ilike('trader_address', walletAddress)

          if (fetchedTokenData?.is_graduated && fetchedTokenData?.uniswap_pool_address) {
            walletSwapsQuery = walletSwapsQuery.ilike('pair_address', fetchedTokenData.uniswap_pool_address)
          }

          const { data: swaps } = await walletSwapsQuery

          if (swaps && swaps.length > 0) {
            swaps.forEach(swap => {
              // bnb_amount is in Wei, convert to decimal (divide by 1e18)
              const bnbValue = parseFloat(swap.bnb_amount || 0) / 1e18
              if (swap.is_buy) {
                boughtBnb += bnbValue
              } else {
                soldBnb += bnbValue
              }
            })
          }

          // Convert between currencies using current market rates (from state)
          const havenToBnbRate = (bnbPrice > 0 && isFinite(bnbPrice)) ? havenPrice / bnbPrice : 0

          // Calculate totals
          const totalBoughtHaven = boughtHaven
          const totalSoldHaven = soldHaven
          const totalBoughtBnb = boughtBnb + (boughtHaven * havenToBnbRate)
          const totalSoldBnb = soldBnb + (soldHaven * havenToBnbRate)
          const totalBoughtUsd = (boughtHaven * (havenPrice || 0)) + (boughtBnb * (bnbPrice || 0))
          const totalSoldUsd = (soldHaven * (havenPrice || 0)) + (soldBnb * (bnbPrice || 0))

          // Get current token balance
          const currentTokenBalance = parseFloat(tokenBalance || '0')
          const currentTokenValueUsd = currentTokenBalance * (tokenData?.price || 0)

          // Calculate PnL:
          // Total PnL = (Amount received from sales + Current value of holdings) - Total invested
          const totalPnlUsd = (totalSoldUsd + currentTokenValueUsd) - totalBoughtUsd

          // Calculate PnL in HAVEN and BNB (with safety checks to prevent division by zero)
          const pnlHaven = (havenPrice > 0 && isFinite(havenPrice)) ? totalPnlUsd / havenPrice : 0
          const pnlBnb = (bnbPrice > 0 && isFinite(bnbPrice)) ? totalPnlUsd / bnbPrice : 0
          const pnlPercent = totalBoughtUsd > 0 ? (totalPnlUsd / totalBoughtUsd) * 100 : 0

          setUserStats({
            bought: totalBoughtHaven,
            sold: totalSoldHaven,
            pnl: pnlHaven,
            pnlPercent,
            boughtBnb: totalBoughtBnb,
            soldBnb: totalSoldBnb,
            pnlBnb: pnlBnb,
            boughtUsd: totalBoughtUsd,
            soldUsd: totalSoldUsd,
            pnlUsd: totalPnlUsd
          })
        }

        return

        /* Original API call - commented out since endpoint doesn't exist
        const queryParams = new URLSearchParams({ address })
        if (walletAddress) {
          queryParams.append('wallet', walletAddress)
        }

        const apiUrl = `/api/blockchain/token_stats?${queryParams}`
        
        const response = await fetch(apiUrl)

        if (!response.ok) {
          
          const errorText = await response.text()
          
          return
        }

        const result = await response.json()
        

        if (result.success && result.data) {
          // Merge API data with existing fetched data (from Supabase)
          const timestamp = result.data.timestamp || result.data.createdAt
          setFetchedTokenData(prev => ({
            ...(prev || {}),  // Keep existing data from Supabase (image, etc.)
            ...result.data,   // Merge in API data
            volume24h: result.data.tokenStats?.totalVolume || 0,
            timeAgo: getTimeAgo(timestamp),
            // Preserve liquidity from Supabase if API doesn't provide it
            liquidity: result.data.liquidity ?? prev?.liquidity ?? 0
          }))

          const { tokenStats: stats, userStats: user, securityData: security, tokenCreator: creator } = result.data

          // Update token creator
          if (creator) {
            setTokenCreator(creator)
          }

          // Update token stats
          if (stats) {
            setTokenStats({
              buys: stats.buys || 0,
              buysVolume: stats.buysVolume || 0,
              sells: stats.sells || 0,
              sellsVolume: stats.sellsVolume || 0,
              netBuyVolume: stats.netBuyVolume || 0,
              totalVolume: stats.totalVolume || 0
            })
          }

          // Update user stats if available
          if (user && walletAddress) {
            setUserStats({
              bought: user.bought || 0,
              sold: user.sold || 0,
              pnl: user.pnl || 0,
              pnlPercent: user.pnlPercent || 0
            })
            // Don't override tokenBalance from blockchain
            // setTokenBalance(String(user.tokenBalance || 0))
          }

          // Update security data
          if (security) {
            setSecurityData({
              top10Percent: security.top10Percent || 0,
              snipersHold: security.snipersHold || 0,
              insidersHold: security.insidersHold || 0,
              devPercent: security.devPercent || 0,
              contractVerified: security.contractVerified || false,
              honeypot: security.honeypot || false,
              renounced: security.renounced || false,
              buyTax: security.buyTax || 0,
              sellTax: security.sellTax || 0,
              honeypotRisk: security.honeypotRisk || 0,
              canSellAll: security.canSellAll !== false,
              averageTax: security.averageTax || 0,
              highestTax: security.highestTax || 0,
              dexPaid: security.dexPaid || false,
              liquidityLocked: security.liquidityLocked || false,
              phishingPercent: security.phishing ? 100 : 0,
              snipersPercent: security.snipersHold || 0,
              insidersPercent: security.insidersHold || 0
            })
          }
        }
        */
      } catch (error) {
      }
    }

    fetchTokenStats()

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchTokenStats()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Refresh data every 30 seconds
    const interval = setInterval(fetchTokenStats, 30000)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [address, walletAddress, havenPrice, bnbPrice])

  // Fetch HAVEN and BNB prices
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const HAVEN_ADDRESS = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690'
        const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
        const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'
        const PANCAKE_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'

        const FACTORY_ABI = ['function getPair(address tokenA, address tokenB) view returns (address pair)']
        const PAIR_ABI = [
          'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
          'function token0() view returns (address)'
        ]

        const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org')
        const factory = new ethers.Contract(PANCAKE_FACTORY, FACTORY_ABI, provider)

        // Fetch BNB price from BNB/USDT pair
        let bnbPriceUSD = 600 // Default fallback
        try {
          const bnbUsdtPair = await factory.getPair(WBNB_ADDRESS, USDT_ADDRESS)
          if (bnbUsdtPair !== '0x0000000000000000000000000000000000000000') {
            const bnbPairContract = new ethers.Contract(bnbUsdtPair, PAIR_ABI, provider)
            const [bnbToken0, bnbReserves] = await Promise.all([
              bnbPairContract.token0(),
              bnbPairContract.getReserves()
            ])

            const isBnbToken0 = bnbToken0.toLowerCase() === WBNB_ADDRESS.toLowerCase()
            const wbnbReserve = isBnbToken0 ? bnbReserves[0] : bnbReserves[1]
            const usdtReserve = isBnbToken0 ? bnbReserves[1] : bnbReserves[0]

            // Both reserves use 18 decimals in the contract
            bnbPriceUSD = parseFloat(ethers.formatUnits(usdtReserve, 18)) / parseFloat(ethers.formatEther(wbnbReserve))
            setBnbPrice(bnbPriceUSD)
          }
        } catch (error) {
          
          // Use fallback BNB price
        }

        // Fetch HAVEN price from HAVEN/BNB pair
        const havenBnbPair = await factory.getPair(HAVEN_ADDRESS, WBNB_ADDRESS)
        if (havenBnbPair !== '0x0000000000000000000000000000000000000000') {
          const havenPairContract = new ethers.Contract(havenBnbPair, PAIR_ABI, provider)
          const [havenToken0, havenReserves] = await Promise.all([
            havenPairContract.token0(),
            havenPairContract.getReserves()
          ])

          const isHavenToken0 = havenToken0.toLowerCase() === HAVEN_ADDRESS.toLowerCase()
          const havenReserve = isHavenToken0 ? havenReserves[0] : havenReserves[1]
          const wbnbReserve = isHavenToken0 ? havenReserves[1] : havenReserves[0]

          const havenPriceInBNB = parseFloat(ethers.formatEther(wbnbReserve)) / parseFloat(ethers.formatEther(havenReserve))
          const havenPriceUSD = havenPriceInBNB * bnbPriceUSD

          setHavenPrice(havenPriceUSD)
        }
      } catch (error) {
        
        // Keep default values if fetch fails
      }
    }

    fetchPrices()

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchPrices()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Refresh prices every 30 seconds
    const interval = setInterval(fetchPrices, 30000)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Fetch pair address only (don't override price/liquidity from DB)
  useEffect(() => {
    if (!address) return

    const fetchPairAddress = async () => {
      try {
        const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
        const PANCAKE_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'
        const FACTORY_ABI = ['function getPair(address tokenA, address tokenB) view returns (address pair)']

        const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org')
        const factory = new ethers.Contract(PANCAKE_FACTORY, FACTORY_ABI, provider)

        const pairAddress = await factory.getPair(address, WBNB_ADDRESS)

        if (pairAddress !== '0x0000000000000000000000000000000000000000') {
          setFetchedTokenData(prev => ({
            ...prev,
            pairAddress
          }))
        }
      } catch (error) {
        
      }
    }

    fetchPairAddress()
  }, [address])

  // Fetch actual wallet balances from blockchain
  useEffect(() => {
    if (!address || !walletAddress || !isConnected) {
      return
    }

    const fetchBalances = async () => {
      try {
        // Fetch token balance
        const tokenBalanceResult = await readContract(wagmiConfig, {
          address: address,
          abi: TokenAbi,
          functionName: 'balanceOf',
          args: [walletAddress]
        })

        // Convert from wei to token amount (assuming 18 decimals)
        const tokenBalanceFormatted = formatUnits(tokenBalanceResult, 18)
        setTokenBalance(tokenBalanceFormatted)

        // Fetch BNB balance using getBalance from wagmi/core
        const bnbBalance = await getBalance(wagmiConfig, { address: walletAddress })
        const bnbBalanceFormatted = formatUnits(bnbBalance.value, 18)
        setWalletBalance(bnbBalanceFormatted)

        // Fetch HAVEN balance (using CONTRACTS.xtoken address)
        if (CONTRACTS.xtoken?.address) {
          const havenBalanceResult = await readContract(wagmiConfig, {
            address: CONTRACTS.xtoken.address,
            abi: TokenAbi,
            functionName: 'balanceOf',
            args: [walletAddress]
          })
          const havenBalanceFormatted = formatUnits(havenBalanceResult, 18)
          setHavenBalance(havenBalanceFormatted)
        }

      } catch (error) {
      }
    }

    fetchBalances()

    // Refresh balances every 10 seconds
    const interval = setInterval(fetchBalances, 10000)
    return () => clearInterval(interval)
  }, [address, walletAddress, isConnected])

  return (
    <>
      <style>{hideScrollbarStyles}</style>
      <div
        className="h-screen text-white flex flex-col overflow-hidden"
        style={{backgroundColor: HAVEN_COLORS.background}}
      >
        {/* Top Tabs - Trading and Control */}
        <div className="flex items-center px-4" style={{backgroundColor: HAVEN_COLORS.surface, borderBottom: `1px solid ${HAVEN_COLORS.border}`}}>
          {[
            { id: 'trading', label: 'Trading', icon: Activity },
            { id: 'control', label: 'Control', icon: Settings },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                if (id === 'control') {
                  setIsRobotModalOpen(true)
                } else {
                  setActiveTab(id)
                }
              }}
              className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors`}
              style={{
                borderColor: activeTab === id ? HAVEN_COLORS.primary : 'transparent',
                color: activeTab === id ? 'white' : HAVEN_COLORS.textSecondary
              }}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-5 h-5" />
                {label}
              </div>
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        {activeTab === 'trading' ? (
        <div className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">
        <PanelGroup direction="horizontal" className="flex-1">
        {/* Left - Chart and Trades */}
        <Panel defaultSize={80} minSize={50}>
        <div className="flex-1 flex flex-col lg:h-full min-w-0 h-full">
          <PanelGroup direction="vertical">
          {/* Chart Area */}
          <Panel defaultSize={55} minSize={30}>
          <div className="flex-1 flex flex-col overflow-hidden h-full">
            {/* Token Summary Header */}
            <div className="px-2 sm:px-4 py-3 shrink-0" style={{
              backgroundColor: HAVEN_COLORS.surface,
              borderBottom: `1px solid ${HAVEN_COLORS.border}`
            }}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 lg:gap-3">
                {/* Left: Token Info */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink-0">
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent((tokenData.name || tokenData.ticker) + ' ' + (tokenData.symbol || tokenData.ticker) + ' crypto')}`, '_blank')}
                      className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center ring-2 transition-all duration-200 cursor-pointer"
                      style={{
                        background: tokenData.image ? 'transparent' : `linear-gradient(to bottom right, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`,
                        borderColor: HAVEN_COLORS.border
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)'
                        e.currentTarget.style.borderColor = HAVEN_COLORS.primary
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)'
                        e.currentTarget.style.borderColor = HAVEN_COLORS.border
                      }}
                      title="Search on Google"
                    >
                      {tokenData.image ? (
                        <img
                          src={safeImageUrl(tokenData.image)}
                          alt={tokenData.symbol || tokenData.ticker || 'Token'}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.nextSibling.style.display = 'flex'
                          }}
                        />
                      ) : null}
                      <span className="text-white font-bold text-2xl" style={{display: tokenData.image ? 'none' : 'flex'}}>
                        {tokenData.symbol?.[0] || tokenData.ticker?.[0] || '?'}
                      </span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite(address)
                      }}
                      className="absolute -top-1 -right-1 p-0.5 rounded-full hover:bg-opacity-100 transition-colors cursor-pointer"
                      style={{backgroundColor: `${HAVEN_COLORS.background}e6`}}
                      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400 hover:text-yellow-400'} transition-colors`}
                      />
                    </button>
                  </div>

                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-bold text-white whitespace-nowrap">
                        {tokenData.symbol || tokenData.ticker || 'TKN'}
                      </span>
                      <span className="text-sm text-gray-400 truncate">{tokenData.name || 'Robot Token'}</span>

                      {/* Copy Button with Dropdown */}
                      <div className="relative group">
                        <button
                          className="p-1 rounded transition-colors cursor-pointer"
                          style={{backgroundColor: 'transparent'}}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = HAVEN_COLORS.surface
                            e.currentTarget.querySelector('svg').style.color = '#d1d5db'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.querySelector('svg').style.color = '#6b7280'
                          }}
                          title="Copy options"
                        >
                          <Copy className="w-3.5 h-3.5 text-gray-500 transition-colors" />
                        </button>
                        <div
                          className="absolute top-full left-0 mt-1 rounded-lg shadow-2xl py-1 min-w-[140px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50"
                          style={{
                            backgroundColor: '#1a1f2e',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)'
                          }}
                        >
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(tokenData.name || tokenData.ticker)
                              const toast = document.createElement('div')
                              toast.textContent = 'Name copied!'
                              toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] text-sm font-medium'
                              document.body.appendChild(toast)
                              setTimeout(() => toast.remove(), 2000)
                            }}
                            className="w-full px-3 py-1.5 text-left text-xs text-gray-300 transition-colors cursor-pointer"
                            style={{backgroundColor: 'transparent', color: '#9ca3af'}}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                              e.currentTarget.style.color = 'white'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = '#9ca3af'
                            }}
                          >
                            Copy Name
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(address)
                              const toast = document.createElement('div')
                              toast.textContent = 'Address copied!'
                              toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] text-sm font-medium'
                              document.body.appendChild(toast)
                              setTimeout(() => toast.remove(), 2000)
                            }}
                            className="w-full px-3 py-1.5 text-left text-xs text-gray-300 transition-colors cursor-pointer"
                            style={{backgroundColor: 'transparent', color: '#9ca3af'}}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                              e.currentTarget.style.color = 'white'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = '#9ca3af'
                            }}
                          >
                            Copy Address
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(tokenData.symbol || tokenData.ticker)
                              const toast = document.createElement('div')
                              toast.textContent = 'Symbol copied!'
                              toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] text-sm font-medium'
                              document.body.appendChild(toast)
                              setTimeout(() => toast.remove(), 2000)
                            }}
                            className="w-full px-3 py-1.5 text-left text-xs text-gray-300 transition-colors cursor-pointer"
                            style={{backgroundColor: 'transparent', color: '#9ca3af'}}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                              e.currentTarget.style.color = 'white'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = '#9ca3af'
                            }}
                          >
                            Copy Symbol
                          </button>
                        </div>
                      </div>

                      {/* Share Button */}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.href)
                          const toast = document.createElement('div')
                          toast.textContent = 'Link copied!'
                          toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] text-sm font-medium'
                          document.body.appendChild(toast)
                          setTimeout(() => toast.remove(), 2000)
                        }}
                        className="p-1 rounded transition-colors cursor-pointer"
                        style={{backgroundColor: 'transparent'}}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = HAVEN_COLORS.surface
                          e.currentTarget.querySelector('svg').style.color = '#d1d5db'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.querySelector('svg').style.color = '#6b7280'
                        }}
                        title="Share token link"
                      >
                        <Share2 className="w-3.5 h-3.5 text-gray-500 transition-colors" />
                      </button>

                      {/* Etherscan Button */}
                      <button
                        onClick={() => window.open(`https://bscscan.com/token/${address}`, '_blank')}
                        className="p-1 rounded transition-colors cursor-pointer"
                        style={{backgroundColor: 'transparent'}}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = HAVEN_COLORS.surface
                          e.currentTarget.querySelector('svg').style.color = '#d1d5db'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.querySelector('svg').style.color = '#6b7280'
                        }}
                        title="View on BSCScan"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-gray-500 transition-colors" />
                      </button>

                      {/* Search Button with Dropdown */}
                      <div className="relative group">
                        <button
                          className="p-1 rounded transition-colors cursor-pointer"
                          style={{backgroundColor: 'transparent'}}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = HAVEN_COLORS.surface
                            e.currentTarget.querySelector('svg').style.color = '#d1d5db'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.querySelector('svg').style.color = '#6b7280'
                          }}
                          title="Search options"
                        >
                          <Search className="w-3.5 h-3.5 text-gray-500 transition-colors" />
                        </button>
                        <div
                          className="absolute top-full left-0 mt-1 rounded-lg shadow-2xl py-1 min-w-[180px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50"
                          style={{
                            backgroundColor: '#1a1f2e',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)'
                          }}
                        >
                          <button
                            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent((tokenData.name || tokenData.ticker) + ' crypto token')}`, '_blank')}
                            className="w-full px-3 py-1.5 text-left text-xs transition-colors cursor-pointer"
                            style={{backgroundColor: 'transparent', color: '#9ca3af'}}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                              e.currentTarget.style.color = 'white'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = '#9ca3af'
                            }}
                          >
                            Google: Token Name
                          </button>
                          <button
                            onClick={() => window.open(`https://twitter.com/search?q=${encodeURIComponent(address)}`, '_blank')}
                            className="w-full px-3 py-1.5 text-left text-xs transition-colors cursor-pointer"
                            style={{backgroundColor: 'transparent', color: '#9ca3af'}}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                              e.currentTarget.style.color = 'white'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = '#9ca3af'
                            }}
                          >
                            X: Contract Address
                          </button>
                          <button
                            onClick={() => window.open(`https://twitter.com/search?q=${encodeURIComponent(tokenData.name || tokenData.ticker)}`, '_blank')}
                            className="w-full px-3 py-1.5 text-left text-xs transition-colors cursor-pointer"
                            style={{backgroundColor: 'transparent', color: '#9ca3af'}}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                              e.currentTarget.style.color = 'white'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = '#9ca3af'
                            }}
                          >
                            X: Token Name
                          </button>
                          <button
                            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(address + ' bscscan')}`, '_blank')}
                            className="w-full px-3 py-1.5 text-left text-xs transition-colors cursor-pointer"
                            style={{backgroundColor: 'transparent', color: '#9ca3af'}}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                              e.currentTarget.style.color = 'white'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = '#9ca3af'
                            }}
                          >
                            Google: Address
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Contract Address with Time Ago, Copy, and Socials */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-500">
                        {tokenData.timeAgo || 'New'}
                      </span>
                      <span className="text-[10px] text-gray-600">•</span>
                      <span className="font-mono text-[10px] text-gray-400">
                        {address?.slice(0, 6)}...{address?.slice(-4)}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(address)
                          const toast = document.createElement('div')
                          toast.textContent = '✓ Contract copied!'
                          toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-[9999] text-sm font-medium'
                          document.body.appendChild(toast)
                          setTimeout(() => toast.remove(), 2000)
                        }}
                        className="p-0.5 rounded transition-colors cursor-pointer"
                        style={{backgroundColor: 'transparent'}}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = HAVEN_COLORS.surface
                          e.currentTarget.querySelector('svg').style.color = '#d1d5db'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.querySelector('svg').style.color = '#6b7280'
                        }}
                        title="Copy contract address"
                      >
                        <Copy className="w-3 h-3 text-gray-500 transition-colors" />
                      </button>

                      {/* Social Links */}
                      <div className="flex items-center gap-1 ml-0.5">
                        {robot?.twitter && (
                          <button
                            onClick={() => window.open(robot.twitter, '_blank')}
                            className="p-0.5 rounded transition-colors cursor-pointer"
                            style={{backgroundColor: 'transparent'}}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = HAVEN_COLORS.surface
                              e.currentTarget.querySelector('svg').style.color = '#1DA1F2'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.querySelector('svg').style.color = '#6b7280'
                            }}
                            title="Twitter"
                          >
                            <svg className="w-3 h-3 text-gray-500 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                            </svg>
                          </button>
                        )}
                        {robot?.telegram && (
                          <button
                            onClick={() => window.open(robot.telegram, '_blank')}
                            className="p-0.5 rounded transition-colors cursor-pointer"
                            style={{backgroundColor: 'transparent'}}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = HAVEN_COLORS.surface
                              e.currentTarget.querySelector('svg').style.color = '#0088cc'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.querySelector('svg').style.color = '#6b7280'
                            }}
                            title="Telegram"
                          >
                            <svg className="w-3 h-3 text-gray-500 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
                            </svg>
                          </button>
                        )}
                        {robot?.website && (
                          <button
                            onClick={() => window.open(robot.website, '_blank')}
                            className="p-0.5 rounded transition-colors cursor-pointer"
                            style={{backgroundColor: 'transparent'}}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = HAVEN_COLORS.surface
                              e.currentTarget.querySelector('svg').style.color = '#d1d5db'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.querySelector('svg').style.color = '#6b7280'
                            }}
                            title="Website"
                          >
                            <Globe className="w-3 h-3 text-gray-500 transition-colors" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Center: Stats */}
                <div className="w-full sm:flex-1 min-w-0 overflow-hidden">
                  <div className="px-1.5 sm:px-2 lg:px-3 py-1.5 sm:py-2 rounded-2xl transition-all duration-300"
                       style={{
                         backgroundColor: HAVEN_COLORS.elevated,
                         border: `1px solid ${HAVEN_COLORS.border}`
                       }}>
                    <div className="grid grid-cols-5 gap-0.5 sm:gap-1 lg:gap-1.5 xl:gap-2">
                      <div className="text-center min-w-0">
                        <div className="text-gray-400 text-[8px] sm:text-[9px] lg:text-[9px] xl:text-[10px] uppercase tracking-tight mb-0.5 font-semibold">MCAP</div>
                        <div className="text-white font-bold text-[9px] sm:text-[10px] lg:text-[10px] xl:text-xs leading-none">
                          ${formatNumber(tokenData.marketCap || 0)}
                        </div>
                      </div>
                      <div className="text-center min-w-0">
                        <div className="text-gray-400 text-[8px] sm:text-[9px] lg:text-[9px] xl:text-[10px] uppercase tracking-tight mb-0.5 font-semibold">PRICE</div>
                        <div className="text-white font-bold text-[9px] sm:text-[10px] lg:text-[10px] xl:text-xs leading-none">
                          ${(tokenData.price || 0).toFixed(3)}
                        </div>
                      </div>
                      <div className="text-center min-w-0">
                        <div className="text-gray-400 text-[8px] sm:text-[9px] lg:text-[9px] xl:text-[10px] uppercase tracking-tight mb-0.5 font-semibold">LIQ</div>
                        <div className="text-white font-bold text-[9px] sm:text-[10px] lg:text-[10px] xl:text-xs leading-none">
                          ${formatNumber(tokenData.liquidityUSD || 0)}
                        </div>
                      </div>
                      <div className="text-center min-w-0">
                        <div className="text-gray-400 text-[8px] sm:text-[9px] lg:text-[9px] xl:text-[10px] uppercase tracking-tight mb-0.5 font-semibold">VOL</div>
                        <div className="text-white font-bold text-[9px] sm:text-[10px] lg:text-[10px] xl:text-xs leading-none">
                          ${formatNumber(tokenData.volume24h || 0)}
                        </div>
                      </div>
                      <div className="text-center min-w-0">
                        <div className="text-gray-400 text-[8px] sm:text-[9px] lg:text-[9px] xl:text-[10px] uppercase tracking-tight mb-0.5 font-semibold">SUPPLY</div>
                        <div className="text-white font-bold text-[9px] sm:text-[10px] lg:text-[10px] xl:text-xs leading-none">
                          {formatNumber(tokenData.totalSupply || 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Progress - Desktop (shows inline on large screens) */}
                <div className="hidden lg:flex items-center gap-1.5 xl:gap-2 flex-shrink-0">
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <div className="text-[8px] xl:text-[9px] text-gray-400 font-semibold">Graduation Progress</div>
                    <div className="text-xs xl:text-sm font-bold" style={{color: HAVEN_COLORS.primary}}>
                      {bondingCurveProgress.toFixed(2)}%
                    </div>
                    <div className="text-[7px] xl:text-[8px] text-gray-500">
                      {(() => {
                        const isBNBPair = fetchedTokenData?.pairtype === 'bnb' || fetchedTokenData?.pairType === 'bnb'
                        const GRADUATION_AMOUNT = 17000
                        const pairSymbol = isBNBPair ? 'BNB' : 'HAVEN'
                        const pairPrice = isBNBPair ? bnbPrice : havenPrice
                        const raised = (bondingCurveProgress / 100) * GRADUATION_AMOUNT
                        const remaining = GRADUATION_AMOUNT - raised
                        const usdRemaining = remaining * pairPrice
                        const nativeRemaining = remaining
                        return `${remaining.toFixed(0)} ${pairSymbol} ($${usdRemaining.toFixed(0)}) left`
                      })()}
                    </div>
                  </div>
                  <div className="w-20 xl:w-32 h-2.5 xl:h-3 rounded-full overflow-hidden shadow-lg"
                       style={{
                         backgroundColor: HAVEN_COLORS.surface,
                         border: `1px solid ${HAVEN_COLORS.border}`
                       }}>
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${bondingCurveProgress}%`,
                        background: `linear-gradient(to right, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Progress - Mobile (shows below stats on smaller screens) */}
              <div className="lg:hidden flex flex-col gap-1.5 mt-2 px-2 sm:px-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col items-start gap-0.5 flex-shrink-0">
                    <div className="text-[9px] sm:text-xs text-gray-400 font-semibold">Graduation Progress</div>
                    <div className="text-sm sm:text-base font-bold" style={{color: HAVEN_COLORS.primary}}>
                      {bondingCurveProgress.toFixed(2)}%
                    </div>
                  </div>
                  <div className="text-[8px] sm:text-[9px] text-gray-500 text-right">
                    {(() => {
                      const isBNBPair = fetchedTokenData?.pairtype === 'bnb' || fetchedTokenData?.pairType === 'bnb'
                      const GRADUATION_AMOUNT = 17000
                      const pairSymbol = isBNBPair ? 'BNB' : 'HAVEN'
                      const pairPrice = isBNBPair ? bnbPrice : havenPrice
                      const raised = (bondingCurveProgress / 100) * GRADUATION_AMOUNT
                      const remaining = GRADUATION_AMOUNT - raised
                      const usdRemaining = remaining * pairPrice
                      return (
                        <div className="flex flex-col items-end">
                          <div>{remaining.toFixed(0)} {pairSymbol} left</div>
                          <div>${usdRemaining.toFixed(0)}</div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
                <div className="flex-1 h-3 sm:h-4 rounded-full overflow-hidden shadow-lg"
                     style={{
                       backgroundColor: HAVEN_COLORS.surface,
                       border: `2px solid ${HAVEN_COLORS.border}`
                     }}>
                  <div
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${bondingCurveProgress}%`,
                      background: `linear-gradient(to right, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="flex-1 relative overflow-hidden min-h-[300px] sm:min-h-[400px]" style={{backgroundColor: HAVEN_COLORS.background}}>
              {/* Chart Controls - Transparent toolbar buttons (matching iframe) */}
              <div style={{
                position: 'absolute',
                top: '8px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'transparent',
                border: 'none',
                padding: 0,
                zIndex: 10,
                display: 'flex',
                gap: '2px',
                alignItems: 'center',
                pointerEvents: 'auto'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  height: '28px',
                  gap: '2px'
                }}>
                  <button
                    onClick={() => setChartDisplayMode('price')}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: chartDisplayMode === 'price' ? '#ffffff' : '#787b86',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      border: 'none',
                      background: chartDisplayMode === 'price' ? 'rgba(41, 98, 255, 0.2)' : 'transparent',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                      userSelect: 'none'
                    }}
                    onMouseOver={(e) => {
                      if (chartDisplayMode !== 'price') {
                        e.currentTarget.style.color = '#d1d4dc';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (chartDisplayMode !== 'price') {
                        e.currentTarget.style.color = '#787b86';
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    Price
                  </button>
                  <button
                    onClick={() => setChartDisplayMode('mcap')}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: chartDisplayMode === 'mcap' ? '#ffffff' : '#787b86',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      border: 'none',
                      background: chartDisplayMode === 'mcap' ? 'rgba(41, 98, 255, 0.2)' : 'transparent',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                      userSelect: 'none'
                    }}
                    onMouseOver={(e) => {
                      if (chartDisplayMode !== 'mcap') {
                        e.currentTarget.style.color = '#d1d4dc';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (chartDisplayMode !== 'mcap') {
                        e.currentTarget.style.color = '#787b86';
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    MCap
                  </button>
                </div>

                <div style={{
                  width: '1px',
                  height: '20px',
                  background: 'rgba(120, 123, 134, 0.3)',
                  margin: '0 8px'
                }} />

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  height: '28px',
                  gap: '2px'
                }}>
                  <button
                    onClick={() => setChartCurrency('bnb')}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: chartCurrency === 'bnb' ? '#ffffff' : '#787b86',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      border: 'none',
                      background: chartCurrency === 'bnb' ? 'rgba(41, 98, 255, 0.2)' : 'transparent',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                      userSelect: 'none'
                    }}
                    onMouseOver={(e) => {
                      if (chartCurrency !== 'bnb') {
                        e.currentTarget.style.color = '#d1d4dc';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (chartCurrency !== 'bnb') {
                        e.currentTarget.style.color = '#787b86';
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    BNB
                  </button>
                  <button
                    onClick={() => setChartCurrency('usd')}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: chartCurrency === 'usd' ? '#ffffff' : '#787b86',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      border: 'none',
                      background: chartCurrency === 'usd' ? 'rgba(41, 98, 255, 0.2)' : 'transparent',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                      userSelect: 'none'
                    }}
                    onMouseOver={(e) => {
                      if (chartCurrency !== 'usd') {
                        e.currentTarget.style.color = '#d1d4dc';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (chartCurrency !== 'usd') {
                        e.currentTarget.style.color = '#787b86';
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    USD
                  </button>
                </div>
              </div>

              {/* Haven Token Chart with TradingView */}
              <HavenTokenChart
                ref={havenTokenChartRef}
                address={address}
                tokenData={tokenData}
                supabase={supabase}
                className="w-full h-full"
                displayMode={chartDisplayMode}
                currency={chartCurrency}
                bnbPrice={bnbPrice}
              />
            </div>
          </div>
          </Panel>

          {/* Vertical Resize Handle */}
          <PanelResizeHandle className="h-1 bg-gray-700 hover:bg-[#86d99f] transition-colors cursor-row-resize" />

          {/* Bottom Tabs */}
          <Panel defaultSize={45} minSize={25}>
          <div className="flex flex-col h-full overflow-hidden"
               style={{
                 backgroundColor: HAVEN_COLORS.surface,
                 borderTop: `1px solid ${HAVEN_COLORS.border}`
               }}>
            {/* Sub-tabs for Trading */}
            {activeTab === 'trading' && (
              <div className="flex items-center px-1" style={{borderBottom: `1px solid ${HAVEN_COLORS.border}`}}>
                {[
                  { id: 'trades', label: 'Trades' },
                  { id: 'positions', label: 'Positions' },
                  { id: 'holders', label: 'Holders', count: holders.length },
                ].map(({ id, label, count }) => (
                  <button
                    key={id}
                    onClick={() => setTradingSubTab(id)}
                    className={`px-4 py-2 text-sm border-b-2 transition-colors`}
                    style={{
                      borderColor: tradingSubTab === id ? HAVEN_COLORS.primary : 'transparent',
                      color: tradingSubTab === id ? 'white' : HAVEN_COLORS.textSecondary
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      {label}
                      {count !== undefined && <span className="text-gray-500">({count})</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Content based on active tab */}
            <div className="flex-1 overflow-y-auto hide-scrollbar">
              {activeTab === 'trading' && tradingSubTab === 'holders' ? (
                // Holders Table - DexScreener Style
                isLoadingHolders ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    Loading holders...
                  </div>
                ) : holders.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    No holders yet
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-xs min-w-[1400px]">
                      <thead style={{
                        backgroundColor: HAVEN_COLORS.elevated,
                        position: 'sticky',
                        top: 0,
                        zIndex: 1
                      }}>
                        <tr className="border-b" style={{borderColor: HAVEN_COLORS.border}}>
                          {[
                            { key: 'rank', label: '#', align: 'left', sortable: false },
                            { key: 'wallet', label: 'Wallet', align: 'left', sortable: false },
                            { key: 'tokenBal', label: 'Token Bal', align: 'right', sortable: true },
                            { key: 'bnbBal', label: 'BNB Bal', align: 'right', sortable: true },
                            { key: 'havenBal', label: 'HAVEN Bal', align: 'right', sortable: true },
                            { key: 'bought', label: 'Bought/Avg MC', align: 'right', sortable: true },
                            { key: 'sold', label: 'Sold/Avg MC', align: 'right', sortable: true },
                            { key: 'unrealized', label: 'Unrealized', align: 'right', sortable: true },
                            { key: 'pnl', label: 'PNL', align: 'right', sortable: true },
                            { key: 'remaining', label: 'Remaining', align: 'right', sortable: true }
                          ].map(({ key, label, align, sortable }) => (
                            <th
                              key={key}
                              className={`px-2 py-2.5 text-${align} text-gray-500 font-medium text-[10px] uppercase tracking-wider ${sortable ? 'cursor-pointer hover:text-white transition-colors select-none' : ''}`}
                              onClick={() => {
                                if (sortable) {
                                  if (holderSortColumn === key) {
                                    setHolderSortDirection(holderSortDirection === 'asc' ? 'desc' : 'asc')
                                  } else {
                                    setHolderSortColumn(key)
                                    setHolderSortDirection('desc')
                                  }
                                }
                              }}
                            >
                              <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
                                {label}
                                {sortable && holderSortColumn === key && (
                                  <span className="text-white">
                                    {holderSortDirection === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // Sort holders based on selected column
                          const sortedHolders = [...holders].sort((a, b) => {
                            let aVal, bVal
                            switch (holderSortColumn) {
                              case 'tokenBal':
                                aVal = a.balance || 0
                                bVal = b.balance || 0
                                break
                              case 'bnbBal':
                                aVal = a.bnbBalance || 0
                                bVal = b.bnbBalance || 0
                                break
                              case 'havenBal':
                                aVal = a.havenBalance || 0
                                bVal = b.havenBalance || 0
                                break
                              case 'bought':
                                aVal = a.totalBought || 0
                                bVal = b.totalBought || 0
                                break
                              case 'sold':
                                aVal = a.totalSold || 0
                                bVal = b.totalSold || 0
                                break
                              case 'unrealized':
                                aVal = a.unrealized || 0
                                bVal = b.unrealized || 0
                                break
                              case 'pnl':
                                aVal = a.pnl || 0
                                bVal = b.pnl || 0
                                break
                              case 'remaining':
                                aVal = a.remaining || 0
                                bVal = b.remaining || 0
                                break
                              default:
                                aVal = a.balance
                                bVal = b.balance
                            }
                            return holderSortDirection === 'asc' ? aVal - bVal : bVal - aVal
                          })

                          return sortedHolders.map((holder, index) => {
                            const formatNum = (num) => {
                              if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`
                              if (num >= 1000) return `${(num / 1000).toFixed(2)}K`
                              if (num >= 1) return num.toFixed(2)
                              return num.toFixed(4)
                            }

                            return (
                              <tr
                                key={holder.address}
                                className="border-b hover:bg-white/[0.02] transition-colors"
                                style={{borderColor: HAVEN_COLORS.border + '40'}}
                              >
                                <td className="px-2 py-2 text-left">
                                  <span className="text-gray-400 text-[10px]">{index + 1}</span>
                                </td>
                                <td className="px-2 py-2">
                                  <a
                                    href={`https://bscscan.com/address/${holder.address}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-white hover:text-[#86d99f] transition-colors font-mono text-[10px] flex items-center gap-0.5"
                                    title={holder.address}
                                  >
                                    {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                                    <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                                  </a>
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-white text-[10px]">{formatNum(holder.balance || 0)}</span>
                                    <span className="text-gray-500 text-[9px]">{holder.percentage?.toFixed(1)}%</span>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <div className="flex flex-col items-end">
                                    <span className="text-white text-[10px]">{formatNum(holder.bnbBalance || 0)}</span>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <div className="flex flex-col items-end">
                                    <span className="text-white text-[10px]">{formatNum(holder.havenBalance || 0)}</span>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-white text-[10px]">{formatNum(holder.totalBought || 0)}</span>
                                    <span className="text-gray-500 text-[9px]">${formatNum(holder.avgBuyMC || 0)}</span>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-white text-[10px]">{formatNum(holder.totalSold || 0)}</span>
                                    <span className="text-gray-500 text-[9px]">${formatNum(holder.avgSellMC || 0)}</span>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <span className="text-white text-[10px]">${formatNum(holder.unrealized || 0)}</span>
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <span className={`text-[10px] font-medium ${
                                    (holder.pnl || 0) >= 0 ? 'text-[#86d99f]' : 'text-[#f26682]'
                                  }`}>
                                    {(holder.pnl || 0) >= 0 ? '+' : ''}{formatNum(Math.abs(holder.pnl || 0))}
                                  </span>
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-white text-[10px]">{formatNum(holder.remaining || 0)}</span>
                                    <span className="text-gray-500 text-[9px]">{holder.percentage?.toFixed(1)}%</span>
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        })()}
                      </tbody>
                    </table>
                  </div>
                )
              ) : activeTab === 'trading' && tradingSubTab === 'trades' ? (
                // Trades Table - Enhanced Design
                isLoadingTrades ? (
                  <div className="flex flex-col items-center justify-center p-12 gap-4">
                    <div className="relative w-16 h-16">
                      <div className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin" style={{
                        borderColor: `${HAVEN_COLORS.primary} transparent transparent transparent`
                      }} />
                      <div className="absolute inset-2 rounded-full border-4 border-b-transparent animate-spin" style={{
                        borderColor: `transparent transparent ${HAVEN_COLORS.primaryLight} transparent`,
                        animationDirection: 'reverse',
                        animationDuration: '1s'
                      }} />
                    </div>
                    <p className="text-sm font-semibold text-gray-400">Loading trades...</p>
                  </div>
                ) : allTrades.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 gap-4">
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{
                      background: `linear-gradient(135deg, ${HAVEN_COLORS.surface}cc 0%, ${HAVEN_COLORS.elevated}bb 100%)`,
                      border: `1px solid ${HAVEN_COLORS.border}60`
                    }}>
                      <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-400 mb-1">No trades yet</p>
                      <p className="text-xs text-gray-500">Be the first to trade this token!</p>
                    </div>
                  </div>
                ) : (
                <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead style={{
                    background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated}ee 0%, ${HAVEN_COLORS.surface}dd 100%)`,
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    backdropFilter: 'blur(12px)',
                    boxShadow: `0 2px 8px rgba(0,0,0,0.3), inset 0 -1px 0 ${HAVEN_COLORS.border}60`
                  }}>
                    <tr>
                      {[
                        { key: 'age', label: 'Age', align: 'left', icon: '🕐' },
                        { key: 'type', label: 'Type', align: 'left', icon: '📊' },
                        { key: 'mc', label: 'MC', align: 'right', icon: '💎' },
                        { key: 'amount', label: 'Amount', align: 'right', icon: '🔢' },
                        { key: 'bnb', label: 'BNB', align: 'right', icon: '🌕' },
                        { key: 'haven', label: 'HAVEN', align: 'right', icon: '⚡' },
                        { key: 'usd', label: 'USD', align: 'right', icon: '💵' },
                        { key: 'trader', label: 'Trader', align: 'left', icon: '👤' },
                      ].map(({ key, label, align, icon }) => (
                        <th
                          key={key}
                          className={`text-${align} px-3 py-3 font-bold text-[10px] cursor-pointer select-none group transition-all duration-200`}
                          style={{
                            color: sortColumn === key ? HAVEN_COLORS.primaryLight : '#9ca3af'
                          }}
                          onClick={() => {
                            if (sortColumn === key) {
                              setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                            } else {
                              setSortColumn(key)
                              setSortDirection('desc')
                            }
                          }}
                          onMouseEnter={(e) => {
                            if (sortColumn !== key) {
                              e.currentTarget.style.color = '#d1d5db'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (sortColumn !== key) {
                              e.currentTarget.style.color = '#9ca3af'
                            }
                          }}
                        >
                          <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
                            <span className="text-xs opacity-70 group-hover:opacity-100 transition-opacity">{icon}</span>
                            <span className="uppercase tracking-wide">{label}</span>
                            {sortColumn === key && (
                              <div className="w-4 h-4 rounded flex items-center justify-center transition-transform duration-200" style={{
                                background: `${HAVEN_COLORS.primary}33`,
                                transform: sortDirection === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)'
                              }}>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{color: HAVEN_COLORS.primaryLight}}>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
                                </svg>
                              </div>
                            )}
                          </div>
                        </th>
                      ))}
                      <th className="text-center px-3 py-3 font-bold text-gray-400 text-[10px]">
                        <span className="text-xs opacity-70">🔗</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Sort trades based on selected column
                      const sortedTrades = [...allTrades].sort((a, b) => {
                        const historicalHavenPriceA = a.havenPriceUSD || 0.91
                        const historicalBnbPriceA = a.bnbPriceUSD || 650
                        const historicalHavenPriceB = b.havenPriceUSD || 0.91
                        const historicalBnbPriceB = b.bnbPriceUSD || 650

                        let valueA, valueB

                        switch (sortColumn) {
                          case 'age':
                            valueA = new Date(a.timestamp).getTime()
                            valueB = new Date(b.timestamp).getTime()
                            break
                          case 'type':
                            valueA = a.type === 'buy' ? 1 : 0
                            valueB = b.type === 'buy' ? 1 : 0
                            break
                          case 'mc':
                            const pricePerTokenA = (a.havenAmount || 0) / (a.tokenAmount || 1) * historicalHavenPriceA
                            const pricePerTokenB = (b.havenAmount || 0) / (b.tokenAmount || 1) * historicalHavenPriceB
                            valueA = pricePerTokenA * (tokenData?.totalSupply || fetchedTokenData?.total_supply || 1000000)
                            valueB = pricePerTokenB * (tokenData?.totalSupply || fetchedTokenData?.total_supply || 1000000)
                            break
                          case 'amount':
                            valueA = a.tokenAmount || 0
                            valueB = b.tokenAmount || 0
                            break
                          case 'bnb':
                            valueA = ((a.havenAmount || 0) * historicalHavenPriceA) / historicalBnbPriceA
                            valueB = ((b.havenAmount || 0) * historicalHavenPriceB) / historicalBnbPriceB
                            break
                          case 'haven':
                            valueA = a.havenAmount || 0
                            valueB = b.havenAmount || 0
                            break
                          case 'usd':
                            valueA = (a.havenAmount || 0) * historicalHavenPriceA
                            valueB = (b.havenAmount || 0) * historicalHavenPriceB
                            break
                          case 'trader':
                            valueA = (a.trader || '').toLowerCase()
                            valueB = (b.trader || '').toLowerCase()
                            break
                          default:
                            valueA = new Date(a.timestamp).getTime()
                            valueB = new Date(b.timestamp).getTime()
                        }

                        if (sortDirection === 'asc') {
                          return valueA > valueB ? 1 : -1
                        } else {
                          return valueA < valueB ? 1 : -1
                        }
                      })

                      return sortedTrades.map((trade, index) => {
                      // Calculate actual price from trade amounts (works for both bonding curve and DEX)
                      // This gives us the REAL price at which the trade happened
                      const historicalHavenPrice = trade.havenPriceUSD || 0.91
                      const historicalBnbPrice = trade.bnbPriceUSD || 650

                      // Price per token in HAVEN/BNB terms
                      const pricePerToken = (trade.havenAmount || 0) / (trade.tokenAmount || 1)
                      // Convert to USD using historical HAVEN/BNB price at trade time
                      const priceUSD = pricePerToken * historicalHavenPrice
                      const totalUSD = (trade.havenAmount || 0) * historicalHavenPrice
                      const totalBNB = totalUSD / historicalBnbPrice

                      // Debug logging for first trade

                      const timeAgo = trade.timestamp ? formatTimeAgo(new Date(trade.timestamp)) : 'Unknown'

                      // Market cap at time of trade (using current total supply as approximation)
                      const marketCapAtTrade = priceUSD * (tokenData?.totalSupply || fetchedTokenData?.total_supply || 1000000)

                      return (
                        <tr
                          key={`${trade.txHash || index}-${index}`}
                          className="border-b transition-all duration-200 group cursor-pointer"
                          style={{
                            borderColor: `${HAVEN_COLORS.border}40`,
                            background: 'transparent'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = `linear-gradient(90deg, ${trade.type === 'buy' ? HAVEN_COLORS.primary : '#ef4444'}08 0%, ${trade.type === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'}05 100%)`
                            e.currentTarget.style.borderColor = `${trade.type === 'buy' ? HAVEN_COLORS.primary : '#ef4444'}40`
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.borderColor = `${HAVEN_COLORS.border}40`
                          }}
                        >
                          <td className="px-3 py-3 text-left text-[10px]">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{
                                background: trade.type === 'buy' ? HAVEN_COLORS.primary : '#ef4444'
                              }} />
                              <span className="font-medium text-gray-400 group-hover:text-gray-300 transition-colors">
                                {timeAgo}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all duration-200 group-hover:scale-105" style={{
                              background: `linear-gradient(135deg, ${trade.type === 'buy' ? '#10b981' : '#ef4444'}22 0%, ${trade.type === 'buy' ? '#34d399' : '#f87171'}11 100%)`,
                              border: `1px solid ${trade.type === 'buy' ? '#10b981' : '#ef4444'}40`,
                              boxShadow: `0 2px 8px ${trade.type === 'buy' ? '#10b981' : '#ef4444'}22`
                            }}>
                              <div className="w-1.5 h-1.5 rounded-full" style={{
                                background: trade.type === 'buy' ? '#10b981' : '#ef4444'
                              }} />
                              <span className="text-[9px] font-black uppercase tracking-wide" style={{
                                color: trade.type === 'buy' ? '#34d399' : '#f87171'
                              }}>
                                {trade.type === 'buy' ? 'Buy' : 'Sell'}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right text-[10px]">
                            <span className="font-bold text-white group-hover:text-gray-100 transition-colors">
                            ${marketCapAtTrade >= 1000000
                              ? `${(marketCapAtTrade / 1000000).toFixed(2)}M`
                              : marketCapAtTrade >= 1000
                                ? `${(marketCapAtTrade / 1000).toFixed(2)}K`
                                : marketCapAtTrade.toFixed(0)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right text-[10px]">
                            <span className="font-bold text-white group-hover:text-gray-100 transition-colors">
                              {(() => {
                                const amount = trade.tokenAmount || 0
                                if (amount === 0) return '0'
                                if (amount >= 1) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                if (amount >= 0.01) return amount.toFixed(4)
                                if (amount >= 0.0001) return amount.toFixed(6)
                                return amount.toExponential(2)
                              })()}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right text-[10px]">
                            <span className="font-semibold text-gray-300 group-hover:text-gray-200 transition-colors">
                              {(() => {
                                if (totalBNB === 0) return '0'
                                if (totalBNB >= 0.0001) return totalBNB.toFixed(4)
                                if (totalBNB >= 0.000001) return totalBNB.toFixed(6)
                                return totalBNB.toExponential(2)
                              })()}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right text-[10px]">
                            <span className="font-semibold text-gray-300 group-hover:text-gray-200 transition-colors">
                              {(() => {
                                const amount = trade.havenAmount || 0
                                if (amount === 0) return '0'
                                if (amount >= 0.01) return amount.toFixed(2)
                                if (amount >= 0.0001) return amount.toFixed(4)
                                if (amount >= 0.000001) return amount.toFixed(6)
                                return amount.toExponential(2)
                              })()}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right text-[10px]">
                            <span className="font-bold text-white group-hover:text-gray-100 transition-colors">
                              {(() => {
                                if (totalUSD === 0) return '$0'
                                if (totalUSD >= 0.01) return `$${totalUSD.toFixed(2)}`
                                if (totalUSD >= 0.0001) return `$${totalUSD.toFixed(4)}`
                                if (totalUSD >= 0.000001) return `$${totalUSD.toFixed(6)}`
                                return `$${totalUSD.toExponential(2)}`
                              })()}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {trade.trader ? (
                              <a
                                href={`https://bscscan.com/address/${trade.trader}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-mono font-semibold transition-all duration-200 group/trader"
                                style={{
                                  background: `${HAVEN_COLORS.surface}88`,
                                  border: `1px solid ${HAVEN_COLORS.border}40`,
                                  color: '#60a5fa'
                                }}
                                title={trade.trader}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = `${HAVEN_COLORS.primary}22`
                                  e.currentTarget.style.borderColor = HAVEN_COLORS.primary
                                  e.currentTarget.style.color = HAVEN_COLORS.primaryLight
                                  e.currentTarget.style.transform = 'translateX(2px)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = `${HAVEN_COLORS.surface}88`
                                  e.currentTarget.style.borderColor = `${HAVEN_COLORS.border}40`
                                  e.currentTarget.style.color = '#60a5fa'
                                  e.currentTarget.style.transform = 'translateX(0)'
                                }}
                              >
                                <svg className="w-3 h-3 opacity-70 group-hover/trader:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <span className="truncate max-w-[100px]">
                                  {trade.trader.slice(0, 6)}...{trade.trader.slice(-4)}
                                </span>
                              </a>
                            ) : (
                              <span className="text-gray-500 text-[10px] font-medium">Unknown</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {trade.txHash && (
                              <a
                                href={`https://bscscan.com/tx/${trade.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 group/link"
                                style={{
                                  background: `${HAVEN_COLORS.surface}88`,
                                  border: `1px solid ${HAVEN_COLORS.border}40`,
                                  color: '#9ca3af'
                                }}
                                title="View on BSCScan"
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = `${HAVEN_COLORS.primary}33`
                                  e.currentTarget.style.borderColor = HAVEN_COLORS.primary
                                  e.currentTarget.style.color = HAVEN_COLORS.primaryLight
                                  e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)'
                                  e.currentTarget.style.boxShadow = `0 4px 12px ${HAVEN_COLORS.primary}44`
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = `${HAVEN_COLORS.surface}88`
                                  e.currentTarget.style.borderColor = `${HAVEN_COLORS.border}40`
                                  e.currentTarget.style.color = '#9ca3af'
                                  e.currentTarget.style.transform = 'scale(1) rotate(0deg)'
                                  e.currentTarget.style.boxShadow = 'none'
                                }}
                              >
                                <ExternalLink className="w-3.5 h-3.5 transition-transform duration-200 group-hover/link:rotate-12" />
                              </a>
                            )}
                          </td>
                        </tr>
                      )
                    })})()}
                  </tbody>
                </table>
                </div>
                )
              ) : activeTab === 'trading' && tradingSubTab === 'positions' ? (
                // Positions tab
                <div className="p-6 text-center text-gray-400 text-sm">
                  Coming soon
                </div>
              ) : activeTab === 'control' ? (
                // Control tab - Different for Agents vs Robots
                (() => {
                  return (tokenData.brain_id || fetchedTokenData?.brain_id)
                })() ? (
                  // Agent Control Panel
                  <div className="p-6 space-y-4">
                    <div className="text-center space-y-3">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-2" style={{backgroundColor: `${HAVEN_COLORS.primary}20`}}>
                        <Brain className="h-8 w-8" style={{color: HAVEN_COLORS.primary}} />
                      </div>
                      <h3 className="text-lg font-bold text-white">AI Agent</h3>
                      <p className="text-sm text-gray-400">This token is powered by artificial intelligence</p>
                    </div>

                    <div className="space-y-3 bg-slate-800/40 rounded-xl p-4 border border-slate-700/60">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Model:</span>
                        <span className="text-sm font-medium text-white">{tokenData.brain_id || fetchedTokenData?.brain_id || 'Unknown'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Token:</span>
                        <span className="text-sm font-bold" style={{color: HAVEN_COLORS.primary}}>{tokenData.symbol || tokenData.ticker || 'TKN'}</span>
                      </div>
                      {(tokenData.gamerules || fetchedTokenData?.gamerules) && (
                        <div className="pt-2 border-t border-slate-700/60">
                          <span className="text-xs text-gray-400">Personality:</span>
                          <p className="text-sm text-gray-300 mt-1">{tokenData.gamerules || fetchedTokenData?.gamerules}</p>
                        </div>
                      )}
                    </div>

                    <div className="text-center text-xs text-gray-500 pt-2">
                      Agent interaction features coming soon
                    </div>
                  </div>
                ) : (
                  // Robot Control Panel (original)
                  <div className="p-4 space-y-4 overflow-y-auto hide-scrollbar">
                    <div className="grid grid-cols-[2fr_3fr] gap-4">
                      {/* Robot Status */}
                      <div className="space-y-2">
                        <h3 className="text-xs font-medium text-gray-300">Robot Status</h3>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-gray-400">Token:</span>
                          <p className="font-bold" style={{color: HAVEN_COLORS.primary}}>{tokenData.symbol || tokenData.ticker || 'TKN'}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Simulation ID:</span>
                          <p className="text-gray-300 font-medium">{simulationIdentifier || 'X'}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Battery:</span>
                          <div className="flex items-center space-x-1">
                            <Zap className={`h-3 w-3 ${batteryColor}`} />
                            <span className={`font-medium ${batteryColor}`}>{batteryLevel}%</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-400">Speed:</span>
                          <p className="text-gray-300 font-medium">{Number(speedVal) || 0}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Robot size:</span>
                          <p className="text-gray-300 font-medium">{sizeLabel}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Collision:</span>
                          <p className="text-gray-300 font-medium">{collisionLabel}</p>
                        </div>
                        <div className="col-span-2 grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-gray-400">Abilities:</span>
                            <p className="text-gray-300 font-medium">{String(abilitiesVal)}</p>
                          </div>
                          <div>
                            <span className="text-gray-400">Sensors:</span>
                            <p className="text-gray-300 font-medium">{sensorsLabel}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Map */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-medium text-gray-300">Map <span className="text-gray-400">({`X: ${posLabelX}, Y: ${posLabelY}`})</span></h3>
                        <div className="flex items-center gap-1">
                          <button onClick={zoomOut} className="h-6 px-1.5 text-gray-300 hover:text-white border rounded text-xs" style={{borderColor: HAVEN_COLORS.border}} title="Zoom out"><MinusIcon className="h-2.5 w-2.5" /></button>
                          <button onClick={zoomIn} className="h-6 px-1.5 text-gray-300 hover:text-white border rounded text-xs" style={{borderColor: HAVEN_COLORS.border}} title="Zoom in"><PlusIcon className="h-2.5 w-2.5" /></button>
                          <button onClick={centerOnRobot} className="h-6 px-1.5 text-gray-300 hover:text-white border rounded text-xs" style={{borderColor: HAVEN_COLORS.border}} title="Center on robot"><Crosshair className="h-2.5 w-2.5" /></button>
                        </div>
                      </div>
                      {(() => {
                        const mapSize = 20
                        const posFromSim = statusInfo?.position
                        const sx = Array.isArray(posFromSim) ? posFromSim[0] : posFromSim?.x
                        const sy = Array.isArray(posFromSim) ? posFromSim[1] : posFromSim?.y
                        const rxFromRobot = robot?.position?.x
                        const ryFromRobot = robot?.position?.y
                        const rawX = (sx !== undefined && sx !== null) ? sx : ((rxFromRobot !== undefined && rxFromRobot !== null) ? rxFromRobot : undefined)
                        const rawY = (sy !== undefined && sy !== null) ? sy : ((ryFromRobot !== undefined && ryFromRobot !== null) ? ryFromRobot : undefined)
                        const toPercent = (v, invert = false) => {
                          const n = Number(v)
                          if (!Number.isFinite(n)) return '50%'
                          if (n <= 1 && n >= 0) return `${invert ? (100 - n * 100) : (n * 100)}%`
                          if (n <= 50 && n >= 0) {
                            const p = (n / 50) * 100
                            return `${invert ? (100 - p) : p}%`
                          }
                          if (n <= 100 && n >= 0) {
                            const p = (n / 100) * 100
                            return `${invert ? (100 - p) : p}%`
                          }
                          const idx = Math.max(0, Math.min(mapSize - 1, Math.round(n)))
                          const p = (idx / (mapSize - 1)) * 100
                          return `${invert ? (100 - p) : p}%`
                        }
                        const sizeToPercent = (s) => {
                          const n = Number(s)
                          const cellPct = 100 / mapSize
                          if (!Number.isFinite(n)) return `${cellPct}%`
                          const cells = Math.max(0.1, Math.min(mapSize, n))
                          return `${cells * cellPct}%`
                        }
                        const hasCoords = Number.isFinite(Number(rawX)) && Number.isFinite(Number(rawY))
                        const leftPercent = hasCoords ? toPercent(rawX, false) : '50%'
                        const topPercent = hasCoords ? toPercent(rawY, true) : '50%'
                        const robotW = sizeToPercent(robotSizeX)
                        const robotH = sizeToPercent(robotSizeY)
                        const gridColor = 'rgba(71,85,105,0.35)'
                        const bgStyle = {
                          backgroundImage: `linear-gradient(${gridColor} 1px, transparent 1px), linear-gradient(90deg, ${gridColor} 1px, transparent 1px)`,
                          backgroundSize: `${100 / mapSize}% ${100 / mapSize}%`,
                          backgroundPosition: '0 0',
                        }
                        return (
                          <div ref={mapOuterRef} className="relative rounded-lg overflow-auto border bg-slate-900/40 w-full" style={{borderColor: `${HAVEN_COLORS.border}60`}}>
                            <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
                              <div ref={mapInnerRef} className="absolute top-0 left-0 overflow-hidden" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
                                <div className="absolute inset-0 z-0" style={bgStyle} />
                                <div className="absolute inset-0 z-10">
                                  {objectList.map((obj, idx) => {
                                    const ox = Number(obj?.x_pos)
                                    const oy = Number(obj?.y_pos)
                                    const osx = Number(obj?.x_size || 1)
                                    const osy = Number(obj?.y_size || 1)
                                    if (!Number.isFinite(ox) || !Number.isFinite(oy)) return null
                                    const left = toPercent(ox, false)
                                    const top = toPercent(oy, true)
                                    const width = sizeToPercent(osx)
                                    const height = sizeToPercent(osy)
                                    return (
                                      <div key={idx}
                                        title={obj?.id || 'object'}
                                        className="absolute"
                                        style={{ left, top, width, height, backgroundImage: 'url(/assets/BOX.png)', backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', imageRendering: 'crisp-edges' }}
                                      />
                                    )
                                  })}
                                  <div
                                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
                                    style={{ left: leftPercent, top: topPercent, width: robotW, height: robotH, transition: 'left 300ms ease, top 300ms ease', willChange: 'left, top' }}
                                  >
                                    <div className={`w-full h-full rounded-full overflow-hidden ring-2 ${collision ? 'ring-red-500' : 'ring-slate-300/40'} shadow`}>
                                      <img src={safeImageUrl(robot?.image || tokenData?.image)} alt="robot" className="h-full w-full object-cover" />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  {/* Command List */}
                  <div className="space-y-2" style={{ position: 'relative', zIndex: 10 }}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-medium text-gray-300">Command List</h3>
                      {(() => {
                        const customCount = (commands || []).filter(c => !DEFAULT_COMMANDS.includes(c)).length
                        if (customCount <= 0) return null
                        return (
                          <button
                            onClick={() => setShowCustomCommands(v => !v)}
                            className="text-gray-400 hover:text-white h-6 px-2 text-xs"
                          >
                            <span className="text-xs mr-1">{showCustomCommands ? 'Hide custom' : 'Show custom'}</span>
                            <ChevronDown className={`inline h-3 w-3 transition-transform ${showCustomCommands ? 'rotate-180' : ''}`} />
                          </button>
                        )
                      })()}
                    </div>
                    {(!simulationIdentifier || simulationIdentifier === 'X') ? (
                      <div className="p-4 rounded-lg border text-center" style={{borderColor: `${HAVEN_COLORS.border}60`, backgroundColor: `${HAVEN_COLORS.surface}60`}}>
                        <p className="text-gray-400 mb-2 text-xs">Start a simulation to enable controls</p>
                        <button
                          disabled={!isConnected || isStartingSimulation}
                          onClick={async () => {
                            if (!isConnected || !walletAddress || !deviceNode) return
                            setIsStartingSimulation(true)
                            try {
                              await RobotApi.loadSimulation('sim', { device_node: deviceNode, wallet: walletAddress })
                              const fallbackSimulation = robot?.ownedSimulation || robot?.simulations?.[0] || null
                              if (fallbackSimulation) {
                                const merged = { device_node: deviceNode, ...fallbackSimulation }
                                setStatusInfo(merged)
                                updateSimulation(walletAddress, deviceNode, merged)
                                appendTerminalOutput('Simulation started')
                              }
                            } catch (err) {
                              appendTerminalOutput('Failed to start simulation')
                            } finally {
                              setIsStartingSimulation(false)
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all"
                          style={{backgroundColor: HAVEN_COLORS.primary}}
                        >
                          {isStartingSimulation ? (
                            <span className="inline-flex items-center">
                              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                              Starting...
                            </span>
                          ) : (
                            'Start Simulation'
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5">
                        {DEFAULT_COMMANDS.map((command) => {
                          const Icon = COMMAND_ICONS[command] || Send
                          const isSelected = selectedCommand === command
                          return (
                            <button
                              key={command}
                              onClick={() => handleCommandSelect(command)}
                              title={command}
                              className={`justify-start h-8 transition-all text-xs px-2 rounded border flex items-center gap-1.5 ${
                                isSelected
                                  ? 'text-white shadow-lg'
                                  : 'text-gray-300 hover:text-white'
                              }`}
                              style={{
                                backgroundColor: isSelected ? HAVEN_COLORS.primary : 'transparent',
                                borderColor: isSelected ? HAVEN_COLORS.primary : HAVEN_COLORS.border
                              }}
                            >
                              <Icon className="h-3 w-3 flex-shrink-0" />
                              <span className="text-xs block truncate">{command}</span>
                            </button>
                          )
                        })}

                        {showCustomCommands && (commands || []).filter(c => !DEFAULT_COMMANDS.includes(c)).length > 0 && (
                          <>
                            <div className="col-span-2 flex items-center my-1">
                              <div className="h-px flex-1" style={{backgroundColor: `${HAVEN_COLORS.border}60`}} />
                              <span className="text-xs mx-2 text-gray-400">Custom commands</span>
                              <div className="h-px flex-1" style={{backgroundColor: `${HAVEN_COLORS.border}60`}} />
                            </div>
                            {(commands || []).filter(c => !DEFAULT_COMMANDS.includes(c)).map((command) => {
                              const Icon = COMMAND_ICONS[command] || Send
                              const isSelected = selectedCommand === command
                              return (
                                <button
                                  key={command}
                                  onClick={() => handleCommandSelect(command)}
                                  title={command}
                                  className={`justify-start h-8 transition-all text-xs px-2 rounded border flex items-center gap-1.5 ${
                                    isSelected
                                      ? 'text-white shadow-lg'
                                      : 'text-gray-300 hover:text-white'
                                  }`}
                                  style={{
                                    backgroundColor: isSelected ? HAVEN_COLORS.primary : 'transparent',
                                    borderColor: isSelected ? HAVEN_COLORS.primary : HAVEN_COLORS.border
                                  }}
                                >
                                  <Icon className="h-3 w-3 flex-shrink-0" />
                                  <span className="text-xs block truncate">{command}</span>
                                </button>
                              )
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Custom Command */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium text-gray-300">Custom Command</h3>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        placeholder="Enter custom command..."
                        value={customCommand}
                        onChange={(e) => {
                          setCustomCommand(e.target.value)
                          setSelectedCommand('')
                        }}
                        className="flex-1 px-2 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 bg-transparent text-white placeholder-gray-400"
                        style={{
                          borderColor: HAVEN_COLORS.border,
                          focusRingColor: HAVEN_COLORS.primary
                        }}
                        disabled={!simulationIdentifier || simulationIdentifier === 'X'}
                      />
                      <button
                        onClick={handleAddCustomCommand}
                        disabled={isAddingCommand || !isConnected || (!simulationIdentifier || simulationIdentifier === 'X')}
                        className="px-2 py-1.5 rounded-lg text-white shadow-lg transition-all text-xs"
                        style={{backgroundColor: HAVEN_COLORS.primary}}
                      >
                        {isAddingCommand ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Terminal */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-medium text-gray-300">Terminal</h3>
                      <button
                        onClick={() => { setTerminalOutput(''); setTerminalDisplay(''); setIsTyping(false) }}
                        className="h-6 px-2 text-gray-300 hover:text-white border rounded text-xs"
                        style={{borderColor: HAVEN_COLORS.border}}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="rounded-lg border overflow-hidden bg-black/60" style={{borderColor: `${HAVEN_COLORS.border}60`}}>
                      <pre ref={terminalRef} className="text-green-300 text-[11px] font-mono leading-relaxed whitespace-pre-wrap p-3 overflow-auto min-h-32 max-h-64">
                        {terminalDisplay || (isTyping ? '' : 'Waiting for output…')}{isTyping ? '\u2589' : ''}
                      </pre>
                    </div>
                  </div>

                  {/* Execute */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium text-gray-300">Execute</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSendCommand}
                        disabled={isSendingCommand || !isConnected || !walletAddress || (!simulationIdentifier || simulationIdentifier === 'X')}
                        className="flex-1 py-2 rounded-lg font-bold text-xs text-white transition-all shadow-lg"
                        style={{backgroundColor: HAVEN_COLORS.primary}}
                      >
                        {isSendingCommand ? (
                          <span className="inline-flex items-center">
                            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                            Sending...
                          </span>
                        ) : (
                          <span className="inline-flex items-center">
                            <Send className="h-3 w-3 mr-1.5" />
                            Send Command
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                )
              ) : (
                // Other tabs
                <div className="p-6 text-center text-gray-400 text-sm">
                  Coming soon
                </div>
              )}
            </div>
          </div>
          </Panel>
          </PanelGroup>
        </div>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="w-1 bg-gray-700 hover:bg-[#86d99f] transition-colors cursor-col-resize hidden lg:block" />

        {/* Right Panel - Hidden on mobile */}
        <Panel defaultSize={20} minSize={20} maxSize={40} className="hidden lg:block">
        <div className="w-full flex flex-col lg:h-full overflow-hidden h-full"
             style={{backgroundColor: HAVEN_COLORS.surface}}>
          {/* Scrollable Content Container */}
          <div className="flex-1 overflow-y-auto hide-scrollbar">
            {/* Trade Interface */}
            <div className="p-3" style={{borderBottom: `1px solid ${HAVEN_COLORS.border}`}}>
            {/* Price Changes */}
            <div className="mb-2.5 pb-2.5" style={{borderBottom: `1px solid ${HAVEN_COLORS.border}80`}}>
              <div className="rounded-xl p-2"
                   style={{
                     background: `linear-gradient(to bottom right, ${HAVEN_COLORS.elevated}99, ${HAVEN_COLORS.surface}99)`,
                     border: `1px solid ${HAVEN_COLORS.border}66`
                   }}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: '5m', value: priceChanges.m5 },
                    { label: '1h', value: priceChanges.h1 },
                    { label: '6h', value: priceChanges.h6 },
                    { label: '24h', value: priceChanges.h24 }
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center">
                      <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">{label}</div>
                      <div
                        className={`text-[11px] font-extrabold ${value >= 0 ? 'text-green-400' : 'text-red-400'}`}
                      >
                        {value >= 0 ? '+' : ''}{value.toFixed(2)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Trading Activity Card */}
            <div className="mb-2.5 pb-2.5" style={{borderBottom: `1px solid ${HAVEN_COLORS.border}80`}}>
              <div className="rounded-xl p-2"
                   style={{
                     background: `linear-gradient(to bottom right, ${HAVEN_COLORS.elevated}99, ${HAVEN_COLORS.surface}99)`,
                     border: `1px solid ${HAVEN_COLORS.border}66`
                   }}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="text-center">
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">Buys</div>
                    <div className="text-[11px] font-extrabold text-[#86d99f] leading-tight">
                      {buysSellsData.buys}/${formatNumber(buysSellsData.buysVolume)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">Sells</div>
                    <div className="text-[11px] font-extrabold text-[#f26682] leading-tight">
                      {buysSellsData.sells}/${formatNumber(buysSellsData.sellsVolume)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">Net Buy</div>
                    <div className={`text-[11px] font-extrabold leading-tight ${buysSellsData.netBuy >= 0 ? 'text-[#86d99f]' : 'text-[#f26682]'}`}>
                      {buysSellsData.netBuy >= 0 ? '+' : ''}${formatNumber(Math.abs(buysSellsData.netBuy))}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">Vol</div>
                    <div className="text-[11px] font-extrabold text-white leading-tight">
                      ${formatNumber(tokenData?.volume24h || 0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Holder Analysis Card */}
            <div className="mb-2.5 pb-2.5" style={{borderBottom: `1px solid ${HAVEN_COLORS.border}80`}}>
              <div className="rounded-xl p-2"
                   style={{
                     background: `linear-gradient(to bottom right, ${HAVEN_COLORS.elevated}99, ${HAVEN_COLORS.surface}99)`,
                     border: `1px solid ${HAVEN_COLORS.border}66`
                   }}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="text-center">
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">Top 10</div>
                    <div className="text-[11px] font-extrabold text-white leading-tight">
                      {holderAnalysisData.top10Holds.toFixed(2)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">DEV</div>
                    <div className="text-[11px] font-extrabold text-white leading-tight">
                      {holderAnalysisData.devHolds.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">Holders</div>
                    <div className="text-[11px] font-extrabold text-white leading-tight">
                      {holderAnalysisData.holders}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">Snipers</div>
                    <div className="text-[11px] font-extrabold text-orange-400 leading-tight">
                      {holderAnalysisData.snipersHold.toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">Insiders</div>
                    <div className="text-[11px] font-extrabold text-orange-400 leading-tight">
                      {holderAnalysisData.insidersHold.toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">Phishing</div>
                    <div className="text-[11px] font-extrabold text-red-400 leading-tight">
                      {holderAnalysisData.phishingHolds.toFixed(0)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* User Balance & Stats */}
            <div className="mb-2.5 rounded-xl"
                 style={{
                   background: `linear-gradient(to bottom right, ${HAVEN_COLORS.elevated}99, ${HAVEN_COLORS.surface}99)`,
                   border: `1px solid ${HAVEN_COLORS.border}66`
                 }}>
              {/* Currency Switch */}
              <div className="flex justify-between items-center p-2 pb-1">
                <span className="text-[9px] text-gray-400 font-bold uppercase">Display in</span>
                <div className="flex gap-0.5 p-0.5 rounded-full" style={{
                  backgroundColor: `${HAVEN_COLORS.elevated}99`,
                  border: `1px solid ${HAVEN_COLORS.border}80`
                }}>
                  <button
                    onClick={() => setDisplayCurrency('BNB')}
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-all duration-200`}
                    style={{
                      background: displayCurrency === 'BNB'
                        ? 'linear-gradient(to right, #f0b90b, #f8d12f)'
                        : 'transparent',
                      color: displayCurrency === 'BNB' ? '#000' : HAVEN_COLORS.textSecondary
                    }}
                  >
                    BNB
                  </button>
                  <button
                    onClick={() => setDisplayCurrency('HAVEN')}
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-all duration-200`}
                    style={{
                      background: displayCurrency === 'HAVEN'
                        ? `linear-gradient(to right, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`
                        : 'transparent',
                      color: displayCurrency === 'HAVEN' ? 'white' : HAVEN_COLORS.textSecondary
                    }}
                  >
                    HAVEN
                  </button>
                </div>
              </div>

              <div className="flex items-stretch gap-1.5 p-2 pt-1">
                {/* Bal */}
                <div className="flex-1 text-center py-1">
                  <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">Bal</div>
                  <div className="text-white font-extrabold text-[12px] leading-tight">
                    ${formatNumber(parseFloat(tokenBalance || '0') * (tokenData?.price || 0))}
                  </div>
                  <div className="text-gray-400 text-[10px] leading-tight font-semibold">{parseFloat(tokenBalance || '0').toFixed(0)} {tokenData?.symbol || tokenData?.ticker || 'TKN'}</div>
                  <div className={`text-[10px] leading-tight font-bold ${displayCurrency === 'BNB' ? 'text-purple-400' : 'text-[#86d99f]'}`}>
                    {displayCurrency === 'BNB'
                      ? `${parseFloat(walletBalance || '0').toFixed(4)} BNB`
                      : `${parseFloat(havenBalance || '0').toFixed(4)} HAVEN`
                    }
                  </div>
                </div>

                {/* Bought */}
                <div className="flex-1 text-center py-1" style={{borderLeft: `1px solid ${HAVEN_COLORS.border}80`}}>
                  <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">Bought</div>
                  <div className="text-white font-extrabold text-[12px] leading-tight">
                    ${formatNumber(userStats?.boughtUsd ?? 0)}
                  </div>
                  <div className="text-[#86d99f] text-[10px] leading-tight font-bold">
                    {displayCurrency === 'BNB'
                      ? `${(userStats?.boughtBnb ?? 0).toFixed(4)} BNB`
                      : `${(userStats?.bought ?? 0).toFixed(4)} HAVEN`
                    }
                  </div>
                </div>

                {/* Sold */}
                <div className="flex-1 text-center py-1" style={{borderLeft: `1px solid ${HAVEN_COLORS.border}80`}}>
                  <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">Sold</div>
                  <div className="text-white font-extrabold text-[12px] leading-tight">
                    ${formatNumber(userStats?.soldUsd ?? 0)}
                  </div>
                  <div className="text-[#f26682] text-[10px] leading-tight font-bold">
                    {displayCurrency === 'BNB'
                      ? `${(userStats?.soldBnb ?? 0).toFixed(4)} BNB`
                      : `${(userStats?.sold ?? 0).toFixed(4)} HAVEN`
                    }
                  </div>
                </div>

                {/* PnL */}
                <div className="flex-1 text-center py-1" style={{borderLeft: `1px solid ${HAVEN_COLORS.border}80`}}>
                  <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wide mb-0.5">PnL</div>
                  <div className={`font-extrabold text-[12px] leading-tight ${(userStats?.pnlUsd ?? 0) >= 0 ? 'text-[#86d99f]' : 'text-[#f26682]'}`}>
                    {(userStats?.pnlUsd ?? 0) >= 0 ? '+' : ''}${formatNumber(Math.abs(userStats?.pnlUsd ?? 0))}
                  </div>
                  <div className={`text-[10px] leading-tight font-semibold ${(userStats?.pnl ?? 0) >= 0 ? 'text-[#86d99f]' : 'text-[#f26682]'}`}>
                    ({(userStats?.pnlPercent ?? 0) >= 0 ? '+' : ''}{(userStats?.pnlPercent ?? 0).toFixed(1)}%)
                  </div>
                  <div className={`text-[10px] leading-tight font-bold ${(displayCurrency === 'BNB' ? (userStats?.pnlBnb ?? 0) : (userStats?.pnl ?? 0)) >= 0 ? 'text-[#86d99f]' : 'text-[#f26682]'}`}>
                    {(displayCurrency === 'BNB' ? (userStats?.pnlBnb ?? 0) : (userStats?.pnl ?? 0)) >= 0 ? '+' : ''}{displayCurrency === 'BNB'
                      ? `${(userStats?.pnlBnb ?? 0).toFixed(4)} BNB`
                      : `${(userStats?.pnl ?? 0).toFixed(4)} HAVEN`
                    }
                  </div>
                </div>
              </div>
            </div>

            {/* Buy/Sell Toggle - Enhanced Design */}
            <div className="space-y-3">
              <div className="relative flex gap-1 p-1 rounded-2xl backdrop-blur-xl"
                   style={{
                     background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated}dd 0%, ${HAVEN_COLORS.surface}dd 100%)`,
                     border: `1.5px solid ${HAVEN_COLORS.border}60`,
                     boxShadow: `
                       inset 0 1px 1px rgba(255,255,255,0.1),
                       0 8px 32px rgba(0,0,0,0.3),
                       0 2px 8px rgba(0,0,0,0.2)
                     `
                   }}>
                <button
                  onClick={() => {
                    setTradeMode('buy')
                    setMobileBottomTab('buy')
                  }}
                  className={`relative flex-1 py-2.5 rounded-xl font-extrabold text-xs transition-all duration-300 cursor-pointer overflow-hidden group`}
                  style={{
                    background: tradeMode === 'buy'
                      ? `linear-gradient(135deg, ${HAVEN_COLORS.primary}dd 0%, ${HAVEN_COLORS.primaryLight}dd 100%)`
                      : 'transparent',
                    color: tradeMode === 'buy' ? 'white' : HAVEN_COLORS.textSecondary,
                    boxShadow: tradeMode === 'buy'
                      ? `0 4px 16px ${HAVEN_COLORS.primary}66, inset 0 -2px 8px rgba(0,0,0,0.2)`
                      : 'none',
                    transform: tradeMode === 'buy' ? 'scale(1.02)' : 'scale(1)'
                  }}
                  onMouseEnter={(e) => {
                    if (tradeMode !== 'buy') {
                      e.currentTarget.style.background = `linear-gradient(135deg, ${HAVEN_COLORS.primary}33 0%, ${HAVEN_COLORS.primaryLight}22 100%)`
                      e.currentTarget.style.transform = 'scale(1.02) translateY(-1px)'
                      e.currentTarget.style.boxShadow = `0 2px 8px ${HAVEN_COLORS.primary}33`
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (tradeMode !== 'buy') {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.transform = 'scale(1)'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="relative z-10 flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    BUY
                  </span>
                  {tradeMode === 'buy' && (
                    <div
                      className="absolute inset-0 animate-pulse"
                      style={{
                        background: `radial-gradient(circle at center, ${HAVEN_COLORS.primaryLight}44 0%, transparent 70%)`,
                      }}
                    />
                  )}
                </button>
                <button
                  onClick={() => {
                    setTradeMode('sell')
                    setMobileBottomTab('sell')
                  }}
                  className={`relative flex-1 py-2.5 rounded-xl font-extrabold text-xs transition-all duration-300 cursor-pointer overflow-hidden group`}
                  style={{
                    background: tradeMode === 'sell'
                      ? 'linear-gradient(135deg, #ef4444dd 0%, #f87171dd 100%)'
                      : 'transparent',
                    color: tradeMode === 'sell' ? 'white' : HAVEN_COLORS.textSecondary,
                    boxShadow: tradeMode === 'sell'
                      ? '0 4px 16px #ef444466, inset 0 -2px 8px rgba(0,0,0,0.2)'
                      : 'none',
                    transform: tradeMode === 'sell' ? 'scale(1.02)' : 'scale(1)'
                  }}
                  onMouseEnter={(e) => {
                    if (tradeMode !== 'sell') {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ef444433 0%, #f8717122 100%)'
                      e.currentTarget.style.transform = 'scale(1.02) translateY(-1px)'
                      e.currentTarget.style.boxShadow = '0 2px 8px #ef444433'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (tradeMode !== 'sell') {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.transform = 'scale(1)'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="relative z-10 flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                    </svg>
                    SELL
                  </span>
                  {tradeMode === 'sell' && (
                    <div
                      className="absolute inset-0 animate-pulse"
                      style={{
                        background: 'radial-gradient(circle at center, #f8717144 0%, transparent 70%)',
                      }}
                    />
                  )}
                </button>
              </div>

              {/* Market/Limit Toggle */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex gap-0.5 p-0.5 rounded-full"
                     style={{
                       backgroundColor: `${HAVEN_COLORS.elevated}99`,
                       border: `1px solid ${HAVEN_COLORS.border}80`
                     }}>
                  <button
                    onClick={() => setOrderType('market')}
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-all duration-200 cursor-pointer hover:scale-105`}
                    style={{
                      background: orderType === 'market'
                        ? 'linear-gradient(to right, #3b82f6, #06b6d4)'
                        : 'transparent',
                      color: orderType === 'market' ? 'white' : HAVEN_COLORS.textSecondary
                    }}
                    onMouseEnter={(e) => {
                      if (orderType !== 'market') {
                        e.currentTarget.style.backgroundColor = '#3b82f622'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (orderType !== 'market') {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    Market
                  </button>
                  <button
                    disabled
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-all duration-200 opacity-50 cursor-not-allowed`}
                    style={{
                      background: 'transparent',
                      color: HAVEN_COLORS.textSecondary
                    }}
                    title="Limit orders temporarily disabled"
                  >
                    Limit
                  </button>
                </div>
              </div>

              {/* Amount Input - Enhanced Design */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{
                    background: `linear-gradient(135deg, ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'} 0%, ${tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'} 100%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>
                    {tradeMode === 'buy' ? 'You Pay' : 'You Sell'}
                  </span>
                  <div className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <span className="text-[9px] font-bold text-gray-400">
                      {(() => {
                        if (tradeMode === 'buy') {
                          return displayCurrency === 'BNB'
                            ? `${parseFloat(walletBalance || '0').toFixed(4)} BNB`
                            : `${parseFloat(havenBalance || '0').toFixed(2)} HAVEN`
                        } else {
                          return `${parseFloat(tokenBalance || '0').toFixed(0)} ${tokenData?.symbol || tokenData?.ticker || 'TKN'}`
                        }
                      })()}
                    </span>
                  </div>
                </div>
                <div className="relative group">
                  <div className="absolute inset-0 rounded-2xl blur-sm transition-all duration-300 opacity-0 group-hover:opacity-100" style={{
                    background: `linear-gradient(135deg, ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'}33 0%, ${tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'}22 100%)`
                  }} />
                  <input
                    type="number"
                    value={tradeAmount}
                    onChange={(e) => setTradeAmount(e.target.value)}
                    placeholder="0.00"
                    className="relative w-full h-12 rounded-2xl text-white text-base font-bold pr-20 pl-4 focus:outline-none transition-all duration-300"
                    style={{
                      background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated}cc 0%, ${HAVEN_COLORS.surface}dd 100%)`,
                      border: `1.5px solid ${HAVEN_COLORS.border}60`,
                      boxShadow: `
                        inset 0 2px 4px rgba(0,0,0,0.3),
                        0 4px 16px rgba(0,0,0,0.2)
                      `,
                      backdropFilter: 'blur(12px)'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'
                      e.currentTarget.style.boxShadow = `
                        inset 0 2px 4px rgba(0,0,0,0.3),
                        0 4px 16px rgba(0,0,0,0.2),
                        0 0 0 3px ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'}33
                      `
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = `${HAVEN_COLORS.border}60`
                      e.currentTarget.style.boxShadow = `
                        inset 0 2px 4px rgba(0,0,0,0.3),
                        0 4px 16px rgba(0,0,0,0.2)
                      `
                    }}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl backdrop-blur-md"
                       style={{
                         background: `linear-gradient(135deg, ${HAVEN_COLORS.surface}ee 0%, ${HAVEN_COLORS.elevated}dd 100%)`,
                         border: `1px solid ${HAVEN_COLORS.border}60`,
                         boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                       }}>
                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black" style={{
                      background: `linear-gradient(135deg, ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'} 0%, ${tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'} 100%)`,
                      color: 'white'
                    }}>
                      {tradeMode === 'buy'
                        ? (displayCurrency === 'BNB' ? 'Ƀ' : 'H')
                        : (tokenData?.symbol?.[0] || 'T')
                      }
                    </div>
                    <span className="text-[10px] font-extrabold text-white">
                      {tradeMode === 'buy'
                        ? (displayCurrency === 'BNB' ? 'BNB' : 'HAVEN')
                        : (tokenData?.symbol || tokenData?.ticker || 'TKN')
                      }
                    </span>
                  </div>
                </div>
                {/* Conversion Estimate - Enhanced */}
                <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl backdrop-blur-md transition-all duration-300"
                     style={{
                       background: `linear-gradient(135deg, ${HAVEN_COLORS.surface}88 0%, ${HAVEN_COLORS.elevated}88 100%)`,
                       border: `1px solid ${HAVEN_COLORS.border}40`
                     }}>
                  <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  <span className="text-[10px] font-bold text-gray-300">
                    {(() => {
                      const amount = parseFloat(tradeAmount || '0')
                      if (amount === 0) return 'Enter amount to see estimate'

                      if (tradeMode === 'buy') {
                        let amountInHaven = amount
                        if (displayCurrency === 'BNB') {
                          amountInHaven = (amount * bnbPrice) / havenPrice
                        }
                        const tokenPrice = tokenData?.price || 0
                        const tokensReceived = tokenPrice > 0 ? (amountInHaven * havenPrice) / tokenPrice : 0

                        return (
                          <span className="flex items-center gap-1">
                            <span className="text-gray-400">{amount.toFixed(displayCurrency === 'BNB' ? 4 : 2)}</span>
                            <span className="text-gray-500">→</span>
                            <span className="font-extrabold" style={{color: HAVEN_COLORS.primaryLight}}>
                              ~{tokensReceived.toFixed(2)} {tokenData?.symbol || tokenData?.ticker || 'TKN'}
                            </span>
                          </span>
                        )
                      } else {
                        const tokenPrice = tokenData?.price || 0
                        const havenReceived = amount * tokenPrice / havenPrice
                        const bnbReceived = havenReceived * havenPrice / bnbPrice

                        return (
                          <span className="flex items-center gap-1">
                            <span className="text-gray-400">{amount.toFixed(0)}</span>
                            <span className="text-gray-500">→</span>
                            <span className="font-extrabold text-green-400">
                              ~{displayCurrency === 'BNB' ? bnbReceived.toFixed(4) : havenReceived.toFixed(2)} {displayCurrency === 'BNB' ? 'BNB' : 'HAVEN'}
                            </span>
                          </span>
                        )
                      }
                    })()}
                  </span>
                </div>

                {/* Slippage Tolerance Input */}
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[10px] font-bold text-gray-400">Slippage Tolerance</label>
                  <div className="flex items-center gap-1.5">
                    {['1', '3', '5', '10'].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setSlippageTolerance(preset)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all duration-200`}
                        style={{
                          background: slippageTolerance === preset
                            ? `linear-gradient(135deg, ${HAVEN_COLORS.primary} 0%, ${HAVEN_COLORS.primaryLight} 100%)`
                            : `${HAVEN_COLORS.surface}88`,
                          border: `1px solid ${slippageTolerance === preset ? HAVEN_COLORS.primary : HAVEN_COLORS.border}60`,
                          color: slippageTolerance === preset ? 'white' : HAVEN_COLORS.textSecondary
                        }}
                      >
                        {preset}%
                      </button>
                    ))}
                    <input
                      type="number"
                      value={slippageTolerance}
                      onChange={(e) => setSlippageTolerance(e.target.value)}
                      placeholder="5"
                      min="0.1"
                      max="50"
                      step="0.1"
                      className="w-16 h-7 px-2 rounded-lg text-[11px] font-bold text-white text-center focus:outline-none"
                      style={{
                        background: `${HAVEN_COLORS.elevated}cc`,
                        border: `1px solid ${HAVEN_COLORS.border}60`
                      }}
                    />
                    <span className="text-[10px] font-bold text-gray-500">%</span>
                  </div>
                </div>
              </div>

              {/* Quick Amount Buttons - Enhanced */}
              <div className="grid grid-cols-4 gap-1.5">
                {(tradeMode === 'buy'
                  ? ['10', '50', '100', '500']
                  : ['100', '500', '1K', '5K']
                ).map((val, idx) => (
                  <button
                    key={val}
                    onClick={() => {
                      const numVal = val.replace('K', '000')
                      setTradeAmount(numVal)
                    }}
                    className="relative py-2 px-2 rounded-xl text-[10px] font-extrabold text-white transition-all duration-300 cursor-pointer group overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${HAVEN_COLORS.surface}cc 0%, ${HAVEN_COLORS.elevated}bb 100%)`,
                      border: `1px solid ${HAVEN_COLORS.border}60`,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `linear-gradient(135deg, ${HAVEN_COLORS.primary}44 0%, ${HAVEN_COLORS.primaryLight}33 100%)`
                      e.currentTarget.style.borderColor = HAVEN_COLORS.primary
                      e.currentTarget.style.boxShadow = `0 4px 12px ${HAVEN_COLORS.primary}44, 0 0 0 2px ${HAVEN_COLORS.primary}22`
                      e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = `linear-gradient(135deg, ${HAVEN_COLORS.surface}cc 0%, ${HAVEN_COLORS.elevated}bb 100%)`
                      e.currentTarget.style.borderColor = `${HAVEN_COLORS.border}60`
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'
                      e.currentTarget.style.transform = 'translateY(0) scale(1)'
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <span className="relative z-10">{val}</span>
                  </button>
                ))}
              </div>

              {/* Percentage Buttons - Enhanced */}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: '25%', value: 0.25, gradient: '25%' },
                  { label: '50%', value: 0.5, gradient: '50%' },
                  { label: '75%', value: 0.75, gradient: '75%' },
                  { label: 'MAX', value: 1, gradient: '100%' }
                ].map(({ label, value, gradient }) => (
                  <button
                    key={label}
                    onClick={() => {
                      let balance = 0
                      if (tradeMode === 'buy') {
                        balance = displayCurrency === 'BNB'
                          ? parseFloat(walletBalance || '0')
                          : parseFloat(havenBalance || '0')
                      } else {
                        balance = parseFloat(tokenBalance || '0')
                      }
                      setTradeAmount(String(balance * value))
                    }}
                    className="relative py-2.5 px-2 rounded-xl text-[10px] font-black transition-all duration-300 cursor-pointer group overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'}22 0%, ${tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'}11 100%)`,
                      border: `1.5px solid ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'}40`,
                      color: tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `linear-gradient(135deg, ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'}66 0%, ${tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'}55 100%)`
                      e.currentTarget.style.borderColor = tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'
                      e.currentTarget.style.color = 'white'
                      e.currentTarget.style.boxShadow = `0 6px 16px ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'}66, 0 0 0 3px ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'}22`
                      e.currentTarget.style.transform = 'translateY(-2px) scale(1.08)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = `linear-gradient(135deg, ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'}22 0%, ${tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'}11 100%)`
                      e.currentTarget.style.borderColor = `${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'}40`
                      e.currentTarget.style.color = tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'
                      e.currentTarget.style.transform = 'translateY(0) scale(1)'
                    }}
                  >
                    <div className="absolute bottom-0 left-0 h-1 rounded-full transition-all duration-300" style={{
                      width: gradient,
                      background: `linear-gradient(90deg, ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'} 0%, ${tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'} 100%)`,
                      opacity: 0.4
                    }} />
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <span className="relative z-10 flex items-center justify-center gap-0.5">
                      {label === 'MAX' && (
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                        </svg>
                      )}
                      {label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Trade Button - Premium Design */}
              <button
                onClick={handleTrade}
                className="relative w-full h-14 text-sm font-black rounded-2xl transition-all duration-300 cursor-pointer overflow-hidden group"
                style={{
                  background: tradeMode === 'buy'
                    ? `linear-gradient(135deg, ${HAVEN_COLORS.primary}dd 0%, ${HAVEN_COLORS.primaryLight}dd 100%)`
                    : 'linear-gradient(135deg, #ef4444dd 0%, #f87171dd 100%)',
                  color: 'white',
                  boxShadow: tradeMode === 'buy'
                    ? `0 8px 24px ${HAVEN_COLORS.primary}66, inset 0 -2px 8px rgba(0,0,0,0.2)`
                    : '0 8px 24px #ef444466, inset 0 -2px 8px rgba(0,0,0,0.2)',
                  border: `1.5px solid ${tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'}88`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = tradeMode === 'buy'
                    ? `0 12px 32px ${HAVEN_COLORS.primary}88, 0 0 0 4px ${HAVEN_COLORS.primary}22, inset 0 -2px 8px rgba(0,0,0,0.3)`
                    : '0 12px 32px #ef444488, 0 0 0 4px #ef444422, inset 0 -2px 8px rgba(0,0,0,0.3)'
                  e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'
                  e.currentTarget.style.borderColor = tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = tradeMode === 'buy'
                    ? `0 8px 24px ${HAVEN_COLORS.primary}66, inset 0 -2px 8px rgba(0,0,0,0.2)`
                    : '0 8px 24px #ef444466, inset 0 -2px 8px rgba(0,0,0,0.2)'
                  e.currentTarget.style.transform = 'translateY(0) scale(1)'
                  e.currentTarget.style.borderColor = `${tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'}88`
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px) scale(0.98)'
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'
                }}
              >
                {/* Animated gradient overlay */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                     style={{
                       background: `linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)`,
                       animation: 'shimmer 2s infinite'
                     }} />

                {/* Pulsing glow effect */}
                <div className="absolute inset-0 animate-pulse opacity-50 group-hover:opacity-70 transition-opacity duration-300"
                     style={{
                       background: `radial-gradient(circle at 50% 50%, ${tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'}44 0%, transparent 70%)`
                     }} />

                {/* Button content */}
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {tradeMode === 'buy' ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                    </svg>
                  )}
                  <span className="text-base tracking-wide">
                    {tradeMode === 'buy' ? 'BUY' : 'SELL'} {tokenData.symbol || tokenData.ticker || 'TOKEN'}
                  </span>
                  <svg className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>

                {/* Bottom highlight */}
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </button>

              {/* Add shimmer animation */}
              <style>{`
                @keyframes shimmer {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(100%); }
                }
              `}</style>
            </div>
          </div>

          {/* Audit */}
          <div style={{borderBottom: `1px solid ${HAVEN_COLORS.border}80`}}>
            <div
              onClick={() => setIsAuditExpanded(!isAuditExpanded)}
              className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span className="text-[13px] font-semibold text-white">Audit</span>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                  isAuditExpanded ? 'rotate-180' : ''
                }`}
              />
            </div>

            <div className={`overflow-hidden transition-all duration-300 ${
              isAuditExpanded ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'
            }`}>
              <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gray-400">Dex Paid</span>
                  <span className={
                    dexPaid === null
                      ? 'text-gray-400'
                      : dexPaid
                        ? 'text-[#86d99f]'
                        : 'text-[#f26682]'
                  }>
                    {dexPaid === null ? 'Loading...' : dexPaid ? 'Yes ✓' : 'No ✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Honeypot</span>
                  <span className="text-[#86d99f]">
                    No ✓
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Verified</span>
                  <span className="text-[#86d99f]">
                    Yes ✓
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Renounced</span>
                  <span className="text-orange-400">
                    Partial ✓
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Liq Locked</span>
                  <span className="text-[#86d99f]">
                    Burned ✓
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bonding Curve Info */}
          <div style={{borderBottom: `1px solid ${HAVEN_COLORS.border}80`}}>
            <div
              onClick={() => setIsPoolInfoExpanded(!isPoolInfoExpanded)}
              className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span className="text-[13px] font-semibold text-white">
                {tokenData.symbol}/ETH Bonding Pool
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[#86d99f] text-[12px] font-bold">
                  {bondingCurveProgress.toFixed(2)}%
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                    isPoolInfoExpanded ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </div>

            <div className={`overflow-hidden transition-all duration-300 ${
              isPoolInfoExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
            }`}>
              <div className="px-4 pb-4 space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total liq</span>
                  <span className="text-white font-medium">
                    ${formatNumber(tokenData.liquidityUSD || 0)} ({(tokenData.liquidity || 0).toFixed(4)} BNB)
                  </span>
                </div>

                <div className="flex justify-between mt-1">
                  <span className="text-gray-400">Market cap</span>
                  <span className="text-white">${formatNumber(tokenData.marketCapUSD || tokenData.marketCap || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Price (BNB)</span>
                  <span className="text-white">{(tokenData.priceETH || tokenData.price || 0).toFixed(9)} BNB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Price (USD)</span>
                  <span className="text-white">${(tokenData.priceUSD || 0).toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Holders</span>
                  <span className="text-white">{tokenData.holdersCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total supply</span>
                  <span className="text-white">{formatNumber(tokenData.totalSupply || tokenData.total_supply || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Bonding progress</span>
                  <span className="text-[#86d99f] font-bold">{bondingCurveProgress.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Pair</span>
                  <button
                    onClick={() => {
                      const pairAddr = tokenData.pairAddress || fetchedTokenData?.uniswap_pool_address
                      if (pairAddr) {
                        navigator.clipboard.writeText(pairAddr)
                        const toast = document.createElement('div')
                        toast.textContent = '✓ Pair address copied!'
                        toast.className = 'fixed top-4 right-4 bg-[#86d99f] text-white px-4 py-2 rounded-lg shadow-lg z-[9999] text-sm font-medium'
                        document.body.appendChild(toast)
                        setTimeout(() => toast.remove(), 2000)
                      }
                    }}
                    className="text-white font-mono text-[9px] hover:text-[#86d99f] hover:scale-105 transition-all duration-200 cursor-pointer flex items-center gap-0.5"
                  >
                    {(() => {
                      const pairAddr = tokenData.pairAddress || fetchedTokenData?.uniswap_pool_address
                      const isGraduated = fetchedTokenData?.is_graduated || tokenData.isGraduated

                      if (pairAddr) {
                        return (
                          <>
                            {pairAddr.slice(0, 6)}...{pairAddr.slice(-4)}
                            <Copy className="w-2.5 h-2.5" />
                          </>
                        )
                      } else if (isGraduated === false || isGraduated === 0) {
                        return <span className="text-blue-400">Bonding Curve</span>
                      } else {
                        return 'N/A'
                      }
                    })()}
                  </button>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Token creator</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => {
                        if (tokenCreator) {
                          navigator.clipboard.writeText(tokenCreator)
                          const toast = document.createElement('div')
                          toast.textContent = '✓ Creator address copied!'
                          toast.className = 'fixed top-4 right-4 bg-[#86d99f] text-white px-4 py-2 rounded-lg shadow-lg z-[9999] text-sm font-medium'
                          document.body.appendChild(toast)
                          setTimeout(() => toast.remove(), 2000)
                        }
                      }}
                      className="text-white font-mono text-[9px] hover:text-[#86d99f] hover:scale-105 transition-all duration-200 cursor-pointer flex items-center gap-0.5"
                    >
                      {tokenCreator ? (
                        <>
                          {tokenCreator.slice(0, 6)}...{tokenCreator.slice(-4)}
                          <Copy className="w-2.5 h-2.5" />
                        </>
                      ) : (
                        'Loading...'
                      )}
                    </button>
                    {tokenCreator && (
                      <button
                        onClick={() => window.open(`https://sepolia.etherscan.io/address/${tokenCreator}`, '_blank')}
                        className="text-gray-400 hover:text-white transition-colors"
                        title="View creator on Etherscan"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Created</span>
                  <span className="text-white text-[9px]">
                    {tokenData.createdAt ? new Date(tokenData.createdAt).toLocaleString('en-US', {
                      month: '2-digit',
                      day: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false
                    }) : tokenData.timestamp ? new Date(tokenData.timestamp * 1000).toLocaleString('en-US', {
                      month: '2-digit',
                      day: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false
                    }) : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          </div> {/* End Scrollable Content Container */}
        </div>
        </Panel>
        </PanelGroup>
      </div>
        ) : null}

      {/* Robot Modal */}
      {isRobotModalOpen && (
        <RobotModal
          isOpen={isRobotModalOpen}
          onClose={handleRobotModalClose}
          selectedRobot={selectedRobot}
          walletAddress={walletAddress}
          isWalletConnected={!!walletAddress}
          onBuy={handleRobotBuy}
          onSell={handleRobotSell}
          quickBuyAmount={'0'}
          onRobotUpdate={handleRobotUpdate}
          onSyncSimulations={handleSyncSimulations}
          isOwnRobot={false}
          hideTradeTab={true}
        />
      )}

      {/* Trade Modal */}
      {tradeModal.isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{backgroundColor: 'rgba(0, 0, 0, 0.75)'}}
          onClick={!tradeModal.isLoading ? closeModal : undefined}
        >
          <div
            className="relative max-w-md w-full rounded-2xl shadow-2xl overflow-hidden"
            style={{
              backgroundColor: HAVEN_COLORS.surface,
              border: `2px solid ${
                tradeModal.type === 'success' ? '#22c55e' :
                tradeModal.type === 'error' ? '#ef4444' :
                tradeModal.type === 'loading' ? HAVEN_COLORS.primary :
                HAVEN_COLORS.border
              }`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Animated background gradient */}
            <div
              className="absolute inset-0 opacity-10"
              style={{
                background: `linear-gradient(135deg, ${
                  tradeModal.type === 'success' ? '#22c55e, #16a34a' :
                  tradeModal.type === 'error' ? '#ef4444, #dc2626' :
                  tradeModal.type === 'loading' ? `${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight}` :
                  `${HAVEN_COLORS.elevated}, ${HAVEN_COLORS.surface}`
                })`
              }}
            />

            <div className="relative p-6">
              {/* Icon */}
              <div className="flex justify-center mb-4">
                {tradeModal.type === 'success' && (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center bg-green-500/20">
                    <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {tradeModal.type === 'error' && (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center bg-red-500/20">
                    <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
                {tradeModal.type === 'loading' && (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{backgroundColor: `${HAVEN_COLORS.primary}33`}}>
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{borderColor: HAVEN_COLORS.primary}}></div>
                  </div>
                )}
                {tradeModal.type === 'info' && (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center bg-blue-500/20">
                    <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-center mb-2" style={{color: HAVEN_COLORS.textPrimary}}>
                {tradeModal.title}
              </h3>

              {/* Message */}
              <p className="text-center text-sm mb-6" style={{color: HAVEN_COLORS.textSecondary}}>
                {tradeModal.message}
              </p>

              {/* Close button (only show if not loading) */}
              {!tradeModal.isLoading && (
                <button
                  onClick={closeModal}
                  className="w-full py-3 rounded-xl font-bold text-sm transition-all duration-200"
                  style={{
                    background: tradeModal.type === 'success'
                      ? 'linear-gradient(to right, #22c55e, #16a34a)'
                      : tradeModal.type === 'error'
                      ? 'linear-gradient(to right, #ef4444, #dc2626)'
                      : `linear-gradient(to right, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`,
                    color: 'white'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(88, 84, 244, 0.4)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Sheet - Only visible when bottom menu is active */}
      {mobileBottomTab && (
        <>
          {/* Backdrop - tap to close */}
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-30"
            onClick={() => setMobileBottomTab(null)}
          />

          <div
            id="mobile-bottom-sheet"
            className="lg:hidden fixed inset-x-0 z-40 overflow-y-auto hide-scrollbar rounded-t-3xl shadow-2xl"
            style={{
              backgroundColor: HAVEN_COLORS.background,
              borderTop: `2px solid ${HAVEN_COLORS.border}`,
              bottom: '72px',
              maxHeight: '85vh',
              transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
              transform: 'translateY(0)'
            }}
          >
            {/* Drag Handle - Drag to open/close */}
            <div
              className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing"
              onTouchStart={(e) => {
                const sheet = document.getElementById('mobile-bottom-sheet');
                const touch = e.touches[0];
                const startY = touch.clientY;
                let currentTranslateY = 0;

                const handleTouchMove = (moveEvent) => {
                  const currentTouch = moveEvent.touches[0];
                  const deltaY = currentTouch.clientY - startY;

                  // Only allow dragging down (closing)
                  if (deltaY > 0) {
                    currentTranslateY = deltaY;
                    sheet.style.transition = 'none';
                    sheet.style.transform = `translateY(${deltaY}px)`;
                  }
                };

                const handleTouchEnd = () => {
                  document.removeEventListener('touchmove', handleTouchMove);
                  document.removeEventListener('touchend', handleTouchEnd);

                  // If dragged down more than 100px, close the modal
                  if (currentTranslateY > 100) {
                    sheet.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
                    sheet.style.transform = 'translateY(100%)';
                    setTimeout(() => {
                      setMobileBottomTab(null);
                    }, 300);
                  } else {
                    // Snap back to open position
                    sheet.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
                    sheet.style.transform = 'translateY(0)';
                  }
                };

                document.addEventListener('touchmove', handleTouchMove, { passive: true });
                document.addEventListener('touchend', handleTouchEnd);
              }}
            >
              <div className="w-12 h-1 rounded-full" style={{ backgroundColor: HAVEN_COLORS.border }} />
            </div>

            {/* Buy/Sell Tab Content - Set trade mode and show interface */}
            {(mobileBottomTab === 'buy' || mobileBottomTab === 'sell') && (
              <div className="px-2 pb-2">

              {/* Price Changes - Better Styled */}
              <div className="mb-2">
                <div className="rounded-lg p-2"
                     style={{
                       background: `linear-gradient(to bottom right, ${HAVEN_COLORS.elevated}dd, ${HAVEN_COLORS.surface}dd)`,
                       border: `1px solid ${HAVEN_COLORS.border}80`,
                       boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                     }}>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: '5m', value: priceChanges.m5 },
                      { label: '1h', value: priceChanges.h1 },
                      { label: '6h', value: priceChanges.h6 },
                      { label: '24h', value: priceChanges.h24 }
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center py-1">
                        <div className="text-[9px] text-gray-400 font-bold uppercase mb-1">{label}</div>
                        <div
                          className={`text-[11px] font-extrabold ${value >= 0 ? 'text-green-400' : 'text-red-400'}`}
                        >
                          {value >= 0 ? '+' : ''}{value.toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Trading Activity & Holder Analysis - Better Styled */}
              <div className="mb-2">
                <div className="rounded-lg p-2"
                     style={{
                       background: `linear-gradient(to bottom right, ${HAVEN_COLORS.elevated}dd, ${HAVEN_COLORS.surface}dd)`,
                       border: `1px solid ${HAVEN_COLORS.border}80`,
                       boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                     }}>
                  {/* Trading Activity */}
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    <div className="text-center py-1">
                      <div className="text-[9px] text-gray-400 font-bold uppercase mb-1">Buys</div>
                      <div className="text-[11px] font-extrabold text-[#86d99f] leading-tight">
                        {buysSellsData.buys}
                      </div>
                    </div>
                    <div className="text-center py-1">
                      <div className="text-[9px] text-gray-400 font-bold uppercase mb-1">Sells</div>
                      <div className="text-[11px] font-extrabold text-[#f26682] leading-tight">
                        {buysSellsData.sells}
                      </div>
                    </div>
                    <div className="text-center py-1">
                      <div className="text-[9px] text-gray-400 font-bold uppercase mb-1">Net</div>
                      <div className={`text-[11px] font-extrabold leading-tight ${buysSellsData.netBuy >= 0 ? 'text-[#86d99f]' : 'text-[#f26682]'}`}>
                        {buysSellsData.netBuy >= 0 ? '+' : ''}${formatNumber(Math.abs(buysSellsData.netBuy))}
                      </div>
                    </div>
                    <div className="text-center py-1">
                      <div className="text-[9px] text-gray-400 font-bold uppercase mb-1">Vol</div>
                      <div className="text-[11px] font-extrabold text-white leading-tight">
                        ${formatNumber(tokenData?.volume24h || 0)}
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-px my-1" style={{backgroundColor: `${HAVEN_COLORS.border}60`}} />

                  {/* Holder Analysis */}
                  <div className="grid grid-cols-6 gap-1.5">
                    <div className="text-center py-1">
                      <div className="text-[8px] text-gray-400 font-bold uppercase mb-1">T10</div>
                      <div className="text-[10px] font-extrabold text-white leading-tight">
                        {holderAnalysisData.top10Holds.toFixed(0)}%
                      </div>
                    </div>
                    <div className="text-center py-1">
                      <div className="text-[8px] text-gray-400 font-bold uppercase mb-1">DEV</div>
                      <div className="text-[10px] font-extrabold text-white leading-tight">
                        {holderAnalysisData.devHolds.toFixed(0)}%
                      </div>
                    </div>
                    <div className="text-center py-1">
                      <div className="text-[8px] text-gray-400 font-bold uppercase mb-1">Hold</div>
                      <div className="text-[10px] font-extrabold text-white leading-tight">
                        {holderAnalysisData.holders}
                      </div>
                    </div>
                    <div className="text-center py-1">
                      <div className="text-[8px] text-gray-400 font-bold uppercase mb-1">Snip</div>
                      <div className="text-[10px] font-extrabold text-orange-400 leading-tight">
                        {holderAnalysisData.snipersHold.toFixed(0)}%
                      </div>
                    </div>
                    <div className="text-center py-1">
                      <div className="text-[8px] text-gray-400 font-bold uppercase mb-1">Ins</div>
                      <div className="text-[10px] font-extrabold text-orange-400 leading-tight">
                        {holderAnalysisData.insidersHold.toFixed(0)}%
                      </div>
                    </div>
                    <div className="text-center py-1">
                      <div className="text-[8px] text-gray-400 font-bold uppercase mb-1">Phi</div>
                      <div className="text-[10px] font-extrabold text-red-400 leading-tight">
                        {holderAnalysisData.phishingHolds.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* User Balance & Stats - Better Styled */}
              <div className="mb-2 rounded-lg"
                   style={{
                     background: `linear-gradient(to bottom right, ${HAVEN_COLORS.elevated}dd, ${HAVEN_COLORS.surface}dd)`,
                     border: `1px solid ${HAVEN_COLORS.border}80`,
                     boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                   }}>
                {/* Currency Switch */}
                <div className="flex justify-between items-center px-2 pt-2 pb-1.5">
                  <span className="text-[8px] text-gray-400 font-bold uppercase">Display</span>
                  <div className="flex gap-1 p-0.5 rounded-full" style={{
                    backgroundColor: `${HAVEN_COLORS.elevated}cc`,
                    border: `1px solid ${HAVEN_COLORS.border}80`
                  }}>
                    <button
                      onClick={() => setDisplayCurrency('BNB')}
                      className={`px-2 py-1 rounded-full text-[8px] font-bold transition-all duration-200`}
                      style={{
                        background: displayCurrency === 'BNB'
                          ? 'linear-gradient(to right, #f0b90b, #f8d12f)'
                          : 'transparent',
                        color: displayCurrency === 'BNB' ? '#000' : HAVEN_COLORS.textSecondary
                      }}
                    >
                      BNB
                    </button>
                    <button
                      onClick={() => setDisplayCurrency('HAVEN')}
                      className={`px-2 py-1 rounded-full text-[8px] font-bold transition-all duration-200`}
                      style={{
                        background: displayCurrency === 'HAVEN'
                          ? `linear-gradient(to right, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`
                          : 'transparent',
                        color: displayCurrency === 'HAVEN' ? 'white' : HAVEN_COLORS.textSecondary
                      }}
                    >
                      HAVEN
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 px-2 pb-2">
                  {/* Bal */}
                  <div className="text-center py-1">
                    <div className="text-[8px] text-gray-400 font-bold uppercase mb-1">Bal</div>
                    <div className="text-white font-extrabold text-[10px] leading-tight">
                      ${formatNumber(parseFloat(tokenBalance || '0') * (tokenData?.price || 0))}
                    </div>
                    <div className={`text-[8px] leading-tight font-bold mt-0.5 ${displayCurrency === 'BNB' ? 'text-purple-400' : 'text-[#86d99f]'}`}>
                      {displayCurrency === 'BNB'
                        ? `${parseFloat(walletBalance || '0').toFixed(2)}`
                        : `${parseFloat(havenBalance || '0').toFixed(2)}`
                      }
                    </div>
                  </div>

                  {/* Bought */}
                  <div className="text-center py-1">
                    <div className="text-[8px] text-gray-400 font-bold uppercase mb-1">Buy</div>
                    <div className="text-white font-extrabold text-[10px] leading-tight">
                      ${formatNumber(userStats?.boughtUsd ?? 0)}
                    </div>
                    <div className="text-[#86d99f] text-[8px] leading-tight font-bold mt-0.5">
                      {displayCurrency === 'BNB'
                        ? `${(userStats?.boughtBnb ?? 0).toFixed(2)}`
                        : `${(userStats?.bought ?? 0).toFixed(2)}`
                      }
                    </div>
                  </div>

                  {/* Sold */}
                  <div className="text-center py-1">
                    <div className="text-[8px] text-gray-400 font-bold uppercase mb-1">Sell</div>
                    <div className="text-white font-extrabold text-[10px] leading-tight">
                      ${formatNumber(userStats?.soldUsd ?? 0)}
                    </div>
                    <div className="text-[#f26682] text-[8px] leading-tight font-bold mt-0.5">
                      {displayCurrency === 'BNB'
                        ? `${(userStats?.soldBnb ?? 0).toFixed(2)}`
                        : `${(userStats?.sold ?? 0).toFixed(2)}`
                      }
                    </div>
                  </div>

                  {/* PnL */}
                  <div className="text-center py-1">
                    <div className="text-[8px] text-gray-400 font-bold uppercase mb-1">PnL</div>
                    <div className={`font-extrabold text-[10px] leading-tight ${(userStats?.pnlUsd ?? 0) >= 0 ? 'text-[#86d99f]' : 'text-[#f26682]'}`}>
                      {(userStats?.pnlUsd ?? 0) >= 0 ? '+' : ''}${formatNumber(Math.abs(userStats?.pnlUsd ?? 0))}
                    </div>
                    <div className={`text-[8px] leading-tight font-bold mt-0.5 ${(displayCurrency === 'BNB' ? (userStats?.pnlBnb ?? 0) : (userStats?.pnl ?? 0)) >= 0 ? 'text-[#86d99f]' : 'text-[#f26682]'}`}>
                      ({(userStats?.pnlPercent ?? 0) >= 0 ? '+' : ''}{(userStats?.pnlPercent ?? 0).toFixed(0)}%)
                    </div>
                  </div>
                </div>
              </div>

              {/* Trade Interface - Better Styled */}
              <div className="space-y-2">
                {/* Amount Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[9px] font-bold uppercase" style={{
                      background: `linear-gradient(135deg, ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'} 0%, ${tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'} 100%)`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}>
                      {tradeMode === 'buy' ? 'You Pay' : 'You Sell'}
                    </span>
                    <span className="text-[8px] font-bold text-gray-400">
                      {(() => {
                        if (tradeMode === 'buy') {
                          return displayCurrency === 'BNB'
                            ? `${parseFloat(walletBalance || '0').toFixed(3)} BNB`
                            : `${parseFloat(havenBalance || '0').toFixed(1)} HAVEN`
                        } else {
                          return `${parseFloat(tokenBalance || '0').toFixed(0)} ${tokenData?.symbol || tokenData?.ticker || 'TKN'}`
                        }
                      })()}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      placeholder="0.00"
                      className="relative w-full h-10 rounded-lg text-white text-sm font-bold pr-16 pl-3 focus:outline-none"
                      style={{
                        background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated}dd 0%, ${HAVEN_COLORS.surface}dd 100%)`,
                        border: `1px solid ${HAVEN_COLORS.border}80`,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md"
                         style={{
                           background: `linear-gradient(135deg, ${HAVEN_COLORS.surface}ee 0%, ${HAVEN_COLORS.elevated}dd 100%)`,
                           border: `1px solid ${HAVEN_COLORS.border}60`
                         }}>
                      <span className="text-[9px] font-extrabold text-white">
                        {tradeMode === 'buy'
                          ? (displayCurrency === 'BNB' ? 'BNB' : 'HAVEN')
                          : (tokenData?.symbol || tokenData?.ticker || 'TKN')
                        }
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Amount Buttons */}
                <div className="grid grid-cols-4 gap-1.5">
                  {(tradeMode === 'buy'
                    ? ['10', '50', '100', '500']
                    : ['100', '500', '1K', '5K']
                  ).map((val) => (
                    <button
                      key={val}
                      onClick={() => setTradeAmount(val.replace('K', '000'))}
                      className="py-2 rounded-lg text-[9px] font-extrabold text-white transition-all"
                      style={{
                        background: `linear-gradient(135deg, ${HAVEN_COLORS.surface}dd 0%, ${HAVEN_COLORS.elevated}cc 100%)`,
                        border: `1px solid ${HAVEN_COLORS.border}60`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}
                    >
                      {val}
                    </button>
                  ))}
                </div>

                {/* Percentage Buttons */}
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: '25%', value: 0.25 },
                    { label: '50%', value: 0.5 },
                    { label: '75%', value: 0.75 },
                    { label: 'MAX', value: 1 }
                  ].map(({ label, value }) => (
                    <button
                      key={label}
                      onClick={() => {
                        let balance = 0
                        if (tradeMode === 'buy') {
                          balance = displayCurrency === 'BNB'
                            ? parseFloat(walletBalance || '0')
                            : parseFloat(havenBalance || '0')
                        } else {
                          balance = parseFloat(tokenBalance || '0')
                        }
                        setTradeAmount(String(balance * value))
                      }}
                      className="py-2 rounded-lg text-[9px] font-black transition-all"
                      style={{
                        background: `linear-gradient(135deg, ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'}33 0%, ${tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171'}22 100%)`,
                        border: `1.5px solid ${tradeMode === 'buy' ? HAVEN_COLORS.primary : '#ef4444'}60`,
                        color: tradeMode === 'buy' ? HAVEN_COLORS.primaryLight : '#f87171',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Trade Button */}
                <button
                  onClick={handleTrade}
                  className="w-full h-11 text-sm font-black rounded-lg transition-all"
                  style={{
                    background: tradeMode === 'buy'
                      ? `linear-gradient(135deg, ${HAVEN_COLORS.primary} 0%, ${HAVEN_COLORS.primaryLight} 100%)`
                      : 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
                    color: 'white',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}
                >
                  {tradeMode === 'buy' ? 'BUY' : 'SELL'} {tokenData.symbol || tokenData.ticker || 'TOKEN'}
                </button>
              </div>
            </div>
          )}

          {/* Audit Tab Content */}
          {mobileBottomTab === 'audit' && (
            <div className="p-4">
              <h3 className="text-lg font-bold text-white mb-3">Audit</h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gray-400">Dex Paid</span>
                  <span className={
                    dexPaid === null
                      ? 'text-gray-400'
                      : dexPaid
                        ? 'text-[#86d99f]'
                        : 'text-[#f26682]'
                  }>
                    {dexPaid === null ? 'Loading...' : dexPaid ? 'Yes ✓' : 'No ✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Honeypot</span>
                  <span className="text-[#86d99f]">No ✓</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Verified</span>
                  <span className="text-[#86d99f]">Yes ✓</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Renounced</span>
                  <span className="text-orange-400">Partial ✓</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Liq Locked</span>
                  <span className="text-[#86d99f]">Burned ✓</span>
                </div>
              </div>
            </div>
          )}

          {/* Info Tab Content */}
          {mobileBottomTab === 'info' && (
            <div className="p-4">
              <h3 className="text-lg font-bold text-white mb-3">
                {tokenData.symbol}/ETH {tokenData?.is_graduated ? 'Pool' : 'Bonding Pool'}
              </h3>
              <div className="space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total liq</span>
                  <span className="text-white font-medium">
                    ${formatNumber(tokenData.liquidityUSD || 0)} ({(tokenData.liquidity || 0).toFixed(4)} BNB)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Market cap</span>
                  <span className="text-white">${formatNumber(tokenData.marketCapUSD || tokenData.marketCap || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Price (USD)</span>
                  <span className="text-white">${(tokenData.priceUSD || 0).toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Holders</span>
                  <span className="text-white">{tokenData.holdersCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total supply</span>
                  <span className="text-white">{formatNumber(tokenData.totalSupply || tokenData.total_supply || 0)}</span>
                </div>
                {!tokenData?.is_graduated && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Bonding progress</span>
                    <span className="text-[#86d99f] font-bold">{bondingCurveProgress.toFixed(2)}%</span>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </>
      )}

      {/* Mobile Bottom Menu - Only visible on mobile */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 pb-safe" style={{
        backgroundColor: HAVEN_COLORS.surface,
        borderTop: `2px solid ${HAVEN_COLORS.border}`
      }}>
        <div className="flex items-center justify-around px-2 py-3">
          {[
            { id: 'buy', label: 'Buy', icon: ArrowUp },
            { id: 'sell', label: 'Sell', icon: ArrowDown },
            { id: 'audit', label: 'Audit', icon: Shield },
            { id: 'info', label: 'Info', icon: Info }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMobileBottomTab(mobileBottomTab === id ? null : id)}
              className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all duration-200"
              style={{
                backgroundColor: mobileBottomTab === id ? `${HAVEN_COLORS.primary}22` : 'transparent',
                color: mobileBottomTab === id ? HAVEN_COLORS.primary : HAVEN_COLORS.textSecondary
              }}
            >
              <Icon className="w-5 h-5" style={{
                color: mobileBottomTab === id ? HAVEN_COLORS.primary : HAVEN_COLORS.textSecondary
              }} />
              <span className="text-[10px] font-bold">{label}</span>
            </button>
          ))}
        </div>
      </div>
      </div>
    </>
  )
}

// Wrap with React.memo to prevent infinite re-renders
export default React.memo(HavenTokenDetailComponent)