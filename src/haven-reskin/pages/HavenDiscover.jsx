import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, Star, Flame, BarChart3, Sparkles,
  DollarSign, Activity, Users, TrendingDown, Brain,
  Rocket, ChevronRight, Zap, ChevronLeft, MoreVertical
} from 'lucide-react'
import TokenImage from '../../components/TokenImage'
import { formatNumber } from '../../lib/utils'

// Convert IPFS URLs to HTTP gateway URLs
function convertIpfsUrl(url) {
  if (!url) return null

  // If it's an IPFS URL, convert to HTTP gateway
  if (url.startsWith('ipfs://')) {
    const hash = url.replace('ipfs://', '')
    return `https://ipfs.io/ipfs/${hash}`
  }

  return url
}

export default function HavenDiscover({ robots = [], favoritesHook }) {
  const navigate = useNavigate()
  const { favorites, toggleFavorite } = favoritesHook || { favorites: [], toggleFavorite: () => {} }

  // Use refs to prevent re-renders
  const prevRobotsRef = useRef(robots)
  const [displayRobots, setDisplayRobots] = useState(robots)
  const [totalCreatorFeesData, setTotalCreatorFeesData] = useState(null)

  // Only update display when robots actually change
  useEffect(() => {
    if (JSON.stringify(prevRobotsRef.current) !== JSON.stringify(robots)) {
      setDisplayRobots(robots)
      prevRobotsRef.current = robots
    }
  }, [robots])

  // Fetch total creator fees from API
  useEffect(() => {
    let mounted = true

    async function fetchCreatorFees() {
      try {
        console.log('[Discover Debug] Fetching creator fees from /api/creator-fees?action=total')
        const response = await fetch('/api/creator-fees?action=total')
        console.log('[Discover Debug] Creator fees response status:', response.status)

        const result = await response.json()
        console.log('[Discover Debug] Creator fees API result:', result)

        if (mounted && result.success) {
          setTotalCreatorFeesData(result.data)
          console.log('[Discover] Total creator fees loaded:', result.data)
        } else if (!result.success) {
          console.warn('[Discover] Creator fees API returned error:', result.error)
        }
      } catch (error) {
        console.error('[Discover] Failed to fetch creator fees:', error)
      }
    }

    fetchCreatorFees()
    // Refresh every hour (3600000 ms = 60 minutes)
    const interval = setInterval(fetchCreatorFees, 3600000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  // Calculate ecosystem stats
  const stats = useMemo(() => {
    const totalMarketCap = displayRobots.reduce((sum, r) => sum + (r.marketCap || 0), 0)
    const totalVolume = displayRobots.reduce((sum, r) => sum + parseFloat(r.volume24h || 0), 0)
    const newToday = displayRobots.filter(r => {
      const time = new Date(r.timestamp || r.created_at).getTime()
      return Date.now() - time < 86400000
    }).length

    const totalTxns = displayRobots.reduce((sum, r) => sum + (r.txns24h || 0), 0)

    // DEBUG: Log market cap data
    console.log('[Discover Debug] Calculating stats from', displayRobots.length, 'robots')
    const robotsWithMarketCap = displayRobots.filter(r => r.marketCap > 0)
    console.log('[Discover Debug] Robots with marketCap > 0:', robotsWithMarketCap.length)
    if (robotsWithMarketCap.length > 0) {
      console.log('[Discover Debug] Sample robot with marketCap:', {
        name: robotsWithMarketCap[0].name,
        marketCap: robotsWithMarketCap[0].marketCap,
        isGraduated: robotsWithMarketCap[0].isGraduated
      })
    }
    console.log('[Discover Debug] Total Market Cap:', totalMarketCap)

    // Use API data for creator fees (fetched separately)
    const creatorFeesUSD = totalCreatorFeesData?.total?.usd || 0

    if (totalCreatorFeesData) {
      console.log('[Discover] Creator fees from API:', {
        historical: totalCreatorFeesData.historical?.usd || 0,
        pending: totalCreatorFeesData.pending?.totalUSD || 0,
        total: totalCreatorFeesData.total?.usd || 0
      })
    }

    return {
      marketCap: totalMarketCap,
      volume: totalVolume,
      tokens: displayRobots.length,
      creatorFeesUSD: creatorFeesUSD,
      creatorFeesHistorical: totalCreatorFeesData?.historical?.usd || 0,
      creatorFeesPending: totalCreatorFeesData?.pending?.totalUSD || 0,
      newToday,
      totalTxns
    }
  }, [displayRobots, totalCreatorFeesData])

  // Categorize robots by topics - memoized to prevent recalculation
  const categories = useMemo(() => {
    return {
      champagne: [...displayRobots]
        .filter(r => (r.marketCap || 0) > 100000)
        .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
        .slice(0, 20),

      trending: [...displayRobots]
        .filter(r => (r.priceChange24h || 0) > 5)
        .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
        .slice(0, 20),

      topGainers: [...displayRobots]
        .filter(r => (r.priceChange24h || 0) > 0)
        .sort((a, b) => (b.priceChange24h || 0) - (a.priceChange24h || 0))
        .slice(0, 20),

      topVolume: [...displayRobots]
        .sort((a, b) => parseFloat(b.volume24h || 0) - parseFloat(a.volume24h || 0))
        .slice(0, 20),

      ai: [...displayRobots]
        .filter(r => {
          const searchStr = `${r.name} ${r.symbol} ${r.description}`.toLowerCase()
          return searchStr.includes('ai') || searchStr.includes('artificial') ||
                 searchStr.includes('neural') || searchStr.includes('machine learning')
        })
        .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
        .slice(0, 20),

      meme: [...displayRobots]
        .filter(r => {
          const searchStr = `${r.name} ${r.symbol} ${r.description}`.toLowerCase()
          return searchStr.includes('meme') || searchStr.includes('doge') ||
                 searchStr.includes('pepe') || searchStr.includes('shib')
        })
        .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
        .slice(0, 20),

      new: [...displayRobots]
        .sort((a, b) => {
          const timeA = new Date(a.timestamp || a.created_at).getTime()
          const timeB = new Date(b.timestamp || b.created_at).getTime()
          return timeB - timeA
        })
        .slice(0, 20),

      favorites: displayRobots
        .filter(r => favorites.includes(r.contractAddress?.toLowerCase()))
        .slice(0, 20)
    }
  }, [displayRobots, favorites])

  const sections = [
    { id: 'champagne', label: 'Forge Masters', icon: Zap, data: categories.champagne },
    { id: 'trending', label: 'Trending Now', icon: Flame, data: categories.trending },
    { id: 'topGainers', label: 'Top Gainers', icon: TrendingUp, data: categories.topGainers },
    { id: 'topVolume', label: 'Top Volume', icon: BarChart3, data: categories.topVolume },
    { id: 'ai', label: 'AI Agents', icon: Brain, data: categories.ai },
    { id: 'meme', label: 'Meme Robots', icon: Rocket, data: categories.meme },
    { id: 'new', label: 'New Robots', icon: Sparkles, data: categories.new },
    { id: 'favorites', label: 'Your Favorites', icon: Star, data: categories.favorites }
  ]

  // Horizontal scroll state for each section
  const [scrollPositions, setScrollPositions] = useState({})
  const scrollContainerRefs = useRef({})

  const scroll = (sectionId, direction) => {
    const container = scrollContainerRefs.current[sectionId]
    if (container) {
      const scrollAmount = 400
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  // Memoized token card to prevent unnecessary re-renders
  const TokenCard = React.memo(({ robot }) => {
    const isFavorite = favorites.includes(robot.contractAddress?.toLowerCase())
    const priceChange = robot.priceChange24h || 0
    const isPositive = priceChange > 0
    const [isHovered, setIsHovered] = useState(false)

    // Get image URL with IPFS conversion
    const imageUrl = convertIpfsUrl(robot.imageUrl || robot.image)

    return (
      <div
        onClick={() => navigate(`/market/${robot.contractAddress}`)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="flex-shrink-0 w-[280px] bg-[#131824] border border-gray-800 rounded-xl overflow-hidden cursor-pointer hover:border-gray-700 transition-all hover:scale-[1.02] hover:shadow-2xl"
        style={{
          transition: 'all 0.2s ease-in-out'
        }}
      >
        {/* Token Image - Large Square */}
        <div className="relative w-full aspect-square bg-[#0f1419] overflow-hidden flex items-center justify-center">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={robot.symbol}
              className="w-full h-full object-cover absolute inset-0"
              style={{
                transition: 'transform 0.3s ease-in-out',
                transform: isHovered ? 'scale(1.1) rotate(5deg)' : 'scale(1)'
              }}
              onError={(e) => {
                e.target.style.display = 'none'
              }}
            />
          ) : (
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-white text-4xl font-bold">{robot.symbol?.substring(0, 2)}</span>
            </div>
          )}

          {/* Verified Badge */}
          <div className="absolute top-3 left-3 w-7 h-7 bg-cyan-500 rounded-full flex items-center justify-center shadow-lg animate-pulse">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 12L11 14L15 10" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* Favorite Star */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleFavorite(robot.contractAddress)
            }}
            className="absolute bottom-3 right-3 w-9 h-9 bg-black/70 backdrop-blur-md rounded-lg flex items-center justify-center hover:bg-black/90 transition-all hover:scale-110 hover:rotate-12"
          >
            <Star
              size={18}
              fill={isFavorite ? '#eab308' : 'none'}
              stroke={isFavorite ? '#eab308' : 'white'}
              className={isFavorite ? 'text-yellow-500' : 'text-white'}
            />
          </button>

          {/* Creator Wallet */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/70 backdrop-blur-md rounded-lg px-3 py-1.5">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
              <Users size={11} className="text-white" />
            </div>
            <span className="text-white text-xs font-mono font-semibold">
              {robot.creatorAddress
                ? `${robot.creatorAddress.slice(0, 6)}...${robot.creatorAddress.slice(-4)}`
                : '0x0000...0000'}
            </span>
          </div>
        </div>

        {/* Token Info */}
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-lg mb-0.5 truncate">
                {robot.name} <span className="text-gray-500 font-normal">{robot.symbol}</span>
              </h3>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-2 text-xs mb-3">
            <div className="bg-[#0f1419] rounded-lg p-2 border border-gray-800">
              <div className="text-gray-500 mb-1">MCAP</div>
              <div className="text-white font-semibold">${formatNumber(robot.marketCap || 0)}</div>
            </div>
            <div className="bg-[#0f1419] rounded-lg p-2 border border-gray-800">
              <div className="text-gray-500 mb-1">Vol</div>
              <div className="text-white font-semibold">${formatNumber(robot.volume24h || 0)}</div>
            </div>
            <div className="bg-[#0f1419] rounded-lg p-2 border border-gray-800">
              <div className="text-gray-500 mb-1">24h Δ</div>
              <div className={`font-semibold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Trade Button */}
          <button className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg transition-all hover:scale-105 active:scale-95">
            Trade
          </button>
        </div>
      </div>
    )
  })

  return (
    <div className="min-h-screen bg-[#0f1419] pt-14">
      {/* Hero Banner */}
      <div className="relative bg-[#131824] border-b border-gray-800 overflow-hidden">
        <div className="max-w-[1800px] mx-auto px-6 lg:px-12 py-12">
          <div className="flex items-center justify-between flex-wrap gap-8">
            <div>
              <h1 className="text-white text-5xl lg:text-6xl font-black mb-3">
                {stats.tokens.toLocaleString()} LIVE ROBOTS/AGENTS
              </h1>
              <p className="text-gray-400 text-xl">Deploy your autonomous trading robots</p>
            </div>

            <div className="flex items-center gap-8">
              <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all">
                <div className="text-gray-400 text-sm mb-1">Ecosystem Market Cap</div>
                <div className="text-white text-3xl font-bold">${formatNumber(stats.marketCap)}</div>
                <div className="text-cyan-500 text-sm font-medium mt-1">
                  {stats.tokens} tokens
                </div>
              </div>
              <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all">
                <div className="text-gray-400 text-sm mb-1">Ecosystem Volume</div>
                <div className="text-white text-3xl font-bold">${formatNumber(stats.volume)}</div>
                <div className="text-cyan-500 text-sm font-medium mt-1">
                  {formatNumber(stats.totalTxns)} txns
                </div>
              </div>
              <div className="bg-[#0f1419] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all">
                <div className="text-gray-400 text-sm mb-1">Total Creator Fees</div>
                <div className="text-white text-3xl font-bold">${formatNumber(stats.creatorFeesUSD)}</div>
                <div className="text-cyan-500 text-sm font-medium mt-1">
                  {stats.creatorFeesHistorical > 0 && stats.creatorFeesPending > 0 ? (
                    <span title={`Collected: $${formatNumber(stats.creatorFeesHistorical)} + Pending: $${formatNumber(stats.creatorFeesPending)}`}>
                      Collected + Pending
                    </span>
                  ) : stats.creatorFeesHistorical > 0 ? (
                    'Historical collections'
                  ) : (
                    'Pending fees'
                  )}
                </div>
              </div>            </div>
          </div>
        </div>
      </div>

      {/* Token Sections */}
      <div className="max-w-[1800px] mx-auto px-6 lg:px-12 py-12">
        <div className="space-y-12">
          {sections.map((section) => {
            if (section.data.length === 0) return null

            const Icon = section.icon
            const canScrollLeft = scrollPositions[section.id] > 0

            return (
              <div key={section.id}>
                {/* Section Header */}
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-white text-2xl font-bold flex items-center gap-3">
                    <Icon size={24} className="text-gray-400" />
                    {section.label}
                  </h2>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => scroll(section.id, 'left')}
                      className={`w-10 h-10 bg-[#131824] border border-gray-800 rounded-lg flex items-center justify-center hover:border-gray-700 hover:scale-110 transition-all ${!canScrollLeft ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={!canScrollLeft}
                    >
                      <ChevronLeft size={20} className="text-white" />
                    </button>
                    <button
                      onClick={() => scroll(section.id, 'right')}
                      className="w-10 h-10 bg-[#131824] border border-gray-800 rounded-lg flex items-center justify-center hover:border-gray-700 hover:scale-110 transition-all"
                    >
                      <ChevronRight size={20} className="text-white" />
                    </button>
                  </div>
                </div>

                {/* Horizontal Scroll Container */}
                <div
                  ref={(el) => scrollContainerRefs.current[section.id] = el}
                  className="flex gap-4 overflow-x-auto scrollbar-hide pb-4"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  onScroll={(e) => {
                    setScrollPositions(prev => ({
                      ...prev,
                      [section.id]: e.target.scrollLeft
                    }))
                  }}
                >
                  {section.data.map((robot) => (
                    <TokenCard key={robot.contractAddress} robot={robot} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}
