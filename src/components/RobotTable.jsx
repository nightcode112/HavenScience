import { useState, useMemo, useEffect, useRef } from "react"
import { Button } from "./ui/button"
import { RobotFilters } from "./RobotFilters"
import { Pagination } from "./Pagination"
import { Search, Copy } from "lucide-react"
import { safeImageUrl, shortAddress } from "../lib/utils"
import { useToast } from "./Toast"
import { useTheme } from "../context/ThemeContext"
import { useRobotStats } from "../context/RobotStatsContext"
import { readContract, readContracts, watchContractEvent } from '@wagmi/core'
import { config as wagmiConfig } from '../wagmi'
import TokenAbi from '../contracts/abis/FullBondingCurveERC20XToken.json'
import { formatUnits } from 'viem'

const ROBOTS_PER_PAGE_TABLE = 12

export function RobotTable({
  selectedRobot,
  onRobotSelect,
  quickBuyAmount,
  onQuickBuyAmountChange,
  view,
  onViewChange,
  onQuickBuy,
  robots,
  isWalletConnected,
  onTradeComplete, // Callback to notify parent when a trade completes (contractAddress)
  quickBuyMode,
  onQuickBuyModeChange,
}) {
  const { addToast } = useToast()
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('new')
  const [currentPage, setCurrentPage] = useState(1)
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const { havenUsd, setTokenStatsFor } = useRobotStats()

  const [statsByAddress, setStatsByAddress] = useState({})
  const unsubsRef = useRef({})
  const debounceRef = useRef({})
  const refreshIntervalRef = useRef(null)
  const lastBatchKeyRef = useRef('')
  const lastBatchTimeRef = useRef(0)

  const source = useMemo(() => (Array.isArray(robots) && robots.length > 0 ? robots : []), [robots])

  const toBigIntSafe = (value) => {
    try { return typeof value === 'bigint' ? value : BigInt(value || 0) } catch { return 0n }
  }

  const toUsdNumber = (value) => {
    try {
      const amount = Number(formatUnits(toBigIntSafe(value), 18))
      // value is in HAVEN units; multiply by havenUsd to get USD
      const usd = amount * (Number.isFinite(havenUsd) ? havenUsd : 0)
      return Number.isFinite(usd) ? usd : 0
    } catch {
      return 0
    }
  }

  const toProgressValue = (value, isGraduated) => {
    if (isGraduated) return 100
    try {
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) return 0
        return Math.max(0, Math.min(100, value))
      }
      if (typeof value === 'bigint') {
        return Math.max(0, Math.min(100, Number(value)))
      }
      const num = Number(value ?? 0)
      if (!Number.isFinite(num)) return 0
      return Math.max(0, Math.min(100, num))
    } catch {
      return 0
    }
  }

  const getStatsFor = (robot) => {
    if (!robot?.contractAddress) return {}
    return statsByAddress[robot.contractAddress] || {}
  }

  const filteredAndSortedRobots = useMemo(() => {
    let filtered = source.filter(robot => {
      const name = String(robot.name || '').toLowerCase()
      const ticker = String(robot.ticker || robot.token?.symbol || '').toLowerCase()
      const term = searchTerm.toLowerCase()
      return name.includes(term) || ticker.includes(term)
    })

    // When sorting by "new", reverse the original order
    if (sortBy === 'new') {
      filtered.reverse()
    } else {
      filtered.sort((a, b) => {
        const aStats = getStatsFor(a)
        const bStats = getStatsFor(b)
        switch (sortBy) {
          case 'marketcap': {
            const diff = toUsdNumber(bStats.marketCapUSD) - toUsdNumber(aStats.marketCapUSD)
            if (diff !== 0) return diff
            break
          }
          case 'progress':
          default: {
            const diff = toProgressValue(bStats.progressPercent, bStats.isGraduated) - toProgressValue(aStats.progressPercent, aStats.isGraduated)
            if (diff !== 0) return diff
            break
          }
        }
        return String(b.id || '').localeCompare(String(a.id || ''))
      })
    }

    return filtered
  }, [source, searchTerm, sortBy, statsByAddress])

  // Calcular paginación
  const totalPages = Math.ceil(filteredAndSortedRobots.length / ROBOTS_PER_PAGE_TABLE)
  const startIndex = (currentPage - 1) * ROBOTS_PER_PAGE_TABLE
  const endIndex = startIndex + ROBOTS_PER_PAGE_TABLE
  const currentRobots = filteredAndSortedRobots.slice(startIndex, endIndex)

  // Reset página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, sortBy])

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const copyAddress = (address) => {
    navigator.clipboard.writeText(address)
    addToast('Contract address copied!', 'success')
  }

  const handleQuickBuy = async (robot, e) => {
    e.stopPropagation()
    if (!isWalletConnected) return
    try {
      await onQuickBuy(robot, quickBuyAmount)
      // Refresh stats after buy completes
      if (robot?.contractAddress) {
        setTimeout(() => refreshStats(robot.contractAddress), 2000)
      }
    } catch (err) {
      // Error already handled in parent
    }
  }

  // On-chain stats for visible robots only
  const refreshStats = async (address) => {
    if (!address) return
    try {
      const tokenStats = await readContract(wagmiConfig, {
        abi: TokenAbi,
        address,
        functionName: 'getTokenStats',
        args: [],
      }).catch(() => null)
      // eslint-disable-next-line no-console
      console.log('[RobotTable] getTokenStats', { address, tokenStats })
      
      // tokenStats is a struct/object, not an array - access by property name
      const stats = {
        targetUSD: toBigIntSafe(tokenStats?.targetUSD ?? 0n),
        poolBalanceUSD: toBigIntSafe(tokenStats?.poolBalanceUSD ?? 0n),
        poolBalanceETH: toBigIntSafe(tokenStats?.poolBalanceETH ?? 0n),
        totalTx: toBigIntSafe(tokenStats?.totalTx ?? 0n),
        progressPercent: toBigIntSafe(tokenStats?.progressPercent ?? 0n),
        isGraduated: Boolean(tokenStats?.isGraduated ?? false),
        currentPriceUSD: toBigIntSafe(tokenStats?.currentPriceUSD ?? 0n),
        // Use XToken-based metrics and convert with havenUsd
        marketCapUSD: toBigIntSafe(tokenStats?.marketCapXToken ?? 0n),
        uniswapV2Pair: typeof tokenStats?.uniswapV2Pair === 'string' ? tokenStats.uniswapV2Pair : '0x0000000000000000000000000000000000000000',
        volume24h: toBigIntSafe(tokenStats?.volume24h ?? 0n),
        priceChangePercent24h: toBigIntSafe(tokenStats?.priceChangePercent24h ?? 0n),
      }
      setStatsByAddress((prev) => ({
        ...prev,
        [address]: stats,
      }))
      setTokenStatsFor(address, stats)
    } catch {
      // ignore
    }
  }

  const batchRefreshStats = async (addresses) => {
    const unique = Array.from(new Set((addresses || []).filter(Boolean)))
    if (unique.length === 0) return
    try {
      const contracts = unique.map((addr) => ({
        abi: TokenAbi,
        address: addr,
        functionName: 'getTokenStats',
        args: [],
      }))
      const results = await readContracts(wagmiConfig, { contracts }).catch(() => null)
      if (!results) return
      const next = {}
      unique.forEach((addr, index) => {
        const tokenStats = results[index]?.result
        // eslint-disable-next-line no-console
        console.log('[RobotTable] getTokenStats(batch)', { address: addr, tokenStats })
        // tokenStats is a struct/object, not an array - access by property name
        const stats = {
          targetUSD: toBigIntSafe(tokenStats?.targetUSD ?? 0n),
          poolBalanceUSD: toBigIntSafe(tokenStats?.poolBalanceUSD ?? 0n),
          poolBalanceETH: toBigIntSafe(tokenStats?.poolBalanceETH ?? 0n),
          totalTx: toBigIntSafe(tokenStats?.totalTx ?? 0n),
          progressPercent: toBigIntSafe(tokenStats?.progressPercent ?? 0n),
          isGraduated: Boolean(tokenStats?.isGraduated ?? false),
          currentPriceUSD: toBigIntSafe(tokenStats?.currentPriceUSD ?? 0n),
          marketCapUSD: toBigIntSafe(tokenStats?.marketCapXToken ?? 0n),
          uniswapV2Pair: typeof tokenStats?.uniswapV2Pair === 'string' ? tokenStats.uniswapV2Pair : '0x0000000000000000000000000000000000000000',
          volume24h: toBigIntSafe(tokenStats?.volume24h ?? 0n),
          priceChangePercent24h: toBigIntSafe(tokenStats?.priceChangePercent24h ?? 0n),
        }
        next[addr] = stats
        setTokenStatsFor(addr, stats)
      })
      setStatsByAddress((prev) => ({ ...prev, ...next }))
    } catch {
      // ignore batch errors
    }
  }

  // Register refresh callback with parent
  useEffect(() => {
    if (onTradeComplete) {
      onTradeComplete((contractAddress) => {
        // Refresh stats for the traded robot after 2 seconds
        setTimeout(() => refreshStats(contractAddress), 2000)
      })
    }
  }, [onTradeComplete])

  // Periodic refresh logic: every 5s for current page, or only selected robot if modal is open
  useEffect(() => {
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
      refreshIntervalRef.current = null
    }

    const visible = currentRobots
      .map(r => r?.contractAddress)
      .filter(Boolean)

    // Fetch initial stats (batch) with de-dupe to avoid StrictMode double-invoke
    const key = (visible || []).join('|')
    const now = Date.now()
    const recentDuplicate = lastBatchKeyRef.current === key && (now - lastBatchTimeRef.current) < 1500
    if (!recentDuplicate) {
      batchRefreshStats(visible)
      lastBatchKeyRef.current = key
      lastBatchTimeRef.current = now
    }

    // Set up 5-second refresh interval
    refreshIntervalRef.current = setInterval(() => {
      if (selectedRobot?.contractAddress) {
        // If modal is open, only refresh that robot
        refreshStats(selectedRobot.contractAddress)
      } else {
        // Otherwise refresh all visible robots
        batchRefreshStats(visible)
      }
    }, 5000)

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
    }
  }, [currentRobots.map(r => r?.contractAddress).join('|'), selectedRobot?.contractAddress])

  // When modal closes, refresh all visible robots immediately
  useEffect(() => {
    if (!selectedRobot) {
      const visible = currentRobots
        .map(r => r?.contractAddress)
        .filter(Boolean)
      if (visible.length > 0) {
        batchRefreshStats(visible)
      }
    }
  }, [selectedRobot])

  const formatUsdCompact = (value) => {
    const amount = toUsdNumber(value)
    if (!Number.isFinite(amount)) return '$0'
    if (amount >= 1_000_000) return `$${Math.round(amount / 1_000_000)}M`
    if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`
    return `$${Math.round(amount)}`
  }
  const formatUsd = (value) => {
    const amount = toUsdNumber(value)
    if (amount >= 1) return `$${amount.toFixed(2)}`
    if (amount === 0) return '$0.00'
    if (amount >= 0.01) return `$${amount.toFixed(2)}`
    if (amount >= 0.0001) return `$${amount.toFixed(4)}`
    return `$${amount.toExponential(2)}`
  }
  const formatPercent = (value) => {
    const raw = Number(value)
    if (!Number.isFinite(raw)) return '—'
    const pct = raw / 100
    const sign = pct > 0 ? '+' : ''
    return `${sign}${pct.toFixed(2)}%`
  }
  const formatQuickBuyLabel = (value, mode) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value)
    if (!Number.isFinite(num) || num <= 0) return mode === 'eth' ? 'Ξ0' : '0'
    
    if (mode === 'eth') {
      // Format ETH values - compact with Ξ symbol
      if (num >= 1) return `Ξ${parseFloat(num.toFixed(2))}`
      if (num >= 0.01) return `Ξ${parseFloat(num.toFixed(3))}`
      return `Ξ${parseFloat(num.toFixed(4))}`
    } else {
      // HAVEN amounts - compact without currency symbol
      if (num >= 1000) return `${(num/1000).toFixed(1)}k`
      if (num >= 100) return `${num.toFixed(0)}`
      return `${parseFloat(num.toFixed(1))}`
    }
  }
  const formatProgress = (progressPercent, isGraduated) => {
    if (isGraduated) return '100.00%'
    const value = toProgressValue(progressPercent, false)
    return `${value.toFixed(2)}%`
  }

  return (
    <div className="space-y-6">
      {/* Filters integrados */}
      <RobotFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        sortBy={sortBy}
        setSortBy={setSortBy}
        quickBuyAmount={quickBuyAmount}
        onQuickBuyAmountChange={onQuickBuyAmountChange}
        view={view}
        onViewChange={onViewChange}
        quickBuyMode={quickBuyMode}
        onQuickBuyModeChange={onQuickBuyModeChange}
      />

      {/* Desktop Table */}
      <div
        className={`hidden md:block border rounded-xl shadow-lg overflow-hidden ${
          isDark
            ? 'bg-slate-900/80 border-slate-700/60'
            : 'glass-card'
        }`}
      >
        {/* Table Header */}
        <div
          className={`grid grid-cols-12 gap-4 p-4 border-b text-sm font-medium ${
            isDark
              ? 'border-slate-700/60 text-slate-300'
              : 'border-gray-200 text-gray-700 bg-gray-50'
          } ${isDark ? '' : ''}`}
        >
          <div className="col-span-3">Robot</div>
          <div className="col-span-2">Progress</div>
          <div className="col-span-2">FDV</div>
          <div className="col-span-2">Volume</div>
          <div className="col-span-2">24h Change</div>
          <div className="col-span-1">Buy</div>
        </div>

        {/* Table Body */}
        <div className={`divide-y ${isDark ? 'divide-slate-700/60' : 'divide-gray-200'}`}>
          {currentRobots.map((robot) => {
            const contractAddress = robot?.contractAddress
            const stats = contractAddress ? (statsByAddress[contractAddress] || {}) : {}
            return (
            <div
              key={robot.id}
              className={`grid grid-cols-12 gap-4 p-4 transition-colors cursor-pointer ${
                isDark
                  ? 'hover:bg-slate-800/50'
                  : 'hover:bg-gray-50'
              } ${selectedRobot?.id === robot.id ? (isDark ? 'bg-[#5854f4]/10 border-l-4 border-l-[#5854f4]' : 'bg-[#5854f4]/10 border-l-4 border-l-[#5854f4]') : ''}`}
              onClick={() => onRobotSelect(robot)}
            >
              {/* Robot Info */}
              <div className="col-span-3 flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                  <img
                    src={safeImageUrl(robot.image)}
                    alt={robot.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className={`${isDark ? 'text-white' : 'text-gray-900'} font-medium`}>{robot.name}</h3>
                  <span className={`${isDark ? 'text-slate-400' : 'text-gray-600'} text-sm`}>{robot.ticker || robot.device_node || 'X'}</span>
                  <div className="flex items-center space-x-2 mt-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                          if (contractAddress) copyAddress(contractAddress)
                      }}
                      className={`text-xs flex items-center space-x-1 ${
                        isDark
                          ? 'text-slate-500 hover:text-slate-300'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                        <span>{contractAddress ? shortAddress(contractAddress) : '—'}</span>
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>

                {/* Progress */}
              <div className="col-span-2 flex items-center">
                <span className={`${isDark ? 'text-slate-400' : 'text-gray-600'} text-sm`}>
                    {contractAddress && stats.progressPercent !== undefined
                      ? formatProgress(stats.progressPercent, stats.isGraduated)
                      : (robot.progress ?? '—')}
                </span>
              </div>

              {/* FDV */}
              <div className="col-span-2 flex items-center">
                <span className={`${isDark ? 'text-white' : 'text-gray-900'} font-medium`}>
                    {contractAddress && stats.marketCapUSD !== undefined
                      ? formatUsdCompact(stats.marketCapUSD)
                      : (robot.fdv || '—')}
                  </span>
                </div>

                {/* Volume */}
                <div className="col-span-2 flex items-center">
                  <span className={`${isDark ? 'text-slate-300' : 'text-gray-700'} font-medium`}>
                    {contractAddress && stats.volume24h !== undefined
                      ? formatUsdCompact(stats.volume24h)
                      : '—'}
                </span>
              </div>

              {/* 24h Change (percent from basis points) */}
              <div className="col-span-2 flex items-center">
                {contractAddress && stats.priceChangePercent24h !== undefined ? (
                  <span className={`font-medium ${
                    Number(stats.priceChangePercent24h) > 0
                      ? 'text-green-500'
                      : Number(stats.priceChangePercent24h) < 0
                      ? 'text-red-500'
                      : (isDark ? 'text-slate-300' : 'text-gray-700')
                  }`}>
                    {formatPercent(stats.priceChangePercent24h)}
                  </span>
                ) : (
                  <span className={`${isDark ? 'text-slate-300' : 'text-gray-700'} font-medium`}>—</span>
                )}
              </div>

              {/* Quick Buy Button */}
              <div className="col-span-1 flex items-center">
                <Button
                  size="sm"
                  onClick={(e) => handleQuickBuy(robot, e)}
                  disabled={!isWalletConnected}
                  className={`bg-gradient-to-r from-[#5854f4] to-[#7c3aed] hover:from-[#4c46e8] hover:to-[#6d28d9] text-white pl-3 pr-4 py-1 h-8 rounded-lg flex items-center space-x-2 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 ${
                    !isWalletConnected ? 'opacity-60 cursor-not-allowed hover:scale-100 hover:shadow-lg' : ''
                  }`}
                >
                  <img src="/assets/IconHaven.svg" alt="HAVEN" className="h-6 w-6" />
                    <span className="text-xs">{formatQuickBuyLabel(quickBuyAmount, quickBuyMode)}</span>
                </Button>
              </div>
            </div>
            )
          })}
        </div>
      </div>

      {/* Mobile List */}
      <div className="md:hidden space-y-3">
        {currentRobots.map((robot) => {
          const contractAddress = robot?.contractAddress
          const stats = contractAddress ? (statsByAddress[contractAddress] || {}) : {}
          return (
          <div
            key={robot.id}
            className={`border rounded-xl p-4 shadow-lg cursor-pointer transition-all ${
              isDark
                  ? 'bg-slate-900/80 border-slate-700/60 hover:bg-slate-800/50'
                : 'bg-white border-gray-200 hover:shadow-xl hover:bg-gray-50'
            } ${selectedRobot?.id === robot.id ? 'border-[#5854f4] bg-[#5854f4]/10' : ''}`}
            onClick={() => onRobotSelect(robot)}
          >
            {/* Robot Header */}
            <div className="flex items-center space-x-3 mb-3">
              <div className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <img
                  src={safeImageUrl(robot.image)}
                  alt={robot.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1">
                <h3 className={`${isDark ? 'text-white' : 'text-gray-900'} font-medium`}>{robot.name}</h3>
                <span className={`${isDark ? 'text-slate-400' : 'text-gray-600'} text-sm`}>{robot.ticker || 'X'}</span>
              </div>
              <div className="text-right">
                <div className={`${isDark ? 'text-white' : 'text-gray-900'} font-medium`}>
                    {contractAddress && stats.marketCapUSD !== undefined
                      ? formatUsdCompact(stats.marketCapUSD)
                      : (robot.fdv || '—')}
                  </div>
                  <div className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    {contractAddress && stats.progressPercent !== undefined
                      ? formatProgress(stats.progressPercent, stats.isGraduated)
                      : (robot.progress ?? '—')}
                </div>
              </div>
            </div>

              {/* Volume y 24h Change */}
            <div className={`flex justify-between items-center text-sm mb-3 ${isDark ? 'text-slate-400' : ''}`}>
              <div>
                <span className={isDark ? 'text-slate-400' : 'text-gray-600'}>Volume:</span>
                <span className={`${isDark ? 'text-slate-300' : 'text-gray-700'} ml-2`}>
                    {contractAddress && stats.volume24h !== undefined
                      ? formatUsdCompact(stats.volume24h)
                      : '—'}
                </span>
              </div>
              <div>
                <span className={isDark ? 'text-slate-400' : 'text-gray-600'}>24h:</span>
                {contractAddress && stats.priceChangePercent24h !== undefined ? (
                  <span className={`ml-2 font-medium ${
                    Number(stats.priceChangePercent24h) > 0
                      ? 'text-green-500'
                      : Number(stats.priceChangePercent24h) < 0
                      ? 'text-red-500'
                      : (isDark ? 'text-slate-300' : 'text-gray-700')
                  }`}>
                    {formatPercent(stats.priceChangePercent24h)}
                  </span>
                ) : (
                  <span className={`${isDark ? 'text-slate-300' : 'text-gray-700'} ml-2`}>—</span>
                )}
              </div>
            </div>

            {/* Contract Address y Quick Buy en la misma línea */}
            <div className={`pt-3 flex justify-between items-center ${isDark ? 'border-t border-slate-700/60' : 'border-t border-gray-200'}`}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                    if (contractAddress) copyAddress(contractAddress)
                }}
                className={`text-xs flex items-center space-x-1 ${
                  isDark ? 'text-slate-500 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                  <span>{contractAddress ? shortAddress(contractAddress) : '—'}</span>
                <Copy className="h-3 w-3" />
              </button>

              <Button
                size="sm"
                onClick={(e) => handleQuickBuy(robot, e)}
                disabled={!isWalletConnected}
                className={`bg-gradient-to-r from-[#5854f4] to-[#7c3aed] hover:from-[#4c46e8] hover:to-[#6d28d9] text-white pl-3 pr-4 py-1 h-7 rounded-lg flex items-center space-x-2 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 ${
                  !isWalletConnected ? 'opacity-60 cursor-not-allowed hover:scale-100 hover:shadow-lg' : ''
                }`}
              >
                <img src="/assets/IconHaven.svg" alt="HAVEN" className="h-6 w-6" />
                <span className="text-xs">{formatQuickBuyLabel(quickBuyAmount, quickBuyMode)}</span>
              </Button>
            </div>
          </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}

      {/* No results */}
      {filteredAndSortedRobots.length === 0 && (
        <div className="text-center py-12">
          <div className={`${isDark ? 'text-slate-500' : 'text-gray-400'} mb-4`}>
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          </div>
          <h3 className={`text-lg font-medium ${isDark ? 'text-slate-400' : 'text-gray-700'} mb-2`}>No robots found</h3>
          <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>Try adjusting your search</p>
        </div>
      )}
    </div>
  )
}
