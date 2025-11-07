import React, { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import {
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Plus,
  Zap,
  TrendingUp,
  TrendingDown,
  Activity,
  Settings,
  Send,
  Loader2,
  ChevronDown,
  Plus as PlusIcon,
  Minus as MinusIcon,
  Crosshair,
  Globe,
  Twitter,
  Copy
} from "lucide-react"
import { useToast } from "./Toast"
import { useTheme } from "../context/ThemeContext"
import { RobotApi } from "../utils/api"
import { safeImageUrl } from "../lib/utils"
import { getSimulation, getSimulationId, updateSimulation } from "../utils/simulationCache"
import { readContract, getBalance } from '@wagmi/core'
import { config as wagmiConfig } from '../wagmi'
import TokenAbi from '../contracts/abis/FullBondingCurveERC20XToken.json'
import { formatEther, formatUnits, parseUnits } from 'viem'
import { CONTRACTS } from '../utils/contracts'
import { useRobotStats } from '../context/RobotStatsContext'
import { createChart, AreaSeries } from 'lightweight-charts'

const DEFAULT_COMMANDS = [
  "Move Right One Step",
  "Move Left One Step",
  "Move Up One Step",
  "Move Down One Step",
]

const COMMAND_ICONS = {
  "Move Right One Step": ArrowRight,
  "Move Left One Step": ArrowLeft,
  "Move Up One Step": ArrowUp,
  "Move Down One Step": ArrowDown,
}

const toTitle = (value) => {
  if (!value) return "Idle"
  const str = String(value)
  return str.charAt(0).toUpperCase() + str.slice(1)
}

const isActiveStatus = (status) => {
  const normalized = String(status || '').toLowerCase()
  return ["running", "active", "live", "success"].includes(normalized)
}

const toBigIntSafe = (value) => {
  if (typeof value === 'bigint') return value
  try { return BigInt(value || 0) } catch { return 0n }
}

const formatUsdValue = (value) => {
  try {
    const amount = Number(formatUnits(value || 0n, 18))
    if (!Number.isFinite(amount)) return '$0.00'
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(2)}K`
    if (amount >= 1) return `$${amount.toFixed(2)}`
    if (amount === 0) return '$0.00'
    if (amount >= 0.01) return `$${amount.toFixed(2)}`
    return `$${amount.toFixed(4)}`
  } catch {
    return '$0.00'
  }
}

const formatTokenAmount = (value, decimals) => {
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

const formatEthAmount = (value) => {
  try {
    const amount = Number(formatEther(value || 0n))
    if (!Number.isFinite(amount)) return '0'
    if (amount >= 1) return amount.toFixed(4)
    if (amount === 0) return '0'
    return amount.toPrecision(4)
  } catch {
    return '0'
  }

  const formatXTokenCompact = (raw, dec) => {
    try {
      const n = Number(formatUnits(raw || 0n, dec || 18))
      if (!Number.isFinite(n)) return '0.00'
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
      if (n >= 1_000) return `${(n / 1_000).toFixed(2)}k`
      return n.toFixed(2)
    } catch { return '0.00' }
  }
}

function RobotModalComponent({
  selectedRobot,
  onClose,
  isOpen,
  walletAddress = '',
  isWalletConnected = false,
  onBuy,
  onSell,
  quickBuyAmount,
  onRobotUpdate,
  onSyncSimulations,
  isOwnRobot = false, // True if viewing from My Robots page
  hideTradeTab = false, // Hide the trade tab when opened from control button
}) {
  const { addToast } = useToast()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const { havenUsd, tokenStatsByAddress, setTokenStatsFor } = useRobotStats()

  // DEBUG: Track renders and prop changes - EVERY RENDER
  const renderCount = useRef(0)
  const prevProps = useRef({})
  renderCount.current += 1

  // Log every 10 renders
  if (renderCount.current % 10 === 0) {
    console.log(`[RobotModal] Render #${renderCount.current}`)
  }

  // Check what props changed on EVERY render
  const changed = []
  if (prevProps.current.selectedRobot !== selectedRobot) {
    changed.push('selectedRobot')
    console.log('[RobotModal] selectedRobot changed:', prevProps.current.selectedRobot, '->', selectedRobot)
  }
  if (prevProps.current.isOpen !== isOpen) changed.push('isOpen')
  if (prevProps.current.quickBuyAmount !== quickBuyAmount) changed.push('quickBuyAmount')
  if (prevProps.current.onClose !== onClose) changed.push('onClose')
  if (prevProps.current.onBuy !== onBuy) changed.push('onBuy')
  if (prevProps.current.onSell !== onSell) changed.push('onSell')
  if (prevProps.current.onRobotUpdate !== onRobotUpdate) changed.push('onRobotUpdate')
  if (prevProps.current.onSyncSimulations !== onSyncSimulations) changed.push('onSyncSimulations')
  if (prevProps.current.walletAddress !== walletAddress) changed.push('walletAddress')
  if (prevProps.current.isWalletConnected !== isWalletConnected) changed.push('isWalletConnected')

  if (changed.length > 0) {
    console.log('[RobotModal] Props changed:', changed.join(', '))
  }

  prevProps.current = { selectedRobot, isOpen, quickBuyAmount, onClose, onBuy, onSell, onRobotUpdate, onSyncSimulations, walletAddress, isWalletConnected }

  // Helper to check if a social link is valid
  const hasValidLink = (link) => {
    return link && typeof link === 'string' && link.trim() !== ''
  }

  const [activeTab, setActiveTab] = useState(hideTradeTab ? 'control' : 'trade')
  const [commands, setCommands] = useState(DEFAULT_COMMANDS)

  // Use ref + state for selectedCommand to persist across re-renders
  const selectedCommandRef = useRef('')
  const [, forceUpdate] = useState(0)
  const selectedCommand = selectedCommandRef.current
  const setSelectedCommand = (cmd) => {
    console.log('[setSelectedCommand] Setting to:', cmd)
    selectedCommandRef.current = cmd
    forceUpdate(prev => prev + 1) // Force a re-render with a new value
  }

  // DEBUG: Wrap all state setters with logging
  const [customCommand, setCustomCommandRaw] = useState('')
  const setCustomCommand = (val) => { console.log('[STATE] setCustomCommand'); setCustomCommandRaw(val) }

  const [statusInfo, setStatusInfoRaw] = useState(null)
  const setStatusInfo = (val) => { console.log('[STATE] setStatusInfo'); setStatusInfoRaw(val) }

  const [tradeAmount, setTradeAmountRaw] = useState('')
  const setTradeAmount = (val) => { console.log('[STATE] setTradeAmount'); setTradeAmountRaw(val) }

  const [isAddingCommand, setIsAddingCommandRaw] = useState(false)
  const setIsAddingCommand = (val) => { console.log('[STATE] setIsAddingCommand'); setIsAddingCommandRaw(val) }

  const [isSendingCommand, setIsSendingCommandRaw] = useState(false)
  const setIsSendingCommand = (val) => { console.log('[STATE] setIsSendingCommand'); setIsSendingCommandRaw(val) }

  const [isBuying, setIsBuyingRaw] = useState(false)
  const setIsBuying = (val) => { console.log('[STATE] setIsBuying'); setIsBuyingRaw(val) }

  const [isSelling, setIsSellingRaw] = useState(false)
  const setIsSelling = (val) => { console.log('[STATE] setIsSelling'); setIsSellingRaw(val) }

  const [isStartingSimulation, setIsStartingSimulationRaw] = useState(false)
  const setIsStartingSimulation = (val) => { console.log('[STATE] setIsStartingSimulation'); setIsStartingSimulationRaw(val) }

  const [isClaimingFees, setIsClaimingFeesRaw] = useState(false)
  const setIsClaimingFees = (val) => { console.log('[STATE] setIsClaimingFees'); setIsClaimingFeesRaw(val) }

  const [showCustomCommands, setShowCustomCommandsRaw] = useState(false)
  const setShowCustomCommands = (val) => { console.log('[STATE] setShowCustomCommands'); setShowCustomCommandsRaw(val) }

  const [tokenBalance, setTokenBalanceRaw] = useState(0n)
  const setTokenBalance = (val) => { console.log('[STATE] setTokenBalance'); setTokenBalanceRaw(val) }

  const [tokenDecimals, setTokenDecimalsRaw] = useState(18)
  const setTokenDecimals = (val) => { console.log('[STATE] setTokenDecimals'); setTokenDecimalsRaw(val) }

  const [walletEthBalance, setWalletEthBalanceRaw] = useState(0n)
  const setWalletEthBalance = (val) => { console.log('[STATE] setWalletEthBalance'); setWalletEthBalanceRaw(val) }

  const [xTokenBalRaw, setXTokenBalRawRaw] = useState(0n)
  const setXTokenBalRaw = (val) => { console.log('[STATE] setXTokenBalRaw'); setXTokenBalRawRaw(val) }

  const [xTokenDecimals, setXTokenDecimalsRaw] = useState(18)
  const setXTokenDecimals = (val) => { console.log('[STATE] setXTokenDecimals'); setXTokenDecimalsRaw(val) }

  const [xTokenAllowanceRaw, setXTokenAllowanceRawRaw] = useState(0n)
  const setXTokenAllowanceRaw = (val) => { console.log('[STATE] setXTokenAllowanceRaw'); setXTokenAllowanceRawRaw(val) }

  const [allowance, setAllowanceRaw] = useState(0n)
  const setAllowance = (val) => { console.log('[STATE] setAllowance'); setAllowanceRaw(val) }

  const [tradeSide, setTradeSideRaw] = useState('buy')
  const setTradeSide = (val) => { console.log('[STATE] setTradeSide'); setTradeSideRaw(val) }

  const [buyPreview, setBuyPreviewRaw] = useState({ tokensOut: 0n, ethRequired: 0n, usdAmount: 0n })
  const setBuyPreview = (val) => { console.log('[STATE] setBuyPreview'); setBuyPreviewRaw(val) }

  const [sellPreview, setSellPreviewRaw] = useState({ usdOut: 0n, ethOut: 0n, tokenAmount: 0n })
  const setSellPreview = (val) => { console.log('[STATE] setSellPreview'); setSellPreviewRaw(val) }

  const [bondingProgress, setBondingProgressRaw] = useState({ percent: 0, isGraduated: false })
  const setBondingProgress = (val) => { console.log('[STATE] setBondingProgress'); setBondingProgressRaw(val) }

  const [terminalOutput, setTerminalOutputRaw] = useState('')
  const setTerminalOutput = (val) => { console.log('[STATE] setTerminalOutput'); setTerminalOutputRaw(val) }

  const [terminalDisplay, setTerminalDisplayRaw] = useState('')
  const setTerminalDisplay = (val) => { console.log('[STATE] setTerminalDisplay'); setTerminalDisplayRaw(val) }

  const [isTyping, setIsTypingRaw] = useState(false)
  const setIsTyping = (val) => { console.log('[STATE] setIsTyping'); setIsTypingRaw(val) }
  const terminalRef = useRef(null)
  const mapOuterRef = useRef(null)
  const mapInnerRef = useRef(null)
  const [zoom, setZoomRaw] = useState(1)
  const setZoom = (val) => { console.log('[STATE] setZoom'); setZoomRaw(val) }

  const tvChartContainerRef = useRef(null)
  const tvChartRef = useRef(null)
  const tvSeriesRef = useRef(null)
  const tvLastDataRef = useRef([])

  const [tvTimeframe, setTvTimeframeRaw] = useState('15m')
  const setTvTimeframe = (val) => { console.log('[STATE] setTvTimeframe'); setTvTimeframeRaw(val) }

  const [tradeHistory, setTradeHistoryRaw] = useState([])
  const setTradeHistory = (val) => { console.log('[STATE] setTradeHistory'); setTradeHistoryRaw(val) }

  const [tradePage, setTradePageRaw] = useState(1)
  const setTradePage = (val) => { console.log('[STATE] setTradePage'); setTradePageRaw(val) }
  const TRADES_PER_PAGE = 5
  const ROBOT_API_BASE = '/api'

  const deviceNode = selectedRobot?.device_node || selectedRobot?.id

  const [uniswapPair, setUniswapPairRaw] = useState('')
  const setUniswapPair = (val) => { console.log('[STATE] setUniswapPair'); setUniswapPairRaw(val) }

  const simulationIdFromProps = useMemo(() => {
    if (!selectedRobot) return null
    return (
      selectedRobot.activeSimulationId ||
      selectedRobot.ownedSimulation?.simulation_id ||
      (walletAddress ? getSimulationId(walletAddress, deviceNode) : null)
    )
  }, [selectedRobot, walletAddress, deviceNode])

  // Compute approval need deterministically before any early return to preserve hook order
  const needsApproval = useMemo(() => {
    if (tradeSide !== 'sell') return false
    try {
      const amt = parseUnits(String(tradeAmount || '0'), tokenDecimals)
      return amt > allowance
    } catch {
      return false
    }
  }, [tradeSide, tradeAmount, tokenDecimals, allowance])

  useEffect(() => {
    if (!isOpen || !selectedRobot) return

    // No reestablecer la pestaña activa para evitar efecto de "recarga" del modal
    // Don't reset selectedCommand if modal is just re-rendering
    // setSelectedCommand('')
    // Don't clear customCommand - preserve user input
    const initialAmount = typeof quickBuyAmount === 'number' && quickBuyAmount > 0
      ? String(quickBuyAmount)
      : ''
    setTradeAmount(initialAmount)

    const cachedSimulation = walletAddress ? getSimulation(walletAddress, deviceNode) : null
    const fallbackSimulation =
      selectedRobot.ownedSimulation ||
      cachedSimulation ||
      selectedRobot.simulations?.find((sim) => sim.simulation_id === selectedRobot.activeSimulationId) ||
      selectedRobot.simulations?.[0] ||
      null

    // Clear old statusInfo to avoid mixing data from different robots
    const newStatusInfo = fallbackSimulation ? { device_node: deviceNode, ...fallbackSimulation } : null
    setStatusInfo(newStatusInfo)

    // Auto-start polling if there's a valid simulation_id
    if (newStatusInfo?.simulation_id) {
      console.log('[RobotModal] Auto-starting status polling for simulation:', newStatusInfo.simulation_id, 'state:', newStatusInfo?.state)
      startStatusPolling(newStatusInfo.simulation_id)
    }
  }, [isOpen, deviceNode, quickBuyAmount, selectedRobot?.address, selectedRobot?.bonding_contract])

  // Load user balances (token + ETH) for trading UX
  useEffect(() => {
    let cancelled = false
    const loadBalances = async () => {
      try {
        const addr = walletAddress
        const tokenAddr = selectedRobot?.contractAddress
        if (addr) {
          const bal = await getBalance(wagmiConfig, { address: addr })
          if (!cancelled) setWalletEthBalance(bal?.value || 0n)
          // Load XTOKEN balance/decimals
          try {
            const erc20Abi = [
              { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
              { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
              { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
            ]
            const results = await Promise.resolve().then(() =>
              import('@wagmi/core').then(({ readContracts }) => readContracts(wagmiConfig, {
                contracts: [
                  { abi: erc20Abi, address: CONTRACTS.xtoken.address, functionName: 'decimals' },
                  { abi: erc20Abi, address: CONTRACTS.xtoken.address, functionName: 'balanceOf', args: [addr] },
                  ...(tokenAddr ? [{ abi: erc20Abi, address: CONTRACTS.xtoken.address, functionName: 'allowance', args: [addr, tokenAddr] }] : []),
                ],
              }))
            ).catch(() => null)
            const dec = Number(results?.[0]?.result ?? 18)
            const balX = BigInt(results?.[1]?.result ?? 0n)
            const allowX = BigInt(results?.[2]?.result ?? 0n)
            if (!cancelled) {
              setXTokenDecimals(Number.isFinite(dec) ? dec : 18)
              setXTokenBalRaw(balX)
              if (tokenAddr) setXTokenAllowanceRaw(allowX)
            }
          } catch {}
        }
        if (tokenAddr && addr) {
          const dec = Number(await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddr, functionName: 'decimals' }))
          const bal = await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddr, functionName: 'balanceOf', args: [addr] })
          const allow = await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddr, functionName: 'allowance', args: [addr, tokenAddr] })
          if (!cancelled) {
            setTokenDecimals(Number.isFinite(dec) ? dec : 18)
            setTokenBalance(typeof bal === 'bigint' ? bal : 0n)
            setAllowance(typeof allow === 'bigint' ? allow : 0n)
          }
        } else {
          if (!cancelled) {
            setTokenBalance(0n)
            setTokenDecimals(18)
            setAllowance(0n)
          }
        }
      } catch {
        if (!cancelled) {
          setTokenBalance(0n)
          setTokenDecimals(18)
          setAllowance(0n)
          setXTokenAllowanceRaw(0n)
        }
      }
    }
    loadBalances()
    return () => { cancelled = true }
  }, [isOpen, walletAddress, selectedRobot?.contractAddress])

  // Bonding curve progress via getTokenStats (also provides PancakeSwap V2 pair)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!isOpen) return
        const tokenAddr = selectedRobot?.contractAddress
        if (!tokenAddr) { if (!cancelled) { setBondingProgress({ percent: 0, isGraduated: false }); setUniswapPair('') } return }
        // Prefer cached stats from context to avoid duplicate RPCs
        const cached = tokenStatsByAddress[tokenAddr]
        const tokenStats = cached || await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddr, functionName: 'getTokenStats', args: [] }).catch(() => null)
        const rawProgress = tokenStats?.progressPercent ?? 0
        const isGraduated = Boolean(tokenStats?.isGraduated ?? false)
        const numericProgress = (() => {
          if (typeof rawProgress === 'number') return rawProgress
          if (typeof rawProgress === 'bigint') return Number(rawProgress)
          const n = Number(rawProgress ?? 0)
          return Number.isFinite(n) ? n : 0
        })()
        const clamped = Math.max(0, Math.min(100, numericProgress))
        if (!cancelled) {
          setBondingProgress({ percent: isGraduated ? 100 : clamped, isGraduated })
          const pair = typeof tokenStats?.uniswapV2Pair === 'string' ? tokenStats.uniswapV2Pair : ''
          setUniswapPair(pair && pair !== '0x0000000000000000000000000000000000000000' ? pair : '')
        }
      } catch {
        if (!cancelled) { setBondingProgress({ percent: 0, isGraduated: false }); setUniswapPair('') }
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, selectedRobot?.contractAddress])
  
  // Load initial status when modal opens with active simulation
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!isOpen) return
        const simId = simulationIdFromProps
        if (!simId || simId === 'X') return
        if (!deviceNode) return
        
        const status = await RobotApi.getStatus(simId, deviceNode).catch(() => null)
        if (!status || cancelled) return
        
        // Use only fresh status data, don't merge with old statusInfo
        const merged = {
          device_node: deviceNode,
          simulation_id: simId,
          ...status
        }
        setStatusInfo(merged)
        if (walletAddress) updateSimulation(walletAddress, deviceNode, merged)
      } catch {
        // Silently fail
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, simulationIdFromProps, deviceNode, walletAddress])
  
  // Preview buy quotes (HAVEN-based)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!isOpen || tradeSide !== 'buy') { if (!cancelled) setBuyPreview({ tokensOut: 0n, ethRequired: 0n, usdAmount: 0n }); return }
        const tokenAddr = selectedRobot?.contractAddress
        if (!tokenAddr) { if (!cancelled) setBuyPreview({ tokensOut: 0n, ethRequired: 0n, usdAmount: 0n }); return }
        const rawAmount = tradeAmount === '' ? (typeof quickBuyAmount === 'string' ? parseFloat(quickBuyAmount) : Number(quickBuyAmount)) : (typeof tradeAmount === 'string' ? parseFloat(tradeAmount) : Number(tradeAmount))
        if (!Number.isFinite(rawAmount) || rawAmount <= 0) { if (!cancelled) setBuyPreview({ tokensOut: 0n, ethRequired: 0n, usdAmount: 0n }); return }
        const xAmount = (() => { try { return parseUnits(String(rawAmount), 18) } catch { return 0n } })()
        if (xAmount <= 0n) { if (!cancelled) setBuyPreview({ tokensOut: 0n, ethRequired: 0n, usdAmount: 0n }); return }

        const preview = await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddr, functionName: 'previewBuy', args: [xAmount] })
        // previewBuy returns a struct/object, not an array
        const tokensOut = preview?.tokensOut ?? (Array.isArray(preview) ? preview[0] : 0n)
        if (!cancelled) setBuyPreview({ tokensOut: toBigIntSafe(tokensOut), ethRequired: 0n, usdAmount: 0n })
      } catch {
        if (!cancelled) setBuyPreview({ tokensOut: 0n, ethRequired: 0n, usdAmount: 0n })
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, tradeSide, tradeAmount, quickBuyAmount, selectedRobot?.contractAddress])

  // Preview sell quotes
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!isOpen || tradeSide !== 'sell') { if (!cancelled) setSellPreview({ xTokenOut: 0n, tokenAmount: 0n }); return }
        const tokenAddr = selectedRobot?.contractAddress
        if (!tokenAddr) { if (!cancelled) setSellPreview({ xTokenOut: 0n, tokenAmount: 0n }); return }
        const rawAmount = Number(tradeAmount)
        if (!Number.isFinite(rawAmount) || rawAmount <= 0) { if (!cancelled) setSellPreview({ xTokenOut: 0n, tokenAmount: 0n }); return }
        let tokens = (() => { try { return parseUnits(String(rawAmount), tokenDecimals) } catch { return 0n } })()
        if (tokens <= 0n) { if (!cancelled) setSellPreview({ xTokenOut: 0n, tokenAmount: 0n }); return }
        // Safety: if user targets ~100% (rounding), trim a tiny margin to avoid revert
        try {
          if (tokenBalance && tokens >= tokenBalance) {
            const margin = tokenBalance / 10000n /* 0.01% */
            const minMargin = margin > 0n ? margin : 1n
            tokens = tokenBalance > minMargin ? (tokenBalance - minMargin) : (tokenBalance > 1n ? tokenBalance - 1n : 0n)
          }
        } catch {}
        const preview = await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddr, functionName: 'previewSell', args: [tokens] })
        // previewSell (v2) returns xTokenOut & feeXToken
        const xTokenOut = preview?.xTokenOut ?? (Array.isArray(preview) ? preview[0] : 0n)
        if (!cancelled) setSellPreview({ xTokenOut: toBigIntSafe(xTokenOut), tokenAmount: tokens })
      } catch {
        if (!cancelled) setSellPreview({ xTokenOut: 0n, tokenAmount: 0n })
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, tradeSide, tradeAmount, tokenDecimals, selectedRobot?.contractAddress])

  // Initialize TradingView Lightweight Charts for pre-bonded tokens using backend data
  useEffect(() => {
    let cleanup = null
    ;(async () => {
      try {
        if (!isOpen) return
        if (activeTab !== 'trade') return
        if (bondingProgress?.isGraduated) {
          if (tvChartRef.current) {
            try { tvChartRef.current.remove() } catch {}
            tvChartRef.current = null
            tvSeriesRef.current = null
          }
          return
        }
        const container = tvChartContainerRef.current
        if (!container) return
        // Destroy any previous chart before creating a new one
        if (tvChartRef.current) {
          try { tvChartRef.current.remove() } catch {}
          tvChartRef.current = null
          tvSeriesRef.current = null
        }

        const bgColor = isDark ? '#0b1220' : '#ffffff'
        const textColor = isDark ? '#cbd5e1' : '#111827'
        const lineColor = '#2962FF'
        const topColor = '#2962FF'
        const bottomColor = 'rgba(41, 98, 255, 0.28)'

        const chart = createChart(container, {
          layout: { textColor, background: { type: 'solid', color: bgColor } },
          rightPriceScale: { visible: true },
          timeScale: { borderVisible: false },
          grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        })
        tvChartRef.current = chart
        const series = chart.addSeries(AreaSeries, {
          lineColor,
          topColor,
          bottomColor,
          priceFormat: {
            type: 'custom',
            formatter: (price) => {
              const val = Number(price) || 0
              if (val >= 1_000_000) return `$${Math.round(val / 1_000_000)}M`
              if (val >= 100_000) return `$${Math.round(val / 1_000)}k`
              const n = Math.round(val)
              try { return `$${n.toLocaleString('en-US')}` } catch { return `$${n}` }
            },
            minMove: 1,
          },
        })
        tvSeriesRef.current = series

        const resize = () => {
          try {
            const { clientWidth, clientHeight } = container
            chart.applyOptions({ width: clientWidth, height: clientHeight })
          } catch {}
        }
        resize()
        const ro = new ResizeObserver(() => resize())
        try { ro.observe(container) } catch {}

        // Fetch marketcap timeline from backend
        let baseData = []
        try {
          const addr = selectedRobot?.contractAddress
          if (addr) {
            const res = await fetch(`${ROBOT_API_BASE}/blockchain/marketcap_timestamp`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contract_address: addr })
            }).catch(() => null)
            const json = res ? await res.json().catch(() => null) : null
            const list = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : [])
            baseData = list.map((p) => {
              const time = Math.floor(Number(p.timestamp ?? p.time ?? 0))
              const raw = Number(p.marketcap_usd ?? p.marketcap ?? p.value ?? 0)
              const price = Number(havenUsd) > 0 ? Number(havenUsd) : 1
              const value = Number.isFinite(raw) ? (raw * price) : 0
              return { time, value }
            }).filter(d => Number.isFinite(d.time) && Number.isFinite(d.value))
          }
        } catch {
          baseData = []
        }

        const toSeconds = (tf) => {
          const map = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800 }
          return map[tf] || 900
        }
        const resample = (points, bucketSec) => {
          if (!Array.isArray(points) || points.length === 0) return []
          // assume points are sorted by time asc
          const out = []
          let currentBucket = Math.floor(points[0].time / bucketSec)
          let lastPointInBucket = points[0]
          for (let i = 1; i < points.length; i++) {
            const p = points[i]
            const bucket = Math.floor(p.time / bucketSec)
            if (bucket !== currentBucket) {
              out.push({ time: currentBucket * bucketSec, value: lastPointInBucket.value })
              currentBucket = bucket
            }
            lastPointInBucket = p
          }
          // push last
          out.push({ time: currentBucket * bucketSec, value: lastPointInBucket.value })
          return out
        }

        // Reverse order so latest appears at the end for display
        baseData = Array.isArray(baseData) ? [...baseData].reverse() : []
        const tfSec = toSeconds(tvTimeframe)
        const data = tfSec === 60 ? baseData : resample(baseData, tfSec)
        series.setData(data)
        tvLastDataRef.current = data
        // Align the last data point to the right (latest at the end)
        try { chart.timeScale().scrollToRealTime() } catch {}

        cleanup = () => {
          try { ro.disconnect() } catch {}
          if (tvChartRef.current) {
            try { tvChartRef.current.remove() } catch {}
            tvChartRef.current = null
            tvSeriesRef.current = null
          }
        }
      } catch {
        // ignore init errors for mock
      }
    })()
    return () => { if (cleanup) cleanup() }
  }, [isOpen, activeTab, bondingProgress?.isGraduated, isDark, tvTimeframe, havenUsd])

  // Load trade history from backend
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!isOpen) return
        const addr = selectedRobot?.contractAddress
        if (!addr) { if (!cancelled) setTradeHistory([]); return }
        const res = await fetch(`${ROBOT_API_BASE}/blockchain/trade_history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contract_address: addr })
        }).catch(() => null)
        const json = res ? await res.json().catch(() => null) : null
        const list = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : [])
        if (!cancelled) setTradeHistory((prev) => stableMergeTrades(prev, Array.isArray(list) ? list : []))
      } catch {
        if (!cancelled) setTradeHistory([])
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, selectedRobot?.contractAddress])

  // Stable merge helper to reduce UI jank
  const tradeKey = (t) => {
    try {
      const ts = String(Math.floor(Number(t?.timestamp) || 0))
      const type = String(t?.type || '').toLowerCase()
      const user = String(t?.user || '').toLowerCase()
      const a = String(t?.ethIn ?? t?.ethOut ?? '')
      const b = String(t?.usdSpent ?? t?.usdReceived ?? '')
      const c = String(t?.tokensOut ?? t?.tokensIn ?? '')
      return `${type}|${user}|${ts}|${a}|${b}|${c}`
    } catch { return String(Math.random()) }
  }
  const equalTrade = (a, b) => {
    try {
      return (
        String(a?.type||'').toLowerCase() === String(b?.type||'').toLowerCase() &&
        String(a?.user||'').toLowerCase() === String(b?.user||'').toLowerCase() &&
        Math.floor(Number(a?.timestamp)||0) === Math.floor(Number(b?.timestamp)||0) &&
        String(a?.ethIn??'') === String(b?.ethIn??'') &&
        String(a?.ethOut??'') === String(b?.ethOut??'') &&
        String(a?.usdSpent??'') === String(b?.usdSpent??'') &&
        String(a?.usdReceived??'') === String(b?.usdReceived??'') &&
        String(a?.tokensOut??'') === String(b?.tokensOut??'') &&
        String(a?.tokensIn??'') === String(b?.tokensIn??'')
      )
    } catch { return false }
  }
  const stableMergeTrades = (prev, next) => {
    try {
      const prevMap = new Map((Array.isArray(prev)?prev:[]).map(t => [tradeKey(t), t]))
      const merged = (Array.isArray(next)?next:[]).map(t => {
        const key = tradeKey(t)
        const old = prevMap.get(key)
        return old && equalTrade(old, t) ? old : t
      })
      if (prev && merged.length === prev.length && merged.every((t, i) => t === prev[i])) return prev
      return merged
    } catch { return Array.isArray(next) ? next : [] }
  }

  // 2s polling for Trade tab only: refresh trade history and chart (when not graduated)
  useEffect(() => {
    if (!isOpen) return
    if (activeTab !== 'trade') return
    let intervalId = null
    const poll = async () => {
      try {
        const addr = selectedRobot?.contractAddress
        if (!addr) return
        // Trade history
        const res = await fetch(`${ROBOT_API_BASE}/blockchain/trade_history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contract_address: addr })
        }).catch(() => null)
        const json = res ? await res.json().catch(() => null) : null
        const list = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : [])
        setTradeHistory((prev) => stableMergeTrades(prev, Array.isArray(list) ? list : []))

        // Chart refresh only when not graduated
        if (!bondingProgress?.isGraduated && tvSeriesRef.current) {
          const res2 = await fetch(`${ROBOT_API_BASE}/blockchain/marketcap_timestamp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contract_address: addr })
          }).catch(() => null)
          const json2 = res2 ? await res2.json().catch(() => null) : null
          let base = (Array.isArray(json2) ? json2 : (Array.isArray(json2?.data) ? json2.data : [])).map((p) => {
            const time = Math.floor(Number(p.timestamp ?? p.time ?? 0))
            const raw = Number(p.marketcap_usd ?? p.marketcap ?? p.value ?? 0)
            const price = Number(havenUsd) > 0 ? Number(havenUsd) : 1
            const value = Number.isFinite(raw) ? (raw * price) : 0
            return { time, value }
          }).filter(d => Number.isFinite(d.time) && Number.isFinite(d.value))
          // Reverse order so latest appears at the end for display
          base = base.reverse()
          const toSeconds = (tf) => { const map = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800 }; return map[tf] || 900 }
          const resample = (points, bucketSec) => {
            if (!Array.isArray(points) || points.length === 0) return []
            const out = []
            let currentBucket = Math.floor(points[0].time / bucketSec)
            let lastPointInBucket = points[0]
            for (let i = 1; i < points.length; i++) {
              const p = points[i]
              const bucket = Math.floor(p.time / bucketSec)
              if (bucket !== currentBucket) {
                out.push({ time: currentBucket * bucketSec, value: lastPointInBucket.value })
                currentBucket = bucket
              }
              lastPointInBucket = p
            }
            out.push({ time: currentBucket * bucketSec, value: lastPointInBucket.value })
            return out
          }
          const tfSec = toSeconds(tvTimeframe)
          const data = tfSec === 60 ? base : resample(base, tfSec)
          try {
            const prev = Array.isArray(tvLastDataRef.current) ? tvLastDataRef.current : []
            const series = tvSeriesRef.current
            if (!series) return
            const prevLen = prev.length
            const newLen = data.length
            const minLen = Math.min(Math.max(0, prevLen - 1), newLen - 1)
            let prefixEqual = true
            for (let i = 0; i < minLen; i++) {
              if (prev[i].time !== data[i].time || prev[i].value !== data[i].value) { prefixEqual = false; break }
            }
            if (prefixEqual) {
              if (newLen === prevLen && newLen > 0) {
                const lastNew = data[newLen - 1]
                if (prev[newLen - 1].time === lastNew.time && prev[newLen - 1].value !== lastNew.value) {
                  series.update(lastNew)
                  tvLastDataRef.current[newLen - 1] = lastNew
                }
              } else if (newLen > prevLen) {
                for (let i = prevLen; i < newLen; i++) series.update(data[i])
                tvLastDataRef.current = data
              } else {
                series.setData(data)
                tvLastDataRef.current = data
              }
            } else {
              series.setData(data)
              tvLastDataRef.current = data
            }
            // Keep view anchored to the latest values on the right
            try { tvChartRef.current?.timeScale()?.scrollToRealTime() } catch {}
          } catch {}
        }
      } catch {}
    }
    poll()
    intervalId = setInterval(poll, 2000)
    return () => { if (intervalId) clearInterval(intervalId) }
  }, [isOpen, activeTab, selectedRobot?.contractAddress, bondingProgress?.isGraduated, tvTimeframe, havenUsd])

  const pagedTrades = useMemo(() => {
    const sorted = Array.isArray(tradeHistory)
      ? [...tradeHistory].sort((a, b) => (Number(b?.timestamp || 0) - Number(a?.timestamp || 0)))
      : []
    const start = (tradePage - 1) * TRADES_PER_PAGE
    return sorted.slice(start, start + TRADES_PER_PAGE)
  }, [tradeHistory, tradePage])

  const totalTradePages = Math.max(1, Math.ceil((tradeHistory?.length || 0) / TRADES_PER_PAGE))
  useEffect(() => { setTradePage(1) }, [tradeHistory])

  const shortAddr = (addr) => {
    if (!addr || typeof addr !== 'string') return '—'
    const s = addr.trim()
    if (s.length <= 10) return s
    return `${s.slice(0, 4)}...${s.slice(-3)}`
  }

  const explorerUrl = (addr) => `https://bscscan.com/address/${addr}`
  const formatEthNumber = (value) => {
    try {
      const raw = typeof value === 'bigint' ? Number(value) : Number(value)
      if (!Number.isFinite(raw)) return '—'
      const eth = Math.abs(raw) >= 1e12 ? (raw / 1e18) : raw
      if (eth >= 1) return eth.toFixed(2)
      if (eth === 0) return '0'
      return eth.toFixed(4)
    } catch { return '—' }
  }
  const formatUsdNumber = (value) => {
    try {
      const raw = typeof value === 'bigint' ? Number(value) : Number(value)
      if (!Number.isFinite(raw)) return '$0'
      const usd = Math.abs(raw) >= 1e9 ? (raw / 1e18) : raw
      if (usd >= 1_000_000) return `$${Math.round(usd/1_000_000)}M`
      if (usd >= 1_000) return `$${Math.round(usd/1_000)}K`
      if (usd >= 1) return `$${usd.toFixed(2)}`
      if (usd === 0) return '$0.00'
      return `$${usd.toFixed(4)}`
    } catch { return '$0' }
  }
  const formatHavenNumber = (value) => {
    try {
      const raw = typeof value === 'bigint' ? Number(value) : Number(value)
      if (!Number.isFinite(raw)) return '0'
      // Backend sends 18-decimals for HAVEN amounts (ethIn/ethOut)
      const hav = raw / 1e18
      if (hav >= 1_000_000) return `${(hav/1_000_000).toFixed(2)}M`
      if (hav >= 1_000) return `${(hav/1_000).toFixed(2)}K`
      if (hav >= 1) return hav.toFixed(2)
      if (hav === 0) return '0'
      return hav.toPrecision(3)
    } catch { return '0' }
  }

  // New helpers for trade history plain values (no decimals scaling)
  const formatUsdPlain = (value) => {
    try {
      const usd = Number(value)
      if (!Number.isFinite(usd)) return '$0'
      if (usd >= 1_000_000) return `$${Math.round(usd/1_000_000)}M`
      if (usd >= 1_000) return `$${Math.round(usd/1_000)}K`
      if (usd >= 1) return `$${usd.toFixed(2)}`
      if (usd === 0) return '$0.00'
      return `$${usd.toFixed(4)}`
    } catch { return '$0' }
  }
  const formatHavenPlain = (value) => {
    try {
      const hav = Number(value)
      if (!Number.isFinite(hav)) return '0'
      if (hav >= 1_000_000) return `${(hav/1_000_000).toFixed(2)}M`
      if (hav >= 1_000) return `${(hav/1_000).toFixed(2)}K`
      if (hav >= 1) return hav.toFixed(2)
      if (hav === 0) return '0'
      return hav.toPrecision(3)
    } catch { return '0' }
  }

  // Keep command list in sync with the active simulation; always include defaults
  useEffect(() => {
    if (!isOpen || !selectedRobot) return
    const defaults = (Array.isArray(selectedRobot.command_list) && selectedRobot.command_list.length > 0)
      ? selectedRobot.command_list
      : DEFAULT_COMMANDS
    const fromSim = Array.isArray(statusInfo?.command_list) ? statusInfo.command_list : []
    const unique = Array.from(new Set([...(defaults || []), ...fromSim]))
    setCommands(unique)
  }, [isOpen, selectedRobot, statusInfo])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      // Reset terminal on open
      setTerminalOutput('')
      setTerminalDisplay('')
      setIsTyping(false)
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Animate terminal output with a typewriter effect
  useEffect(() => {
    let intervalId = null
    if (!terminalOutput) { setTerminalDisplay(''); return }
    setTerminalDisplay('')
    setIsTyping(true)
    const content = String(terminalOutput)
    let index = 0
    const step = Math.max(1, Math.floor(content.length / 400))
    intervalId = setInterval(() => {
      index = Math.min(content.length, index + step)
      setTerminalDisplay(content.slice(0, index))
      // Auto-scroll as content grows
      try { const el = terminalRef.current; if (el) el.scrollTop = el.scrollHeight } catch {}
      if (index >= content.length) { clearInterval(intervalId); setIsTyping(false) }
    }, 8)
    return () => { if (intervalId) clearInterval(intervalId) }
  }, [terminalOutput])

  // Polling interval reference must be declared before any early returns
  const pollIntervalRef = useRef(null)

  const startStatusPolling = (simulationId) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (!isOpen) return
    pollIntervalRef.current = setInterval(async () => {
      try {
        if (!isOpen) return
        const status = await RobotApi.getStatus(simulationId, deviceNode).catch(() => null)
        if (!status) return
        const merged = {
          device_node: deviceNode,
          simulation_id: simulationId,
          ...status,
          command_list: (status?.command_list && Array.isArray(status.command_list))
            ? status.command_list
            : (statusInfo?.command_list || [])
        }
        setStatusInfo(merged)
        if (walletAddress) updateSimulation(walletAddress, deviceNode, merged)
        const nextState = String(status.state || '').toLowerCase()
        if (nextState === 'idle') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
        }
      } catch {
        // ignore single poll errors
      }
    }, 1000)
  }

  useEffect(() => {
    if (!isOpen && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [isOpen])

  if (!isOpen || !selectedRobot) return null

  // Check if this is an agent (not a robot)
  const isAgent = selectedRobot?.isAgent === true || !!selectedRobot?.brain_id

  const batteryFromStatus = (typeof statusInfo?.battery === 'number')
    ? statusInfo.battery
    : (typeof statusInfo?.status?.battery === 'number' ? statusInfo.status.battery : undefined)
  const batteryLevel = Number.isFinite(Number(batteryFromStatus))
    ? Number(batteryFromStatus)
    : (typeof selectedRobot.battery === 'number' ? selectedRobot.battery : 50)
  const derivedState = (() => {
    const fromSim = (statusInfo?.state ?? statusInfo?.status?.state)
    const fromRobot = (selectedRobot?.state ?? selectedRobot?.status?.state ?? (typeof selectedRobot?.status === 'string' ? selectedRobot.status : undefined))
    const s = fromSim ?? fromRobot ?? 'idle'
    return (typeof s === 'string') ? s : 'idle'
  })()
  const statusLabel = toTitle(derivedState)
  const normalizedState = String(derivedState || '').toLowerCase()
  const statusColor = (normalizedState === 'idle' || isActiveStatus(derivedState))
    ? (isDark ? 'text-green-400' : 'text-green-600')
    : (isDark ? 'text-slate-400' : 'text-gray-600')
  const batteryColor = batteryLevel >= 70
    ? (isDark ? 'text-green-400' : 'text-green-500')
    : batteryLevel >= 30
      ? (isDark ? 'text-yellow-400' : 'text-yellow-500')
      : (isDark ? 'text-red-400' : 'text-red-500')

  // Extended status fields
  const simPos = statusInfo?.position
  const positionX = (Array.isArray(simPos) ? simPos[0] : (simPos?.x !== undefined ? simPos.x : selectedRobot?.position?.x))
  const positionY = (Array.isArray(simPos) ? simPos[1] : (simPos?.y !== undefined ? simPos.y : selectedRobot?.position?.y))
  const posLabelX = Number.isFinite(Number(positionX)) ? Number(positionX) : 'X'
  const posLabelY = Number.isFinite(Number(positionY)) ? Number(positionY) : 'Y'
  const speedVal = (typeof statusInfo?.speed === 'number')
    ? statusInfo.speed
    : (typeof statusInfo?.status?.speed === 'number' ? statusInfo.status.speed : 0)
  const sizeArr = Array.isArray(statusInfo?.size)
    ? statusInfo.size
    : (Array.isArray(statusInfo?.status?.size) ? statusInfo.status.size : null)
  const sizeLabel = (Array.isArray(sizeArr) && sizeArr.length >= 2)
    ? `${sizeArr[0]} x ${sizeArr[1]}`
    : (Array.isArray(selectedRobot?.size) && selectedRobot.size.length >= 2 ? `${selectedRobot.size[0]} x ${selectedRobot.size[1]}` : 'X')
  const robotSizeX = Array.isArray(sizeArr) ? Number(sizeArr[0]) : (Array.isArray(selectedRobot?.size) ? Number(selectedRobot.size[0]) : 1)
  const robotSizeY = Array.isArray(sizeArr) ? Number(sizeArr[1]) : (Array.isArray(selectedRobot?.size) ? Number(selectedRobot.size[1]) : 1)
  const objectList = Array.isArray(statusInfo?.object_list) ? statusInfo.object_list : []

  const clampZoom = (z) => Math.max(1, Math.min(4, z))
  const zoomIn = () => setZoom((z) => clampZoom(z + 0.25))
  const zoomOut = () => setZoom((z) => clampZoom(z - 0.25))

  const centerOnRobot = () => {
    try {
      const outer = mapOuterRef.current
      const inner = mapInnerRef.current
      if (!outer || !inner) return
      const mapSize = 20
      const posFromSim = statusInfo?.position
      const sx = Array.isArray(posFromSim) ? posFromSim[0] : posFromSim?.x
      const sy = Array.isArray(posFromSim) ? posFromSim[1] : posFromSim?.y
      const rxFromRobot = selectedRobot?.position?.x
      const ryFromRobot = selectedRobot?.position?.y
      const rawX = (sx !== undefined && sx !== null) ? sx : ((rxFromRobot !== undefined && rxFromRobot !== null) ? rxFromRobot : undefined)
      const rawY = (sy !== undefined && sy !== null) ? sy : ((ryFromRobot !== undefined && ryFromRobot !== null) ? ryFromRobot : undefined)
      const toRatio = (v, invert = false) => {
        const n = Number(v)
        if (!Number.isFinite(n)) return 0.5
        if (n <= 1 && n >= 0) return invert ? (1 - n) : n
        if (n <= 50 && n >= 0) return invert ? (1 - (n / 50)) : (n / 50)
        if (n <= 100 && n >= 0) return invert ? (1 - (n / 100)) : (n / 100)
        const idx = Math.max(0, Math.min(mapSize - 1, Math.round(n)))
        const r = (idx / (mapSize - 1))
        return invert ? (1 - r) : r
      }
      const rx = toRatio(rawX, false)
      const ry = toRatio(rawY, true)
      const targetX = inner.clientWidth * rx
      const targetY = inner.clientHeight * ry
      outer.scrollTo({ left: Math.max(0, targetX - outer.clientWidth / 2), top: Math.max(0, targetY - outer.clientHeight / 2), behavior: 'smooth' })
    } catch {}
  }
  const abilitiesVal = (statusInfo?.abilities ?? statusInfo?.status?.abilities ?? 'None')
  const sensorsObj = (statusInfo?.sensors ?? statusInfo?.status?.sensors ?? {})
  const sensorsCount = (sensorsObj && typeof sensorsObj === 'object') ? Object.keys(sensorsObj).length : 0
  const sensorsLabel = sensorsCount > 0 ? `${sensorsCount} ${sensorsCount===1?'type':'types'}` : 'None'
  const collision = Boolean(statusInfo?.collision ?? statusInfo?.status?.collision ?? false)
  const collisionLabel = collision ? 'Yes' : 'No'

  const handleCommandSelect = (command) => {
    console.log('[handleCommandSelect] Setting command:', command)
    console.log('[handleCommandSelect] Previous selectedCommand:', selectedCommand)
    setSelectedCommand(command)
    setCustomCommand('')
    console.log('[handleCommandSelect] Command set successfully')
  }

  const handleAddCustomCommand = async () => {
    if (isAddingCommand) return
    const trimmed = customCommand.trim()
    if (!trimmed) {
      addToast('Please enter a command', 'warning')
      return
    }
    if (!isWalletConnected || !walletAddress) {
      addToast('Connect your wallet to add commands', 'warning')
      return
    }
    if (!deviceNode) return

    setIsAddingCommand(true)
    try {
      // Ensure simulation exists before adding commands
      if (!simulationIdentifier || simulationIdentifier === 'X') {
        try {
          const loadResult = await RobotApi.loadSimulation('sim', { device_node: deviceNode, wallet: walletAddress })
          
          // Update statusInfo with new simulation
          if (loadResult?.simulation_id) {
            const merged = { 
              device_node: deviceNode, 
              simulation_id: loadResult.simulation_id,
              ...loadResult
            }
            setStatusInfo(merged)
            updateSimulation(walletAddress, deviceNode, merged)
          }
        } catch {}
      }

      await RobotApi.addCommand(trimmed, walletAddress, { device_node: deviceNode })
      addToast(`Command "${trimmed}" added`, 'success')
      setCustomCommand('')
      setSelectedCommand(trimmed)
      // Optimistically add to local command list and persist in statusInfo
      setCommands((prev) => Array.from(new Set([...(Array.isArray(prev) ? prev : []), trimmed])))
      setStatusInfo((prev) => {
        const defaults = (Array.isArray(selectedRobot.command_list) && selectedRobot.command_list.length > 0)
          ? selectedRobot.command_list
          : DEFAULT_COMMANDS
        const list = Array.from(new Set([...(Array.isArray(prev?.command_list) ? prev.command_list : []), trimmed, ...defaults]))
        return prev ? { ...prev, command_list: list } : { device_node: deviceNode, command_list: list }
      })
      // Refresh simulations only and sync command list from the active simulation
      const sims = typeof onSyncSimulations === 'function' ? await onSyncSimulations() : []
      const match = Array.isArray(sims)
        ? sims.find((s) => (s.device_node || s.parent_device_node) === deviceNode)
        : null
      if (match) {
        const merged = { device_node: deviceNode, ...match }
        setStatusInfo(merged)
        if (walletAddress) {
          updateSimulation(walletAddress, deviceNode, merged)
        }
      }
    } catch (error) {
      addToast(error?.message || 'Failed to add command', 'error')
    } finally {
      setIsAddingCommand(false)
    }
  }


  const resolveSimulationId = async () => {
    if (simulationIdFromProps) return simulationIdFromProps
    if (statusInfo?.simulation_id) return statusInfo.simulation_id
    if (typeof onSyncSimulations !== 'function' || !walletAddress) return null
    try {
      const simulations = await onSyncSimulations()
      const match = Array.isArray(simulations)
        ? simulations.find((sim) => (sim.device_node || sim.parent_device_node) === deviceNode)
        : null
      return match?.simulation_id || null
    } catch {
      return null
    }
  }

  const handleSendCommand = async () => {
    if (isSendingCommand) return
    const commandToSend = (selectedCommand || customCommand).trim()
    if (!commandToSend) {
      addToast('Please select or enter a command', 'warning')
      return
    }
    if (!deviceNode) return
    if (!isWalletConnected || !walletAddress) {
      addToast('Connect your wallet to send commands', 'warning')
      return
    }

    setIsSendingCommand(true)
    try {
      let cmdResponse

      // Use different endpoint for agents vs robots
      if (isAgent) {
        // For agents, call /robot/agents/agent-llm-command
        // Use agent_node field from the agent object
        const agentNodeName = selectedRobot.agent_node ||
                             selectedRobot.ticker?.toLowerCase() ||
                             selectedRobot.name?.toLowerCase().replace(/\s+/g, '_') ||
                             `agent_${selectedRobot.brain_id}`

        cmdResponse = await RobotApi.sendAgentCommand({
          agent_node: agentNodeName,
          command: commandToSend
        })
      } else {
        // For robots, use the simulation-based command
        let simulationId = await resolveSimulationId()
        if (!simulationId) {
          addToast('You need an active simulation for this robot before sending commands', 'warning')
          setIsSendingCommand(false)
          return
        }
        cmdResponse = await RobotApi.sendCommand(simulationId, { command: commandToSend, args: {} })
      }

      try { setTerminalOutput(JSON.stringify(cmdResponse, null, 2)) } catch { setTerminalOutput(String(cmdResponse ?? '')) }
      addToast(`Command "${commandToSend}" sent`, 'success')
      setSelectedCommand('')
      // Don't clear customCommand - keep it in the input for re-sending if needed

      // For agents, we don't need to handle status polling since they don't have simulations
      if (!isAgent) {
        let initialStatus = null
        if (Array.isArray(cmdResponse) && cmdResponse.length > 0 && typeof cmdResponse[0] === 'object') {
          initialStatus = cmdResponse[0]
        }

        const simulationId = await resolveSimulationId()
        if (initialStatus && simulationId) {
          const merged = {
            device_node: deviceNode,
            simulation_id: simulationId,
            ...initialStatus,
            command_list: (initialStatus?.command_list && Array.isArray(initialStatus.command_list))
              ? initialStatus.command_list
              : (statusInfo?.command_list || [])
          }
          setStatusInfo(merged)
          if (walletAddress) updateSimulation(walletAddress, deviceNode, merged)
          const nextState = String(initialStatus.state || '').toLowerCase()
          if (nextState && nextState !== 'idle') startStatusPolling(simulationId)
        } else if (simulationId) {
          const status = await RobotApi.getStatus(simulationId, deviceNode).catch(() => null)
          try { if (status) setTerminalOutput(JSON.stringify(status, null, 2)) } catch {}
          if (status) {
            const mergedStatus = {
              device_node: deviceNode,
              simulation_id: simulationId,
              ...status,
              command_list: (status?.command_list && Array.isArray(status.command_list))
                ? status.command_list
                : (statusInfo?.command_list || [])
          }
            setStatusInfo(mergedStatus)
            if (walletAddress) updateSimulation(walletAddress, deviceNode, mergedStatus)
            const nextState = String(status.state || '').toLowerCase()
            if (nextState && nextState !== 'idle') startStatusPolling(simulationId)
          }
        }
      }
    } catch (error) {
      try { setTerminalOutput(JSON.stringify({ error: error?.message || 'Failed to send command' }, null, 2)) } catch {}
      addToast(error?.message || 'Failed to send command', 'error')
    } finally {
      setIsSendingCommand(false)
    }
  }


  const handleTradeAmountChange = (event) => {
    const value = event.target.value
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setTradeAmount(value)
    }
  }

  const parsedTradeAmount = tradeSide === 'sell'
    ? Number(String(tradeAmount).replace(',', '.'))
    : (tradeAmount === '' ? Number(quickBuyAmount) : Number(String(tradeAmount).replace(',', '.')))
  const isTradeAmountValid = Number.isFinite(parsedTradeAmount) && parsedTradeAmount > 0
  const requiredXTokenForBuy = (() => {
    try {
      if (tradeSide !== 'buy') return 0n
      const raw = tradeAmount === '' ? Number(quickBuyAmount) : Number(String(tradeAmount).replace(',', '.'))
      if (!Number.isFinite(raw) || raw <= 0) return 0n
      return parseUnits(String(raw), 18)
    } catch { return 0n }
  })()
  const insufficientXToken = tradeSide === 'buy' && requiredXTokenForBuy > xTokenBalRaw
  const needsXTokenApprove = tradeSide === 'buy' && requiredXTokenForBuy > 0n && xTokenAllowanceRaw < requiredXTokenForBuy
  

  const handleBuyTokens = async () => {
    if (!onBuy || !selectedRobot) return
    setIsBuying(true)
    try {
      // eslint-disable-next-line no-console
      console.log('[RobotModal.handleBuyTokens] tradeAmount/raw quickBuy', { tradeAmount, quickBuyAmount })
      const raw = tradeAmount === ''
        ? (typeof quickBuyAmount === 'string' ? parseFloat(String(quickBuyAmount).replace(',', '.')) : Number(quickBuyAmount))
        : Number(String(tradeAmount).replace(',', '.'))
      // eslint-disable-next-line no-console
      console.log('[RobotModal.handleBuyTokens] parsed', { raw })
      if (bondingProgress?.isGraduated) {
        const tokenAddr = selectedRobot?.contractAddress
        const to = walletAddress
        if (!tokenAddr || !to || !Number.isFinite(raw) || raw <= 0) throw new Error('Invalid buy params')
        const amountIn = parseUnits(String(raw), 18)
        // Resolve X Token from token contract to avoid mismatches
        let xTokenAddress = CONTRACTS?.xtoken?.address
        try {
          const xt = await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddr, functionName: 'X_TOKEN_ADDRESS' }).catch(() => null)
          if (typeof xt === 'string' && xt.length === 42) xTokenAddress = xt
        } catch {}
        const router = CONTRACTS.routerV2.address
        if (!router) throw new Error('Router not configured')

        // Approve HAVEN (XToken) to router if needed
        try {
          const erc20Abi = [
            { type:'function', name:'allowance', stateMutability:'view', inputs:[{name:'owner',type:'address'},{name:'spender',type:'address'}], outputs:[{name:'',type:'uint256'}] },
            { type:'function', name:'approve', stateMutability:'nonpayable', inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}], outputs:[{name:'',type:'bool'}] }
          ]
          const current = await readContract(wagmiConfig, { abi: erc20Abi, address: xTokenAddress, functionName: 'allowance', args: [to, router] }).catch(() => 0n)
          if (BigInt(current || 0n) < amountIn) {
            const { simulateContract, writeContract, waitForTransactionReceipt } = await import('@wagmi/core')
            const maxUint = (2n ** 256n) - 1n
            const sim = await simulateContract(wagmiConfig, { abi: erc20Abi, address: xTokenAddress, functionName: 'approve', args: [router, maxUint] })
            const tx = await writeContract(wagmiConfig, sim.request)
            addToast('Approving HAVEN for router...', 'info', 15000)
            await waitForTransactionReceipt(wagmiConfig, { hash: tx })
          }
        } catch (err) {
          throw new Error(err?.shortMessage || err?.message || 'Approve failed')
        }

        // Swap XToken -> Token via supportingFee router
        const path = [xTokenAddress, tokenAddr]
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
        const routerAbi = [
          { type:'function', name:'swapExactTokensForTokensSupportingFeeOnTransferTokens', stateMutability:'nonpayable', inputs:[
            {name:'amountIn',type:'uint256'},
            {name:'amountOutMin',type:'uint256'},
            {name:'path',type:'address[]'},
            {name:'to',type:'address'},
            {name:'deadline',type:'uint256'}
          ], outputs:[] }
        ]
        const { simulateContract, writeContract, waitForTransactionReceipt } = await import('@wagmi/core')
        const simSwap = await simulateContract(wagmiConfig, { abi: routerAbi, address: router, functionName: 'swapExactTokensForTokensSupportingFeeOnTransferTokens', args: [amountIn, 0n, path, to, deadline] })
        const swapHash = await writeContract(wagmiConfig, simSwap.request)
        addToast('Buying via DEX...', 'info', 15000)
        await waitForTransactionReceipt(wagmiConfig, { hash: swapHash })
      } else {
        await onBuy(selectedRobot, raw)
      }
      // Refresh balances and stats after successful buy
      try {
        const addr = walletAddress
        const tokenAddr = selectedRobot?.contractAddress
        if (addr) {
          const bal = await getBalance(wagmiConfig, { address: addr })
          setWalletEthBalance(bal?.value || 0n)
        }
        if (addr && tokenAddr) {
          const bal = await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddr, functionName: 'balanceOf', args: [addr] })
          setTokenBalance(typeof bal === 'bigint' ? bal : 0n)
          
          // Refresh stats (progress + pair) via getTokenStats
          // Prefer cached stats; fetch only if not present (post-trade will likely need freshness, but we still read cache first)
          let tokenStats = null
          try {
            tokenStats = await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddr, functionName: 'getTokenStats', args: [] })
            if (tokenStats) setTokenStatsFor?.(tokenAddr, tokenStats)
          } catch {
            tokenStats = tokenStatsByAddress[tokenAddr] || null
          }
          if (tokenStats) {
            const rawProgress = tokenStats?.progressPercent ?? 0
            const graduated = Boolean(tokenStats?.isGraduated ?? false)
            const numericProgress = (() => {
              if (typeof rawProgress === 'number') return rawProgress
              if (typeof rawProgress === 'bigint') return Number(rawProgress)
              const n = Number(rawProgress ?? 0)
              return Number.isFinite(n) ? n : 0
            })()
            const clamped = Math.max(0, Math.min(100, numericProgress))
            setBondingProgress({ percent: graduated ? 100 : clamped, isGraduated: graduated })
            const pair = typeof tokenStats?.uniswapV2Pair === 'string' ? tokenStats.uniswapV2Pair : ''
            setUniswapPair(pair && pair !== '0x0000000000000000000000000000000000000000' ? pair : '')
          }
        }
      } catch {}
      setTradeAmount('')
    } catch {
      // toast already handled upstream
    } finally {
      setIsBuying(false)
    }
  }

  const handleSellTokens = async () => {
    if (!onSell || !selectedRobot) return
    setIsSelling(true)
    try {
      if (bondingProgress?.isGraduated) {
        const tokenAddr = selectedRobot?.contractAddress
        const to = walletAddress
        if (!tokenAddr || !to || !Number.isFinite(parsedTradeAmount) || parsedTradeAmount <= 0) throw new Error('Invalid sell params')
        let amountTokens = (() => { try { return parseUnits(String(parsedTradeAmount), tokenDecimals) } catch { return 0n } })()
        if (amountTokens <= 0n) throw new Error('Invalid amount')

        // Safety margin when attempting 100%
        try {
          if (tokenBalance && amountTokens >= tokenBalance) {
            const margin = tokenBalance / 10000n
            const minMargin = margin > 0n ? margin : 1n
            amountTokens = tokenBalance > minMargin ? (tokenBalance - minMargin) : (tokenBalance > 1n ? tokenBalance - 1n : 0n)
          }
        } catch {}

        // Approve token to router if needed
        try {
          const erc20Abi = [
            { type:'function', name:'allowance', stateMutability:'view', inputs:[{name:'owner',type:'address'},{name:'spender',type:'address'}], outputs:[{name:'',type:'uint256'}] },
            { type:'function', name:'approve', stateMutability:'nonpayable', inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}], outputs:[{name:'',type:'bool'}] }
          ]
          const router = CONTRACTS.routerV2.address
          const current = await readContract(wagmiConfig, { abi: erc20Abi, address: tokenAddr, functionName: 'allowance', args: [to, router] }).catch(() => 0n)
          if (BigInt(current || 0n) < amountTokens) {
            const { simulateContract, writeContract, waitForTransactionReceipt } = await import('@wagmi/core')
            const maxUint = (2n ** 256n) - 1n
            const sim = await simulateContract(wagmiConfig, { abi: erc20Abi, address: tokenAddr, functionName: 'approve', args: [router, maxUint] })
            const tx = await writeContract(wagmiConfig, sim.request)
            addToast('Approving token for router...', 'info', 15000)
            await waitForTransactionReceipt(wagmiConfig, { hash: tx })
          }
        } catch (err) {
          throw new Error(err?.shortMessage || err?.message || 'Approve failed')
        }

        // Resolve X Token from token then swap Token -> XToken
        let xTokenAddress = CONTRACTS?.xtoken?.address
        try {
          const xt = await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddr, functionName: 'X_TOKEN_ADDRESS' }).catch(() => null)
          if (typeof xt === 'string' && xt.length === 42) xTokenAddress = xt
        } catch {}
        const path = [tokenAddr, xTokenAddress]
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
        const router = CONTRACTS.routerV2.address
        const routerAbi = [
          { type:'function', name:'swapExactTokensForTokensSupportingFeeOnTransferTokens', stateMutability:'nonpayable', inputs:[
            {name:'amountIn',type:'uint256'},
            {name:'amountOutMin',type:'uint256'},
            {name:'path',type:'address[]'},
            {name:'to',type:'address'},
            {name:'deadline',type:'uint256'}
          ], outputs:[] }
        ]
        const { simulateContract, writeContract, waitForTransactionReceipt } = await import('@wagmi/core')
        const simSwap = await simulateContract(wagmiConfig, { abi: routerAbi, address: router, functionName: 'swapExactTokensForTokensSupportingFeeOnTransferTokens', args: [amountTokens, 0n, path, to, deadline] })
        const swapHash = await writeContract(wagmiConfig, simSwap.request)
        addToast('Selling via DEX...', 'info', 15000)
        await waitForTransactionReceipt(wagmiConfig, { hash: swapHash })
      } else {
        // Fallback to bonding contract pre-graduation
        let amount = parsedTradeAmount
        try {
          const requested = parseUnits(String(parsedTradeAmount), tokenDecimals)
          if (requested >= tokenBalance) {
            const margin = tokenBalance / 10000n /* 0.01% */
            const minMargin = margin > 0n ? margin : 1n
            const adjusted = tokenBalance > minMargin ? tokenBalance - minMargin : (tokenBalance > 1n ? tokenBalance - 1n : 0n)
            amount = Number(formatUnits(adjusted, tokenDecimals))
          }
        } catch {}
        await onSell(selectedRobot, amount)
      }
      // Refresh balances and stats after successful sell
      try {
        const addr = walletAddress
        const tokenAddr = selectedRobot?.contractAddress
        if (addr) {
          const bal = await getBalance(wagmiConfig, { address: addr })
          setWalletEthBalance(bal?.value || 0n)
        }
        if (addr && tokenAddr) {
          const bal = await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddr, functionName: 'balanceOf', args: [addr] })
          setTokenBalance(typeof bal === 'bigint' ? bal : 0n)
          const allow = await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddr, functionName: 'allowance', args: [addr, tokenAddr] })
          setAllowance(typeof allow === 'bigint' ? allow : 0n)
          
          // Refresh stats (progress + pair) via getTokenStats
          let tokenStats = null
          try {
            tokenStats = await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddr, functionName: 'getTokenStats', args: [] })
            if (tokenStats) setTokenStatsFor?.(tokenAddr, tokenStats)
          } catch {
            tokenStats = tokenStatsByAddress[tokenAddr] || null
          }
          if (tokenStats) {
            const rawProgress = tokenStats?.progressPercent ?? 0
            const graduated = Boolean(tokenStats?.isGraduated ?? false)
            const numericProgress = (() => {
              if (typeof rawProgress === 'number') return rawProgress
              if (typeof rawProgress === 'bigint') return Number(rawProgress)
              const n = Number(rawProgress ?? 0)
              return Number.isFinite(n) ? n : 0
            })()
            const clamped = Math.max(0, Math.min(100, numericProgress))
            setBondingProgress({ percent: graduated ? 100 : clamped, isGraduated: graduated })
            const pair = typeof tokenStats?.uniswapV2Pair === 'string' ? tokenStats.uniswapV2Pair : ''
            setUniswapPair(pair && pair !== '0x0000000000000000000000000000000000000000' ? pair : '')
          }
        }
      } catch {}
      setTradeAmount('')
    } catch {
      // toast already handled upstream
    } finally {
      setIsSelling(false)
    }
  }

  const handleClaimFees = async () => {
    if (!isWalletConnected || !selectedRobot?.contractAddress) return
    setIsClaimingFees(true)
    try {
      const tokenAddr = selectedRobot.contractAddress
      addToast('Confirm claim fees in your wallet...', 'info')
      
      const { simulateContract, writeContract, waitForTransactionReceipt } = await import('@wagmi/core')
      
      const sim = await simulateContract(wagmiConfig, {
        abi: TokenAbi,
        address: tokenAddr,
        functionName: 'collectCreatorFees',
        args: [],
      })
      
      const hash = await writeContract(wagmiConfig, sim.request)
      addToast('Transaction sent. Waiting for confirmation...', 'info', 15000)
      await waitForTransactionReceipt(wagmiConfig, { hash })
      addToast('Fees claimed successfully!', 'success')
    } catch (err) {
      const msg = err?.shortMessage || err?.message || 'Failed to claim fees'
      if (msg.includes('Only creator')) {
        addToast('Only the token creator can claim fees', 'error')
      } else if (msg.includes('No fees')) {
        addToast('No fees available to claim', 'warning')
      } else {
        addToast(msg, 'error')
      }
    } finally {
      setIsClaimingFees(false)
    }
  }

  const tokenSymbol = selectedRobot?.token?.symbol || selectedRobot?.ticker || 'TKN'
  const simulationIdentifier = statusInfo?.simulation_id || simulationIdFromProps || 'X'
  const insufficientEth = tradeSide === 'buy' && buyPreview.ethRequired > 0n && buyPreview.ethRequired > walletEthBalance
  const isCreator = (() => {
    try {
      const a = String(selectedRobot?.wallet || '').toLowerCase()
      const b = String(walletAddress || '').toLowerCase()
      return a !== '' && a === b
    } catch { return false }
  })()
  const geckoPair = (() => {
    try {
      const p = String(bondingProgress?.isGraduated ? (uniswapPair || '') : '').trim()
      return p && p !== '0x0000000000000000000000000000000000000000' ? p : ''
    } catch { return '' }
  })()
  const dextoolsTheme = isDark ? 'dark' : 'light'
  const dextoolsSrc = geckoPair
    ? `https://www.dextools.io/widget-chart/en/bnb/pe-light/${geckoPair}?theme=${dextoolsTheme}&chartType=1&chartResolution=30&drawingToolbars=false`
    : `https://www.dextools.io/widget-chart/en/bnb/pe-light/0x0000000000000000000000000000000000000000?theme=${dextoolsTheme}&chartType=2&chartResolution=30&drawingToolbars=false`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 ${isDark ? 'bg-black/60' : 'bg-black/40'}`}
        onClick={onClose}
      />

      <div className="relative w-full max-w-3xl">
        <Card
          className={`${
            isDark
              ? 'bg-slate-900 border-slate-700 backdrop-blur-md rounded-2xl shadow-2xl'
              : 'bg-white border-gray-200 rounded-2xl shadow-2xl'
          } max-h-[90vh] overflow-y-auto`}
        >
          <CardHeader className="pb-3">
            {/* Header reorganizado para móvil */}
            <div className="flex flex-col gap-3">
              {/* Primera fila: Imagen, nombre y sociales */}
              <div className="flex items-center gap-3">
                {/* Imagen */}
                <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden flex-shrink-0 ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                  <img
                    src={safeImageUrl(selectedRobot.image)}
                    alt={selectedRobot.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Info del robot */}
                <div className="flex-1 min-w-0">
                  <CardTitle className={`${isDark ? 'text-white' : 'text-gray-900'} text-base sm:text-lg leading-tight`}>{selectedRobot.name}</CardTitle>
                  <p className={`text-xs sm:text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'} leading-tight`}>{selectedRobot.ticker || selectedRobot.device_node || 'X'}</p>
                  
                  {/* Sociales en móvil */}
                  <div className="flex items-center gap-1 mt-2">
                    {/* Website */}
                    {hasValidLink(selectedRobot.website) ? (
                      <a
                        href={selectedRobot.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-white' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </a>
                    ) : (
                      <div className={`p-1.5 rounded-lg ${isDark ? 'text-slate-700' : 'text-gray-300'} cursor-not-allowed`}>
                        <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                    )}
                    
                    {/* Twitter */}
                    {hasValidLink(selectedRobot.twitter) ? (
                      <a
                        href={selectedRobot.twitter.startsWith('http') ? selectedRobot.twitter : `https://twitter.com/${selectedRobot.twitter}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-white' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Twitter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </a>
                    ) : (
                      <div className={`p-1.5 rounded-lg ${isDark ? 'text-slate-700' : 'text-gray-300'} cursor-not-allowed`}>
                        <Twitter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                    )}
                    
                    {/* Telegram */}
                    {hasValidLink(selectedRobot.telegram) ? (
                      <a
                        href={selectedRobot.telegram.startsWith('http') ? selectedRobot.telegram : `https://t.me/${selectedRobot.telegram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-white' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </a>
                    ) : (
                      <div className={`p-1.5 rounded-lg ${isDark ? 'text-slate-700' : 'text-gray-300'} cursor-not-allowed`}>
                        <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Botón cerrar (X) - siempre visible arriba a la derecha */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className={`flex-shrink-0 ${
                    isDark
                      ? 'border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700'
                      : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Segunda fila: Botones de acción (Copy Contract y Claim Fees) */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Copy bonding contract */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); if (selectedRobot?.contractAddress) { try { navigator.clipboard.writeText(selectedRobot.contractAddress) } catch {}; addToast('Contract copied', 'success') } }}
                  title="Copy bonding contract"
                  className={`flex-1 min-w-[140px] ${
                    isDark
                      ? 'border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700'
                      : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Copy className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                  <span className="font-mono text-xs truncate">{shortAddr(selectedRobot?.contractAddress) || '—'}</span>
                </Button>

                {/* Claim Fees - solo si es creator */}
                {isCreator && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClaimFees}
                    disabled={!bondingProgress.isGraduated || !isWalletConnected || isClaimingFees}
                    className={`flex-shrink-0 ${
                      bondingProgress.isGraduated && isWalletConnected
                        ? (isDark ? 'border-[#5854f4] text-[#5854f4] hover:bg-[#5854f4] hover:text-white' : 'border-[#5854f4] text-[#5854f4] hover:bg-[#5854f4] hover:text-white')
                        : (isDark ? 'border-slate-700 text-slate-600 cursor-not-allowed' : 'border-gray-300 text-gray-400 cursor-not-allowed')
                    }`}
                  >
                    {isClaimingFees ? (
                      <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Claiming...</>
                    ) : (
                      <>Claim Fees</>
                    )}
                  </Button>
                )}
              </div>
            </div>

            <div
              className={`flex space-x-1 rounded-lg p-1 mt-4 ${
                isDark ? 'bg-slate-800/50' : 'bg-gray-100'
              }`}
            >
              {!hideTradeTab && (
                <Button
                  size="sm"
                  variant={activeTab === 'trade' ? 'default' : 'ghost'}
                  onClick={() => setActiveTab('trade')}
                  className={`flex-1 h-8 ${
                    activeTab === 'trade'
                      ? 'bg-[#5854f4] hover:bg-[#4c46e8] text-white'
                      : isDark
                        ? 'text-slate-400 hover:text-white hover:bg-slate-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Trade
                </Button>
              )}
              <Button
                size="sm"
                variant={activeTab === 'control' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('control')}
                className={`flex-1 h-8 ${
                  activeTab === 'control'
                    ? 'bg-[#5854f4] hover:bg-[#4c46e8] text-white'
                    : isDark
                      ? 'text-slate-400 hover:text-white hover:bg-slate-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                }`}
              >
                <Settings className="mr-2 h-4 w-4" />
                Control
              </Button>
            </div>
          </CardHeader>

          <CardContent className="pb-8 space-y-6">
            {activeTab !== 'control' && (
            <div className="space-y-3">
              <h3 className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-800'}`}>Robot Status</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className={`${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Token:</span>
                  <p className="text-[#5854f4] font-bold">{selectedRobot.token?.symbol || 'TKN'}</p>
                </div>
                <div>
                  <span className={`${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Device Node:</span>
                  <p className={`${isDark ? 'text-slate-300' : 'text-gray-800'} font-medium`}>{deviceNode || 'X'}</p>
                </div>
                
              </div>
            </div>
            )}

            {activeTab === 'trade' ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-800'}`}>Bonding Curve</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className={`flex items-center space-x-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                        <Activity className="h-4 w-4" />
                        <span>Progress:</span>
                      </div>
                      <span className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-800'}`}>
                        {bondingProgress.isGraduated ? 'Graduated' : `${bondingProgress.percent.toFixed(2)}%`}
                      </span>
                    </div>
                    <div
                      className={`relative h-3 w-full overflow-hidden rounded-full border ${
                        isDark ? 'bg-slate-700/60 border-slate-600/60' : 'bg-gray-200 border-gray-300'
                      }`}
                    >
                      <div
                        className="h-full bg-gradient-to-r from-[#5854f4] to-[#7c3aed] transition-all duration-300 ease-in-out"
                        style={{ width: `${bondingProgress.isGraduated ? 100 : Math.max(0, Math.min(100, bondingProgress.percent))}%` }}
                      />
                    </div>
                    <p className={`text-xs text-center ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                      {bondingProgress.isGraduated ? 'Token graduated to PancakeSwap' : 'USD raised vs graduation threshold'}
                    </p>
                  </div>
                </div>

              {/* Market Chart: DexTools when bonded; TradingView Lightweight Chart (mock) when not bonded */}
              <div className="space-y-3">
                <h3 className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-800'}`}>Chart</h3>
                <div className={`rounded-xl overflow-hidden border w-full ${isDark ? 'border-slate-700/60 bg-slate-900/60' : 'border-gray-200 bg-white'}`} style={{ height: '420px' }}>
                  {bondingProgress?.isGraduated ? (
                    <iframe
                      id="dextools-widget"
                      title="DEXTools Trading Chart"
                      src={dextoolsSrc}
                      frameBorder="0"
                      allow="clipboard-write"
                      allowFullScreen
                      style={{ width: '100%', height: '100%' }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col">
                      <div className="p-2 flex items-center gap-2 border-b" style={{ borderColor: isDark ? 'rgba(71,85,105,0.6)' : '#e5e7eb' }}>
                        {['1m','5m','15m','30m'].map(tf => (
                          <Button
                            key={tf}
                            size="sm"
                            variant={tvTimeframe === tf ? 'default' : 'outline'}
                            onClick={() => setTvTimeframe(tf)}
                            className={tvTimeframe === tf ? 'bg-[#5854f4] hover:bg-[#4c46e8] text-white' : (isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-gray-300 text-gray-700 hover:bg-gray-100')}
                          >
                            {tf}
                          </Button>
                        ))}
                      </div>
                      <div ref={tvChartContainerRef} style={{ width: '100%', height: '100%' }} />
                    </div>
                  )}
                </div>
              </div>

              {/* Trade History */}
              <div className="space-y-3">
                <h3 className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-800'}`}>Trade History</h3>
                <div className={`rounded-xl border ${isDark ? 'border-slate-700/60 bg-slate-900/60' : 'border-gray-200 bg-white'}`}>
                  {/* Tabla con scroll horizontal en móvil */}
                  <div className="overflow-x-auto">
                    <div className="min-w-[600px]">
                      <div className={`grid grid-cols-5 gap-2 px-3 py-2 text-xs font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'} ${isDark ? '' : 'bg-gray-50'} border-b ${isDark ? 'border-slate-700/60' : 'border-gray-200'}`}>
                        <div className="min-w-[60px]">Type</div>
                        <div className="min-w-[120px]">Time</div>
                        <div className="min-w-[80px]">User</div>
                        <div className="min-w-[130px]">Amount (HAVEN)</div>
                        <div className="min-w-[90px]">Value (USD)</div>
                      </div>
                      <div className={isDark ? 'divide-slate-700/60 divide-y' : 'divide-gray-200 divide-y'}>
                        {pagedTrades.length === 0 ? (
                          <div className={`text-center text-sm px-4 py-6 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>No trades yet</div>
                        ) : (
                          pagedTrades.map((t, idx) => {
                            const isBuy = String(t?.type||'').toLowerCase()==='buy'
                            const time = (()=>{ 
                              try { 
                                const date = new Date((Number(t.timestamp)||0)*1000)
                                return date.toLocaleString(undefined, { 
                                  year: 'numeric', 
                                  month: '2-digit', 
                                  day: '2-digit', 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })
                              } catch { 
                                return String(t.timestamp||'') 
                              } 
                            })()
                            // Amount in HAVEN is ethIn (buy) or ethOut (sell)
                            const amountHaven = isBuy ? (t.ethIn ?? null) : (t.ethOut ?? null)
                            // Calculate USD value: amountHaven * havenUsd price
                            const valueUsd = amountHaven !== null ? (() => {
                              try {
                                const havenAmount = Number(amountHaven)
                                const price = Number.isFinite(havenUsd) ? havenUsd : 0
                                const usdValue = havenAmount * price
                                return Number.isFinite(usdValue) ? usdValue : null
                              } catch {
                                return null
                              }
                            })() : null
                            return (
                              <div key={idx} className={`grid grid-cols-5 gap-2 px-3 py-2 text-xs sm:text-sm ${isDark ? 'text-slate-300' : 'text-gray-800'}`}>
                                <div className={`min-w-[60px] ${isBuy ? 'text-green-500 font-semibold' : 'text-red-500 font-semibold'}`}>{isBuy ? 'Buy' : 'Sell'}</div>
                                <div className={`min-w-[120px] ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{time}</div>
                                <div className="min-w-[80px]">
                                  {t.user ? (
                                    <a href={explorerUrl(t.user)} target="_blank" rel="noopener noreferrer" className={`underline ${isDark ? 'text-slate-200' : 'text-gray-900'}`}>{shortAddr(t.user)}</a>
                                  ) : '—'}
                                </div>
                                <div className="min-w-[130px]">{amountHaven === null ? '—' : `${formatHavenPlain(amountHaven)} HAVEN`}</div>
                                <div className="min-w-[90px]">{valueUsd === null ? '—' : `${formatUsdPlain(valueUsd)}`}</div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Pagination */}
                  <div className={`flex items-center justify-between px-3 py-2 border-t ${isDark ? 'border-slate-700/60' : 'border-gray-200'}`}>
                    <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Page {tradePage} / {totalTradePages}</span>
                    <div className="space-x-2">
                      <Button size="sm" variant="outline" disabled={tradePage<=1} onClick={()=>setTradePage(p=>Math.max(1,p-1))} className={`${isDark ? 'border-slate-600 text-slate-300' : 'border-gray-300 text-gray-700'} h-7 px-2`}>Prev</Button>
                      <Button size="sm" variant="outline" disabled={tradePage>=totalTradePages} onClick={()=>setTradePage(p=>Math.min(totalTradePages,p+1))} className={`${isDark ? 'border-slate-600 text-slate-300' : 'border-gray-300 text-gray-700'} h-7 px-2`}>Next</Button>
                    </div>
                  </div>
                </div>
              </div>

                <div className="space-y-3">
                  <h3 className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-800'}`}>Trading</h3>
                  <div className={`flex space-x-1 rounded-lg p-1 ${isDark ? 'bg-slate-800/50' : 'bg-gray-100'}`}>
                    <Button size="sm" variant={tradeSide==='buy' ? 'default' : 'ghost'} onClick={() => setTradeSide('buy')} className={`flex-1 h-8 ${tradeSide==='buy' ? 'bg-[#5854f4] hover:bg-[#4c46e8] text-white' : (isDark ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200')}`}>Buy</Button>
                    <Button size="sm" variant={tradeSide==='sell' ? 'default' : 'ghost'} onClick={() => setTradeSide('sell')} className={`flex-1 h-8 ${tradeSide==='sell' ? 'bg-[#5854f4] hover:bg-[#4c46e8] text-white' : (isDark ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200')}`}>Sell</Button>
                  </div>
                  <div className="space-y-2">
                    <label className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                      Amount ({tradeSide==='buy' ? 'HAVEN' : (selectedRobot.token?.symbol || selectedRobot.ticker || 'TKN')})
                    </label>
                    {tradeSide==='buy' ? (
                      <>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          {[100, 250, 500].map((v) => (
                            <Button
                              key={v}
                              size="sm"
                              className={`${isDark ? 'border-[#5854f4] text-[#a5b4fc] hover:bg-[#5854f4] hover:text-white' : 'border-[#5854f4] text-[#5854f4] hover:bg-[#5854f4] hover:text-white'} border rounded-md`}
                              variant="outline"
                              onClick={() => setTradeAmount(String(v))}
                            >
                              {v}
                            </Button>
                          ))}
                        </div>
                        <input type="text" value={tradeAmount} onChange={handleTradeAmountChange} placeholder="100" className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`} />
                        <div className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                          Wallet: {(() => { try { const n = Number(formatUnits(xTokenBalRaw || 0n, xTokenDecimals || 18)); if (!Number.isFinite(n)) return '0.00'; if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M`; if (n >= 1_000) return `${(n/1_000).toFixed(2)}k`; return n.toFixed(2);} catch { return '0.00' } })()} HAVEN
                        </div>
                    {buyPreview.ethRequired > 0n && (
                          <div className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                            Est. cost: {formatEthAmount(buyPreview.ethRequired)} ETH (~{formatUsdValue(buyPreview.usdAmount)})
                            {buyPreview.tokensOut > 0n && (
                              <span className="ml-1">• Tokens: {formatTokenAmount(buyPreview.tokensOut, tokenDecimals)}</span>
                            )}
                          </div>
                        )}
                    {needsXTokenApprove && (
                      <div className={`text-xs mt-1 ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>
                        Approval required to spend HAVEN
                      </div>
                    )}
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          {[25,50,100].map((p) => (
                            <Button
                              key={p}
                              size="sm"
                              className={`${isDark ? 'border-[#5854f4] text-[#a5b4fc] hover:bg-[#5854f4] hover:text-white' : 'border-[#5854f4] text-[#5854f4] hover:bg-[#5854f4] hover:text-white'} border rounded-md`}
                              variant="outline"
                              disabled={tokenBalance===0n}
                              onClick={() => {
                                let tokens = (tokenBalance * BigInt(p)) / 100n
                                // For 100%, subtract a tiny amount to avoid "circulating supply" errors due to rounding
                                if (p === 100 && tokens > 0n) {
                                  const safetyMargin = tokens / 10000n // 0.01% safety margin
                                  tokens = tokens > safetyMargin ? tokens - safetyMargin : tokens
                                }
                                const txt = Number(formatUnits(tokens, tokenDecimals)).toFixed(2)
                                setTradeAmount(txt)
                              }}
                            >
                              {p}%
                            </Button>
                          ))}
                        </div>
                        <input type="text" value={tradeAmount} onChange={handleTradeAmountChange} placeholder="10.0" className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`} />
                        <div className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Your tokens: {Number(formatUnits(tokenBalance, tokenDecimals)).toFixed(2)}</div>
                        {sellPreview.xTokenOut > 0n && (
                          <div className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                            Est. proceeds: {(() => { try { const n = Number(formatUnits(sellPreview.xTokenOut, 18)); if (!Number.isFinite(n)) return '0 HAVEN'; if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M HAVEN`; if (n >= 1_000) return `${(n/1_000).toFixed(2)}k HAVEN`; return `${n.toFixed(2)} HAVEN`; } catch { return '0 HAVEN' } })()} (~{(() => { try { const hav = Number(formatUnits(sellPreview.xTokenOut, 18)); const usd = hav * (Number.isFinite(havenUsd) ? havenUsd : 0); if (!Number.isFinite(usd)) return '$0'; if (usd >= 1_000_000) return `$${Math.round(usd/1_000_000)}M`; if (usd >= 1_000) return `$${Math.round(usd/1_000)}K`; return `$${usd.toFixed(2)}`;} catch { return '$0' } })()})
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <Button
                      size="default"
                      disabled={tradeSide === 'buy'
                        ? (!isWalletConnected || !isTradeAmountValid || isBuying || insufficientXToken)
                        : (!isWalletConnected || !isTradeAmountValid || isSelling || (tokenBalance === 0n && !needsApproval))}
                      onClick={async () => {
                        if (tradeSide === 'buy') {
                          if (needsXTokenApprove && selectedRobot?.contractAddress) {
                            try {
                              const { simulateContract, writeContract, waitForTransactionReceipt } = await import('@wagmi/core')
                              const erc20ApproveAbi = [
                                { type:'function', name:'approve', stateMutability:'nonpayable', inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}], outputs:[{name:'',type:'bool'}] }
                              ]
                              const maxUint = (2n ** 256n) - 1n
                              const sim = await simulateContract(wagmiConfig, { abi: erc20ApproveAbi, address: CONTRACTS.xtoken.address, functionName: 'approve', args: [selectedRobot.contractAddress, maxUint] })
                              const tx = await writeContract(wagmiConfig, sim.request)
                              addToast('Approving HAVEN...', 'info', 15000)
                              await waitForTransactionReceipt(wagmiConfig, { hash: tx })
                              addToast('HAVEN approved', 'success')
                              // Refresh allowance
                              try {
                                const { readContract } = await import('@wagmi/core')
                                const allow = await readContract(wagmiConfig, { abi: [{type:'function',name:'allowance',stateMutability:'view',inputs:[{name:'owner',type:'address'},{name:'spender',type:'address'}],outputs:[{name:'',type:'uint256'}]}], address: CONTRACTS.xtoken.address, functionName: 'allowance', args: [walletAddress, selectedRobot.contractAddress] })
                                setXTokenAllowanceRaw(BigInt(allow || 0n))
                              } catch {}
                            } catch (err) {
                              addToast(err?.shortMessage || err?.message || 'Approve failed', 'error')
                              return
                            }
                          }
                          await handleBuyTokens()
                        } else {
                          await handleSellTokens()
                        }
                      }}
                      className={`w-full h-12 ${tradeSide==='buy' ? (isDark ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-green-700 hover:bg-green-800 text-white') : (isDark ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-red-700 hover:bg-red-800 text-white')} `}
                    >
                      {tradeSide==='buy'
                        ? (isBuying
                            ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Processing...</>
                            : (insufficientEth
                                ? 'Insufficient ETH'
                                : (needsXTokenApprove
                                    ? 'Approve HAVEN'
                                    : (buyPreview.tokensOut > 0n
                                        ? `Buy (~${formatTokenAmount(buyPreview.tokensOut, tokenDecimals)} ${tokenSymbol})`
                                        : 'Buy'))))
                        : (isSelling
                            ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Processing...</>
                            : (needsApproval
                                ? 'Approve'
                                : (sellPreview.ethOut > 0n
                                    ? `Sell (~${formatUsdValue(sellPreview.usdOut)} / ${formatEthAmount(sellPreview.ethOut)} ETH)`
                                    : 'Sell')))}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-[2fr_3fr] gap-6">
                <div className="space-y-3">
                    <h3 className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-800'}`}>Robot Status</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {/* Static fields */}
                      <div>
                        <span className={`${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Token:</span>
                        <p className="text-[#5854f4] font-bold">{selectedRobot.token?.symbol || 'TKN'}</p>
                      </div>
                      <div>
                        <span className={`${isDark ? 'text-slate-400' : 'text-gray-600'}`}>State:</span>
                        <p className={`font-medium ${
                          normalizedState === 'idle'
                            ? 'text-green-600'
                            : 'text-cyan-600'
                        }`}>{statusLabel}</p>
                      </div>
                      {!isAgent && (
                        <div>
                          <span className={`${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Simulation ID:</span>
                          <p className={`${isDark ? 'text-slate-300' : 'text-gray-800'} font-medium`}>{simulationIdentifier || 'X'}</p>
                        </div>
                      )}

                      {!isAgent && (
                        <div>
                          <span className={`${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Battery:</span>
                          <div className="flex items-center space-x-2">
                            <Zap className={`h-4 w-4 ${batteryColor}`} />
                            <span className={`font-medium ${batteryColor}`}>{batteryLevel}%</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Dynamic fields from status */}
                      {(() => {
                        // statusInfo has all fields at root level from getStatus response
                        const data = statusInfo || {}
                        // Only exclude metadata fields, show everything else
                        const excludeFields = new Set([
                          'battery', 'command_list', 'device_node',
                          'simulation_id', 'id', 'created_at', 'updated_at', 'object_list',
                          'parent_device_node', 'wallet', 'position', 'status', 'state'
                        ])
                        // For agents, also exclude robot-specific simulation fields
                        if (isAgent) {
                          excludeFields.add('speed')
                          excludeFields.add('size')
                          excludeFields.add('collision')
                          excludeFields.add('abilities')
                          excludeFields.add('sensors')
                        }
                        const dynamicFields = []

                        // Collect all top-level fields
                        Object.keys(data).forEach(key => {
                          if (excludeFields.has(key)) return
                          const value = data[key]
                          
                          // Format value for display
                          let displayValue = '—'
                          if (Array.isArray(value)) {
                            // If it's a single-element array, show just the value
                            if (value.length === 1) {
                              displayValue = String(value[0])
                            } else if (value.length === 2 && key === 'position') {
                              displayValue = `[${value[0]}, ${value[1]}]`
                            } else if (value.length === 2 && key === 'size') {
                              displayValue = `${value[0]} × ${value[1]}`
                            } else {
                              displayValue = value.join(', ')
                            }
                          } else if (typeof value === 'object' && value !== null) {
                            // For sensors objects, show the keys
                            const keys = Object.keys(value)
                            if (keys.length > 0) {
                              displayValue = keys.join(', ')
                            } else {
                              displayValue = 'None'
                            }
                          } else if (typeof value === 'boolean') {
                            displayValue = value ? 'Yes' : 'No'
                          } else if (value !== null && value !== undefined) {
                            displayValue = String(value)
                          }
                          
                          dynamicFields.push({ key, value: displayValue })
                        })
                        
                        return dynamicFields.map(({ key, value }) => (
                          <div key={key}>
                            <span className={`${isDark ? 'text-slate-400' : 'text-gray-600'} capitalize`}>
                              {key.replace(/_/g, ' ').replace('status.', '')}:
                            </span>
                            <p className={`${isDark ? 'text-slate-300' : 'text-gray-800'} font-medium`}>
                              {value}
                            </p>
                          </div>
                        ))
                      })()}
                      
                    </div>
                  </div>
                  <div className="space-y-6">
                  {!isAgent && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-800'}`}>Map <span className={`${isDark ? 'text-slate-400' : 'text-gray-600'}`}>({`X: ${posLabelX}, Y: ${posLabelY}`})</span></h3>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" onClick={zoomOut} className={`${isDark ? 'border-slate-600 text-slate-300' : 'border-gray-300 text-gray-700'} h-7 px-2`} title="Zoom out"><MinusIcon className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" onClick={zoomIn} className={`${isDark ? 'border-slate-600 text-slate-300' : 'border-gray-300 text-gray-700'} h-7 px-2`} title="Zoom in"><PlusIcon className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" onClick={centerOnRobot} className={`${isDark ? 'border-slate-600 text-slate-300' : 'border-gray-300 text-gray-700'} h-7 px-2`} title="Center on robot"><Crosshair className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  {(() => {
                    const mapSize = 20
                    const posFromSim = statusInfo?.position
                    const sx = Array.isArray(posFromSim) ? posFromSim[0] : posFromSim?.x
                    const sy = Array.isArray(posFromSim) ? posFromSim[1] : posFromSim?.y
                    const rxFromRobot = selectedRobot?.position?.x
                    const ryFromRobot = selectedRobot?.position?.y
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
                        // Scale by cells: 1 cell = 100 / mapSize percent
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
                    const gridColor = isDark ? 'rgba(71,85,105,0.35)' : 'rgba(203,213,225,0.7)'
                    const bgStyle = {
                      backgroundImage: `linear-gradient(${gridColor} 1px, transparent 1px), linear-gradient(90deg, ${gridColor} 1px, transparent 1px)`,
                      backgroundSize: `${100 / mapSize}% ${100 / mapSize}%`,
                      backgroundPosition: '0 0',
                    }
                    return (
                        <div ref={mapOuterRef} className={`relative rounded-xl overflow-auto ${isDark ? 'border border-slate-700/60 bg-slate-900/40' : 'border border-gray-200 bg-white'} w-full`}>
                          <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
                            <div ref={mapInnerRef} className="absolute top-0 left-0 overflow-hidden" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
                              <div className="absolute inset-0 z-0" style={bgStyle} />
                              <div className="absolute inset-0 z-10">
                              {/* Render objects */}
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
                            <div className={`w-full h-full rounded-full overflow-hidden ring-2 ${collision ? 'ring-red-500' : (isDark ? 'ring-slate-300/40' : 'ring-white')} shadow`}>
                                <img src={safeImageUrl(selectedRobot.image)} alt="robot" className="h-full w-full object-cover" />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                    </div>
                  )}
                </div>
                {!isAgent && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-800'}`}>Command List</h3>
                    {(() => {
                      const customCount = (commands || []).filter(c => !DEFAULT_COMMANDS.includes(c)).length
                      if (customCount <= 0) return null
                      return (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowCustomCommands(v => !v)}
                          className={`${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'} h-8 px-2`}
                        >
                          <span className="text-xs mr-1">{showCustomCommands ? 'Hide custom commands' : 'Show custom commands'}</span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${showCustomCommands ? 'rotate-180' : ''}`} />
                        </Button>
                      )
                    })()}
                  </div>
                </div>
                )}
                {!isAgent && ((!simulationIdentifier || simulationIdentifier === 'X') ? (
                    <div className={`p-5 rounded-xl border text-center ${isDark ? 'border-slate-700/60 bg-slate-900/60' : 'border-gray-200 bg-gray-50'}`}>
                      <p className={`${isDark ? 'text-slate-400' : 'text-gray-600'} mb-3`}>Start a simulation to enable controls</p>
                      <Button
                        size="sm"
                        disabled={!isWalletConnected || isStartingSimulation}
                        onClick={async () => {
                          if (!isWalletConnected || !walletAddress || !deviceNode) return
                        setIsStartingSimulation(true)
                        try {
                          const loadResult = await RobotApi.loadSimulation('sim', { device_node: deviceNode, wallet: walletAddress })

                          // Use loadSimulation response directly if it has simulation_id
                          if (loadResult?.simulation_id) {
                            // Get full status details
                            const status = await RobotApi.getStatus(loadResult.simulation_id, deviceNode).catch(() => null)

                            // Use only fresh status data
                            const merged = {
                              device_node: deviceNode,
                              simulation_id: loadResult.simulation_id,
                              ...(status || {})
                            }
                            setStatusInfo(merged)
                            updateSimulation(walletAddress, deviceNode, merged)
                            addToast('Simulation started', 'success')
                          } else {
                            // Fallback: sync simulations and find match
                            const sims = typeof onSyncSimulations === 'function' ? await onSyncSimulations() : []
                            const match = Array.isArray(sims)
                              ? sims.find((s) => (s.device_node || s.parent_device_node) === deviceNode)
                              : null
                            if (match) {
                              const merged = { device_node: deviceNode, ...match }
                              setStatusInfo(merged)
                              updateSimulation(walletAddress, deviceNode, merged)
                              addToast('Simulation started', 'success')
                            }
                          }
                        } catch (err) {
                          addToast('Failed to start simulation', 'error')
                        } finally {
                          setIsStartingSimulation(false)
                        }
                        }}
                        className="bg-[#5854f4] hover:bg-[#4c46e8] text-white"
                      >
                        {isStartingSimulation ? (
                          <span className="inline-flex items-center">
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Starting...
                          </span>
                        ) : (
                          'Start Simulation'
                        )}
                      </Button>
                      {isStartingSimulation && (
                        <div className={`mt-3 text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`} aria-live="polite" aria-busy="true">
                          Initializing simulation. This may take a few seconds...
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2" style={{ position: 'relative', zIndex: 10, pointerEvents: 'auto' }}>
                      {DEFAULT_COMMANDS.map((command) => {
                        const Icon = COMMAND_ICONS[command] || Send
                        const isSelected = selectedCommand === command
                        if (command === 'Move Up One Step') {
                          console.log('[Button Render] Move Up One Step - selectedCommand:', selectedCommand, 'isSelected:', isSelected)
                        }
                        return (
                          <Button
                            key={command}
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              console.log('[RobotModal] Command clicked:', command)
                              handleCommandSelect(command)
                            }}
                            title={command}
                            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                            className={`justify-start h-10 transition-all duration-300 transform min-w-0 ${
                              isSelected
                                ? 'bg-gradient-to-r from-[#5854f4] to-[#7c3aed] hover:from-[#4c46e8] hover:to-[#6d28d9] text-white shadow-lg'
                                : isDark
                                  ? 'border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                                  : 'bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-700 border border-gray-300'
                            }`}
                          >
                            <Icon className="mr-2 h-4 w-4 flex-shrink-0" />
                            <span className="text-xs block truncate" style={{maxWidth:'10rem'}}>{command}</span>
                          </Button>
                        )
                      })}

                      {showCustomCommands && (commands || []).some(c => !DEFAULT_COMMANDS.includes(c)) && (
                        <div className="col-span-2 flex items-center my-1">
                          <div className={`${isDark ? 'bg-slate-700/60' : 'bg-gray-300'} h-px flex-1`} />
                          <span className={`text-xs mx-2 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Custom commands</span>
                          <div className={`${isDark ? 'bg-slate-700/60' : 'bg-gray-300'} h-px flex-1`} />
                        </div>
                      )}

                      {showCustomCommands && (commands || []).filter(c => !DEFAULT_COMMANDS.includes(c)).map((command) => {
                        const Icon = COMMAND_ICONS[command] || Send
                        const isSelected = selectedCommand === command
                        return (
                          <Button
                            key={command}
                            size="sm"
                            onClick={() => handleCommandSelect(command)}
                            title={command}
                            className={`justify-start h-10 transition-all duration-300 transform min-w-0 ${
                              isSelected
                                ? 'bg-gradient-to-r from-[#5854f4] to-[#7c3aed] hover:from-[#4c46e8] hover:to-[#6d28d9] text-white shadow-lg'
                                : isDark
                                  ? 'border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                                  : 'bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-700 border border-gray-300'
                            }`}
                          >
                            <Icon className="mr-2 h-4 w-4 flex-shrink-0" />
                            <span className="text-xs block truncate" style={{maxWidth:'10rem'}}>{command}</span>
                          </Button>
                        )
                      })}
                    </div>
                  ))}
              </div>

              {/* Command Input - Full width below grid */}
              <div className="space-y-3">
                <h3 className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-800'}`}>Command</h3>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="Enter command..."
                    value={customCommand}
                    onChange={(e) => {
                      setCustomCommand(e.target.value)
                      setSelectedCommand('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSendingCommand) {
                        handleSendCommand()
                      }
                    }}
                    className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${
                      isDark
                        ? 'bg-transparent border-slate-600 text-white placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                  <Button
                    size="sm"
                    onClick={handleSendCommand}
                    disabled={isSendingCommand || !isWalletConnected || !walletAddress || (isAgent ? false : (!simulationIdentifier || simulationIdentifier === 'X'))}
                    className={`bg-[#5854f4] hover:bg-[#4c46e8] text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 ${
                      (isSendingCommand || !isWalletConnected || !walletAddress) ? 'opacity-60 cursor-not-allowed hover:scale-100 hover:shadow-lg' : ''
                    }`}
                  >
                    {isSendingCommand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Terminal (read-only) - Full width below Command */}
              <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-800'}`}>Terminal</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setTerminalOutput(''); setTerminalDisplay(''); setIsTyping(false) }}
                  className={`${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-gray-300 text-gray-700 hover:bg-gray-100'} h-7 px-2`}
                >
                  Clear
                </Button>
              </div>
              <div className={`rounded-xl border ${isDark ? 'border-slate-700/60 bg-black/60' : 'border-gray-200 bg-gray-50'} overflow-hidden`}
                   role="log" aria-live="polite">
                <pre ref={terminalRef} className={`${isDark ? 'text-green-300' : 'text-green-700'} text-sm font-mono leading-relaxed whitespace-pre-wrap p-6 overflow-auto min-h-[500px] max-h-[800px]`}>
                  {terminalDisplay || (isTyping ? '' : 'Waiting for output…')}{isTyping ? '\u2589' : ''}
                </pre>
              </div>
              </div>
            </div>
                )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Wrap with React.memo to prevent re-renders when parent re-renders
export const RobotModal = React.memo(RobotModalComponent)