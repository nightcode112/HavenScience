import React from 'react'
import { BrowserRouter as Router, Routes, Route, useParams } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { MyBots } from './pages/MyBots'
import { CreateBot } from './pages/CreateBot'
import TestSwap from './pages/TestSwap'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { HelmetProvider } from 'react-helmet-async'
import { RobotStatsProvider } from './context/RobotStatsContext'
import { useState, useEffect, useMemo } from 'react'
import { RobotApi } from './utils/api'
import { normalizeRobots } from './utils/robotUtils'
import { useAccount, usePublicClient } from 'wagmi'
import { CONTRACTS } from './utils/contracts'

// Import Haven reskinned components
import HavenHeader from './haven-reskin/components/HavenHeader'
import { TokenTabBar } from './haven-reskin/components/TokenTabBar'
import TokenMarquee from './haven-reskin/components/TokenMarquee'
import HavenFactory from './haven-reskin/pages/HavenFactory'
import HavenTokenDetail from './haven-reskin/pages/HavenTokenDetail'
import HavenMyRobots from './haven-reskin/pages/HavenMyRobots'
import HavenCreateRobot from './haven-reskin/pages/HavenCreateRobot'
import HavenDiscover from './haven-reskin/pages/HavenDiscover'
import { useFavorites } from './hooks/useFavorites'

// Keep old CreateBot for reference
// import { CreateBot } from './pages/CreateBot'

// Transform robot data to Haven format
function transformRobotToHavenFormat(robot) {
  return {
    id: robot.id,
    address: robot.contractAddress,
    contractAddress: robot.contractAddress,
    symbol: robot.ticker || robot.symbol || 'TKN',
    name: robot.name || 'Robot',
    description: robot.description || `${robot.name} Robot`,
    image: robot.image || robot.imageUrl || robot.img,
    imageUrl: robot.image || robot.imageUrl || robot.img,
    timestamp: robot.timestamp
      ? Math.floor(new Date(robot.timestamp).getTime() / 1000)
      : (robot.created_at
        ? Math.floor(new Date(robot.created_at + 'Z').getTime() / 1000)
        : Math.floor(Date.now() / 1000)),

    // Market data - calculate market cap correctly based on graduation status
    price: robot.price || 0,
    totalSupply: robot.total_supply || robot.totalSupply || 1000000,
    // For graduated tokens: use price * total_supply (like HavenTokenDetail does with swap data)
    // For non-graduated (bonding curve): use DB market_cap (bonding curve formula)
    marketCap: (robot.is_graduated || robot.isGraduated) && robot.total_supply
      ? (robot.price || 0) * robot.total_supply  // Graduated: price * supply
      : (robot.market_cap || robot.marketCap || 0), // Non-graduated: DB market cap
    volume24h: robot.volume_24h || robot.volume24h || 0,
    liquidity: robot.liquidity || 0,
    // Use real-time data if available, otherwise fall back to cached values
    holdersCount: robot._realHoldersCount ?? robot.holdersCount ?? robot.holders_count ?? robot.holders ?? 0,
    txns24h: robot._realTxnsCount ?? robot.txns_24h ?? robot.txns24h ?? 0,

    // Social links
    twitter: robot.twitter || robot.social?.twitter,
    telegram: robot.telegram || robot.social?.telegram,
    website: robot.website || robot.social?.website,

    // Bonding curve / progress
    isGraduated: robot.isGraduated || robot.is_graduated || robot.graduated || false,
    progress: (robot.isGraduated || robot.is_graduated || robot.graduated) ? 100 : (robot.bondingProgress || 0),

    // DEX paid status
    dex_paid: robot.dex_paid || false,

    // Metadata
    devCreated: robot.metadata?.devCreated || 0,
    devGraduated: robot.metadata?.devGraduated || 0,
    devHolds: robot.metadata?.devHolds || 0,
    top10Holds: robot.metadata?.top10Holds || 0,
    phishingHolds: robot.metadata?.phishingHolds || 0,
    snipersHold: robot.metadata?.snipersHold || 0,
    insidersHold: robot.metadata?.insidersHold || 0,
    netBuy1m: robot.metadata?.netBuy1m || 0,

    // Price changes - check both priceChanges object and direct properties
    priceChange5m: robot.priceChanges?.m5 || robot.priceChange5m || robot.price_change_5m || 0,
    priceChange1h: robot.priceChanges?.h1 || robot.priceChange1h || robot.price_change_1h || 0,
    priceChange6h: robot.priceChanges?.h6 || robot.priceChange6h || robot.price_change_6h || 0,
    priceChange24h: robot.priceChanges?.h24 || robot.priceChange24h || robot.price_change_24h || 0,

    // Trading stats (24h) - buys/sells/net buy
    buys24h: robot.buys_24h || robot.buys24h || 0,
    buys24hVolume: robot.buys_24h_volume || robot.buys24hVolume || 0,
    sells24h: robot.sells_24h || robot.sells24h || 0,
    sells24hVolume: robot.sells_24h_volume || robot.sells24hVolume || 0,
    netBuy24h: robot.net_buy_24h || robot.netBuy24h || 0,

    // Additional
    creator: robot.wallet || robot.creator || robot.creatorAddress,
    creatorAddress: robot.wallet || robot.creatorAddress || robot.creator,
    timeAgo: robot.timeAgo || 'New',

    // Creator fees from blockchain
    creatorFeesETH: robot.creatorFeesETH || '0', // BNB fees (primary)
    creatorFeesTokens: robot.creatorFeesTokens || '0' // PROJECT token fees
  }
}

