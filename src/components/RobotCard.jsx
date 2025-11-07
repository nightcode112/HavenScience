import { Card, CardContent, CardHeader } from "./ui/card"
import { Button } from "./ui/button"
import { MapPin, TrendingUp, Activity, Globe, Send, Twitter } from "lucide-react"
import { safeImageUrl } from "../lib/utils"
import { useTheme } from "../context/ThemeContext"
import { useRobotStats } from "../context/RobotStatsContext"
import { useEffect, useRef, useState } from 'react'
import { readContract, watchContractEvent } from '@wagmi/core'
import { formatUnits } from 'viem'
import { config as wagmiConfig } from '../wagmi'
import TokenAbi from '../contracts/abis/FullBondingCurveERC20XToken.json'

export function RobotCard({ robot, isSelected, onSelect, quickBuyAmount, onQuickBuy, isWalletConnected, refreshTrigger, quickBuyMode }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [curve, setCurve] = useState({ percent: 0, isGraduated: false })
  const unsubRef = useRef(null)
  const [chainStats, setChainStats] = useState({ marketCapUSD: null, volume24h: null })
  const { havenUsd } = useRobotStats()

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

  // Convertir status a Moving/Idle
  const getDisplayStatus = (status) => {
    return status === 'running' ? 'Moving' : 'Idle'
  }

  const getStatusDotClass = (status) => {
    return status === 'running'
      ? 'w-2 h-2 bg-orange-400 rounded-full flex-shrink-0'
      : 'w-2 h-2 bg-green-400 rounded-full flex-shrink-0'
  }

  // Color de batería según nivel
  const getBatteryColor = (battery) => {
    if (battery >= 70) return isDark ? 'text-green-400' : 'text-green-500'
    if (battery >= 30) return isDark ? 'text-yellow-400' : 'text-yellow-500'
    return isDark ? 'text-red-400' : 'text-red-500'
  }

  // FDV/MarketCap en USD aprox (HAVEN * havenUsd)
  const formatUsdCompact = (usdValue) => {
    if (usdValue === null || usdValue === undefined) return '—'
    try {
      const raw = typeof usdValue === 'bigint' ? usdValue : BigInt(usdValue || 0)
      const havenAmount = Number(formatUnits(raw, 18))
      const amount = havenAmount * (Number.isFinite(havenUsd) ? havenUsd : 0)
      if (!Number.isFinite(amount)) return '$0'
      if (amount >= 1_000_000) return `$${Math.round(amount / 1_000_000)}M`
      if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`
      return `$${Math.round(amount)}`
    } catch {
      return '$0'
    }
  }

  // Quick buy handler
  const handleQuickBuy = async (e) => {
    e.stopPropagation() // Prevenir que se abra el modal
    if (onQuickBuy) {
      try {
        await onQuickBuy(robot, quickBuyAmount)
        // Refresh this card's stats after 2 seconds
        if (robot?.contractAddress) {
          setTimeout(() => {
            const addr = robot.contractAddress
            refresh(addr)
          }, 2000)
        }
      } catch (err) {
        // Error already handled in parent
      }
    }
  }

  // Helper to manually refresh stats
  const refresh = async (addr) => {
    if (!addr) return
    try {
      const stats = await readContract(wagmiConfig, { abi: TokenAbi, address: addr, functionName: 'getTokenStats' }).catch(() => null)
      // eslint-disable-next-line no-console
      console.log('[RobotCard] getTokenStats', { address: addr, stats })
      const graduationProgress = await readContract(wagmiConfig, { abi: TokenAbi, address: addr, functionName: 'getGraduationProgress' }).catch(() => null)
      
      // stats is a struct/object, not an array - access by property name
      const progressPercent = stats?.progressPercent ?? 0n
      const isGraduated = stats?.isGraduated ?? false
      const marketCapUSD = stats?.marketCapXToken ?? 0n
      
      const progressSource = typeof graduationProgress === 'bigint' || typeof graduationProgress === 'number'
        ? graduationProgress
        : progressPercent
      const numericProgress = (() => {
        if (typeof progressSource === 'number') return progressSource
        if (typeof progressSource === 'bigint') return Number(progressSource)
        const fallback = Number(progressSource ?? 0)
        return Number.isFinite(fallback) ? fallback : 0
      })()
      const clamped = Math.max(0, Math.min(100, numericProgress))
      const graduated = Boolean(isGraduated) || clamped >= 100
      setCurve({ percent: graduated ? 100 : clamped, isGraduated: graduated })
      const volume24h = stats?.volume24h ?? 0n
      setChainStats({ marketCapUSD: typeof marketCapUSD === 'bigint' ? marketCapUSD : null, volume24h: typeof volume24h === 'bigint' ? volume24h : null })
    } catch {
      setCurve({ percent: 0, isGraduated: false })
      setChainStats({ marketCapUSD: null })
    }
  }

  // Bonding curve progress from contract
  useEffect(() => {
    let cancelled = false
    const addr = robot?.contractAddress
    if (!addr) {
      setCurve({ percent: 0, isGraduated: false })
      setChainStats({ marketCapUSD: null })
      return () => {}
    }
    const refreshInternal = async () => {
      try {
        const stats = await readContract(wagmiConfig, { abi: TokenAbi, address: addr, functionName: 'getTokenStats' }).catch(() => null)
        // eslint-disable-next-line no-console
        console.log('[RobotCard] getTokenStats(refresh)', { address: addr, stats })
        const graduationProgress = await readContract(wagmiConfig, { abi: TokenAbi, address: addr, functionName: 'getGraduationProgress' }).catch(() => null)
        
        // stats is a struct/object, not an array - access by property name
        const progressPercent = stats?.progressPercent ?? 0n
        const isGraduated = stats?.isGraduated ?? false
      const marketCapUSD = stats?.marketCapXToken ?? 0n
        
        const progressSource = typeof graduationProgress === 'bigint' || typeof graduationProgress === 'number'
          ? graduationProgress
          : progressPercent
        const numericProgress = (() => {
          if (typeof progressSource === 'number') return progressSource
          if (typeof progressSource === 'bigint') return Number(progressSource)
          const fallback = Number(progressSource ?? 0)
          return Number.isFinite(fallback) ? fallback : 0
        })()
        const clamped = Math.max(0, Math.min(100, numericProgress))
      const graduated = Boolean(isGraduated) || clamped >= 100
      if (!cancelled) setCurve({ percent: graduated ? 100 : clamped, isGraduated: graduated })
      const volume24h = stats?.volume24h ?? 0n
      if (!cancelled) setChainStats({ marketCapUSD: typeof marketCapUSD === 'bigint' ? marketCapUSD : null, volume24h: typeof volume24h === 'bigint' ? volume24h : null })
      } catch {
        if (!cancelled) {
          setCurve({ percent: 0, isGraduated: false })
          setChainStats({ marketCapUSD: null })
        }
      }
    }
    refreshInternal()
    // Note: watchContractEvent disabled to reduce RPC calls (too many requests on Infura)
    // let off1 = null
    // let off2 = null
    // try {
    //   off1 = watchContractEvent(wagmiConfig, { address: addr, abi: TokenAbi, eventName: 'Buy', onLogs: refreshInternal })
    // } catch { /* ignore watch error */ }
    // try {
    //   off2 = watchContractEvent(wagmiConfig, { address: addr, abi: TokenAbi, eventName: 'Sell', onLogs: refreshInternal })
    // } catch { /* ignore watch error */ }
    // unsubRef.current = () => { try { off1?.(); off2?.() } catch { /* ignore unsubscribe error */ } }
    return () => { cancelled = true; try { unsubRef.current?.() } catch { /* ignore unsubscribe error */ } }
  }, [robot?.contractAddress, refreshTrigger])

  const displayStatus = getDisplayStatus(robot.status)

  return (
    <Card
      className={`card-hover ${!isDark ? 'glass-card' : ''} cursor-pointer transition-all duration-300 shadow-lg hover:shadow-xl ${
        isSelected
          ? isDark
            ? 'bg-slate-900/80 border-[#5854f4]'
            : 'bg-white border-[#5854f4] shadow-[#5854f4]/20'
          : isDark
            ? 'bg-slate-900/70 border-slate-700/60 hover:border-slate-600'
            : 'bg-white border-gray-200 hover:border-gray-300'
      }`}
      onClick={onSelect}
    >
      {/* Robot Image */}
      <div className="relative">
        <img
          src={safeImageUrl(robot.image)}
          alt={robot.name}
          className="w-full h-48 object-cover rounded-t-lg"
        />
      </div>

      <CardHeader className="pb-3">
        <div className="space-y-2">
          {/* Nombre */}
          <div>
            <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{robot.name}</h3>
          </div>

          {/* Status y Battery en la segunda línea */}
          <div className="flex items-center justify-between">
            <div className={`flex items-center space-x-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'} ml-1`}>
              <div className={getStatusDotClass(robot.status)}></div>
              <span>{displayStatus}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Activity className={`h-4 w-4 ${getBatteryColor(robot.battery)}`} />
              <span className={`text-sm font-medium ${getBatteryColor(robot.battery)}`}>{robot.battery}%</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-6">
        {/* Position - sin eje Z */}
        <div className="flex items-center justify-between">
          <div className={`flex items-center space-x-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
            <MapPin className="h-4 w-4" />
            <span>Position:</span>
          </div>
          <span className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
            X: {robot.position?.x ?? 'X'}, Y: {robot.position?.y ?? 'X'}
          </span>
        </div>

        {/* FDV */}
        <div className="flex items-center justify-between">
          <div className={`flex items-center space-x-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
            <TrendingUp className="h-4 w-4" />
            <span>FDV:</span>
          </div>
          <span className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
            {formatUsdCompact(chainStats.marketCapUSD)}
          </span>
        </div>

        {/* Bonding Curve con gradiente morado */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className={`flex items-center space-x-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
              <Activity className="h-4 w-4" />
              <span>Bonding Curve:</span>
            </div>
            <span className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
              {curve.isGraduated ? 'Graduated' : `${curve.percent.toFixed(2)}%`}
            </span>
          </div>
          <div
            className={`relative h-2 w-full overflow-hidden rounded-full border ${
              isDark ? 'bg-slate-700/60 border-slate-600/60' : 'bg-gray-200 border-gray-300'
            }`}
          >
            <div
              className="h-full bg-gradient-to-r from-[#5854f4] to-[#7c3aed] transition-all duration-300 ease-in-out"
              style={{ width: `${curve.isGraduated ? 100 : Math.max(0, Math.min(100, curve.percent))}%` }}
            />
          </div>
        </div>

        {/* Separator */}
        <div className={`border-t ${isDark ? 'border-slate-700/60' : 'border-gray-200'}`} />

        {/* Social Links & Quick Buy */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {/* Website */}
            {robot.website ? (
              <a
                href={robot.website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-white' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                <Globe className="h-4 w-4" />
              </a>
            ) : (
              <div className={`p-1.5 rounded-lg ${isDark ? 'text-slate-700' : 'text-gray-300'} cursor-not-allowed`}>
                <Globe className="h-4 w-4" />
              </div>
            )}
            
            {/* Twitter */}
            {robot.twitter ? (
              <a
                href={robot.twitter.startsWith('http') ? robot.twitter : `https://twitter.com/${robot.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-white' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                <Twitter className="h-4 w-4" />
              </a>
            ) : (
              <div className={`p-1.5 rounded-lg ${isDark ? 'text-slate-700' : 'text-gray-300'} cursor-not-allowed`}>
                <Twitter className="h-4 w-4" />
              </div>
            )}
            
            {/* Telegram */}
            {robot.telegram ? (
              <a
                href={robot.telegram.startsWith('http') ? robot.telegram : `https://t.me/${robot.telegram}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-white' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                <Send className="h-4 w-4" />
              </a>
            ) : (
              <div className={`p-1.5 rounded-lg ${isDark ? 'text-slate-700' : 'text-gray-300'} cursor-not-allowed`}>
                <Send className="h-4 w-4" />
              </div>
            )}
          </div>
          
          {quickBuyAmount && onQuickBuy && (
            <Button
              size="sm"
              onClick={handleQuickBuy}
              disabled={!isWalletConnected}
              className={`bg-gradient-to-r from-[#5854f4] to-[#7c3aed] hover:from-[#4c46e8] hover:to-[#6d28d9] text-white px-2 py-1 h-7 rounded-lg flex items-center space-x-1 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 ${
                !isWalletConnected ? 'opacity-60 cursor-not-allowed hover:scale-100 hover:shadow-lg' : ''
              }`}
            >
              <img src="/assets/IconHaven.svg" alt="HAVEN" className="h-6 w-6" />
              <span className="text-xs">{formatQuickBuyLabel(quickBuyAmount, quickBuyMode)}</span>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