// Wrapper for token detail page
const TokenDetailWrapper = React.memo(function TokenDetailWrapper({ favoritesHook }) {
  // Don't pass robot prop at all - let HavenTokenDetail fetch its own data from Supabase
  // This prevents infinite re-renders caused by the robots array changing constantly
  return <HavenTokenDetail robot={null} favoritesHook={favoritesHook} />
})

function AppContent() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [robots, setRobots] = useState(() => {
    // Load from cache immediately on mount (including price changes)
    try {
      const cached = localStorage.getItem('robots_cache')
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        // Use cache if less than 30 seconds old (increased from 10s)
        if (Date.now() - timestamp < 30000) {
          return data
        }
      }
    } catch (e) {
    }
    return []
  })

  // Single source of truth for favorites
  const favoritesHook = useFavorites()

  // Fetch robots
  useEffect(() => {
    let mounted = true
    let intervalId = null
    let lastFetchedAddresses = ''
    let lastGraduatedUpdate = 0

    const fetchRobots = async () => {
      try {
        const data = await RobotApi.getAllRobots(undefined)
        if (!mounted) return

        const normalized = normalizeRobots(data, { wallet: address })

        // Always update with fresh data from database to ensure fields like dex_paid are current
        setRobots(normalized)

        // Fetch price changes for top 20 tokens immediately (no delay for faster load)
        setTimeout(async () => {
          try {
            const topTokens = normalized.slice(0, 20)
            const currentAddresses = topTokens.map(t => t.contractAddress).join(',')

            // Skip if we already fetched prices for these exact tokens
            if (currentAddresses === lastFetchedAddresses) {
              return
            }
            lastFetchedAddresses = currentAddresses
            const priceChangePromises = topTokens.map(async (robot) => {
              try {
                const url = `/api/blockchain/token_stats?address=${robot.contractAddress}`
                const response = await fetch(url)

                // Skip if token not found (404) - likely a new token that hasn't been indexed yet
                if (!response.ok) {
                  return null
                }

                const result = await response.json()

                if (result.success && result.data) {
                  // Round to 2 decimal places to avoid floating point differences
                  return {
                    address: robot.contractAddress.toLowerCase(),
                    priceChange24h: Math.round((result.data.price_change_24h || result.data.priceChange24h || 0) * 100) / 100,
                    priceChange1h: Math.round((result.data.price_change_1h || result.data.priceChange1h || 0) * 100) / 100,
                    priceChange5m: Math.round((result.data.price_change_5m || result.data.priceChange5m || 0) * 100) / 100,
                    priceChange6h: Math.round((result.data.price_change_6h || result.data.priceChange6h || 0) * 100) / 100
                  }
                }
              } catch (e) {
                // Silently catch errors for tokens that don't exist yet
              }
              return null
            })

            const priceChanges = (await Promise.all(priceChangePromises)).filter(Boolean)

            if (!mounted || priceChanges.length === 0) return

            // Update robots with price changes - only if data actually changed
            setRobots(prev => {
              const updated = prev.map(robot => {
                const change = priceChanges.find(pc => pc.address === robot.contractAddress?.toLowerCase())
                if (change) {
                  // Round existing values for comparison
                  const currentChange24h = Math.round((robot.priceChange24h || 0) * 100) / 100
                  const currentChange1h = Math.round((robot.priceChange1h || 0) * 100) / 100
                  const currentChange5m = Math.round((robot.priceChange5m || 0) * 100) / 100
                  const currentChange6h = Math.round((robot.priceChange6h || 0) * 100) / 100

                  // Only update if values actually changed
                  if (
                    currentChange24h === change.priceChange24h &&
                    currentChange1h === change.priceChange1h &&
                    currentChange5m === change.priceChange5m &&
                    currentChange6h === change.priceChange6h
                  ) {
                    return robot // Return same reference if no changes
                  }
                  return {
                    ...robot,
                    priceChange24h: change.priceChange24h,
                    priceChange1h: change.priceChange1h,
                    priceChange5m: change.priceChange5m,
                    priceChange6h: change.priceChange6h
                  }
                }
                return robot
              })

              // Only cache and update if something actually changed
              const hasChanges = updated.some((robot, idx) => robot !== prev[idx])
              if (!hasChanges) {
                return prev // Return same reference to prevent re-render
              }

              // Cache robots WITH price changes for instant display on next load
              try {
                localStorage.setItem('robots_cache', JSON.stringify({
                  data: updated,
                  timestamp: Date.now()
                }))
              } catch (e) {
              }

              return updated
            })
          } catch (error) {
          }
        }, 0) // Changed from 500ms to 0ms for immediate fetch

        // Fetch correct price and total supply for graduated tokens from swaps
        // Update every 5 seconds (same as main fetch interval)
        const now = Date.now()
        const shouldUpdateGraduated = (now - lastGraduatedUpdate) >= 4500

        if (shouldUpdateGraduated) {
          lastGraduatedUpdate = now
        }

        // Graduated tokens use database market_cap directly - no swap recalculation
        // This ensures consistency with what's stored in the database

        // Fetch creator fees from contracts for ALL tokens (not just top 20)
        setTimeout(async () => {
          if (!publicClient) {
            return
          }

          try {
            // Fetch fees for ALL robots to get total creator fees
            const feePromises = normalized.map(async (robot) => {
              try {
                const fees = await publicClient.readContract({
                  address: robot.contractAddress,
                  abi: CONTRACTS.token.abi,
                  functionName: 'getFees'
                })

                // getFees returns: [factoryFeesETH, creatorFeesETH, factoryFeesXToken, creatorFeesXToken, factoryFeesTokens, creatorFeesTokens]
                const creatorFeesETH = fees[1] // Index 1 is creatorFeesETH (BNB)
                const creatorFeesTokens = fees[5] // Index 5 is creatorFeesTokens (PROJECT tokens)

                return {
                  address: robot.contractAddress.toLowerCase(),
                  creatorFeesETH: creatorFeesETH.toString(), // BNB fees (most important!)
                  creatorFeesTokens: creatorFeesTokens.toString() // PROJECT token fees
                }
              } catch (e) {
                return {
                  address: robot.contractAddress.toLowerCase(),
                  creatorFeesETH: '0',
                  creatorFeesTokens: '0'
                }
              }
            })

            const feesData = await Promise.all(feePromises)

            if (!mounted) return

            // Update robots with creator fees
            setRobots(prev => {
              const updated = prev.map(robot => {
                const feeData = feesData.find(f => f.address === robot.contractAddress?.toLowerCase())
                if (feeData) {
                  // Always update with both ETH and token fees
                  return {
                    ...robot,
                    creatorFeesETH: feeData.creatorFeesETH, // BNB fees
                    creatorFeesTokens: feeData.creatorFeesTokens // PROJECT token fees
                  }
                }
                return robot
              })

              return updated
            })
          } catch (error) {
          }
        }, 1500) // Fetch fees 1.5 seconds after price changes
      } catch (error) {
        if (!mounted) return
        // Don't clear robots on error - keep showing cached data
      }
    }

    fetchRobots()
    intervalId = setInterval(fetchRobots, 5000) // Update every 5 seconds instead of 1

    return () => {
      mounted = false
      if (intervalId) clearInterval(intervalId)
    }
  }, [address])

  // Transform robots to Haven format - memoize to prevent re-renders
  const transformedRobots = useMemo(() => {
    const transformed = robots.map(transformRobotToHavenFormat)
    return transformed
  }, [robots])

  return (
    <div className="min-h-screen bg-[#0f1419]">
      {/* Haven Header instead of Navbar + Sidebar */}
      <HavenHeader />

      {/* Token Marquee - positioned below fixed header */}
      <div className="pt-[56px]">
        <TokenMarquee robots={transformedRobots} mode="trending" favoritesHook={favoritesHook} />

        {/* Token Tab Bar - positioned below marquee */}
        <TokenTabBar />
      </div>

      {/* Main content */}
      <main>
        <Routes>
          {/* Discover page */}
          <Route
            path="/"
            element={<HavenDiscover robots={transformedRobots} favoritesHook={favoritesHook} />}
          />

          {/* Factory page - main marketplace */}
          <Route
            path="/factory"
            element={<HavenFactory robots={transformedRobots} favoritesHook={favoritesHook} />}
          />

          {/* Token detail page */}
          <Route
            path="/market/:address"
            element={<TokenDetailWrapper favoritesHook={favoritesHook} />}
          />

          {/* Portfolio page - using HavenMyRobots */}
          <Route path="/portfolio" element={<HavenMyRobots />} />

          {/* Keep existing pages */}
          <Route path="/robots" element={<MyBots />} />
          <Route path="/robots/:address" element={<MyBots />} />
          <Route path="/create" element={<HavenCreateRobot />} />
          <Route path="/test" element={<TestSwap />} />
          <Route
            path="/docs"
            element={
              <div className="text-center py-20">
                <h1 className="text-4xl font-bold text-white mb-4">Documentation</h1>
                <p className="text-gray-400">Coming soon...</p>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <RobotStatsProvider>
          <ToastProvider>
            <Router>
              <AppContent />
            </Router>
          </ToastProvider>
        </RobotStatsProvider>
      </ThemeProvider>
    </HelmetProvider>
  )
}

export default App
