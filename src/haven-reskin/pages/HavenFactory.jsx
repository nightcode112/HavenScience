import React, { useState, useMemo, useCallback, memo, useTransition, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { readContract, simulateContract, writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { config as wagmiConfig } from '../../wagmi'
import TokenAbi from '../../contracts/abis/FullBondingCurveERC20XToken.json'
import { formatUnits, parseUnits } from 'viem'
import { CONTRACTS } from '../../utils/contracts'
import { safeImageUrl } from '../../lib/utils'
import { useFavorites } from '../../hooks/useFavorites'
import { useTokenTabsStore } from '../../stores/token-tabs-store'
import {
  Search,
  Clock,
  Twitter,
  MessageCircle,
  Globe,
  Copy,
  Users,
  Rocket,
  TrendingUp,
  AlertTriangle,
  Zap,
  Target,
  Award,
  Sparkles,
  DollarSign,
  X as XIcon,
  Star,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

// Haven color theme - using #5854f4 as primary color
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

// Trading helper functions
const SLIPPAGE_BPS = 100n
const ERC20_ABI_MIN = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
]

const applySlippage = (value) => {
  if (typeof value !== 'bigint' || value <= 0n) return 0n
  const reduction = (value * SLIPPAGE_BPS) / 10000n
  const result = value - reduction
  return result > 0n ? result : 0n
}

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

// Token Row Component - Haven-styled
const TokenRow = memo(function TokenRow({
  token,
  onClick,
  buyAmount,
  onBuy,
  metadata,
  isFavorite,
  onToggleFavorite
}) {
  const [copied, setCopied] = React.useState(false)

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`
    return num.toFixed(2)
  }

  const formatBuyAmount = (num) => {
    if (num >= 1000000) {
      const val = num / 1000000
      return val >= 10 ? `${Math.floor(val)}M` : `${val.toFixed(1)}M`
    }
    if (num >= 1000) {
      const val = num / 1000
      return val >= 10 ? `${Math.floor(val)}k` : `${val.toFixed(1)}k`
    }
    return Math.floor(num).toString()
  }

  const getTimeAgo = (timestamp) => {
    const minutes = Math.floor((Date.now() - (timestamp * 1000)) / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    return `${minutes}m ago`
  }

  const holders = token.holdersCount || 0
  const twitterHandle = token.twitter ? `@${token.twitter.split('/').pop()}` : null
  const devWallet = token.creator || token.creatorAddress || 'Unknown'
  const txCount = token.txns24h || 0

  const devCreated = metadata?.devCreated || 0
  const devGraduated = metadata?.devGraduated || 0
  const devHolds = metadata?.devHolds || 0
  const top10Holds = metadata?.top10Holds || 0
  const phishingHolds = metadata?.phishingHolds || 0
  const snipersHold = metadata?.snipersHold || 0
  const insidersHold = metadata?.insidersHold || 0
  const netBuy1m = metadata?.netBuy1m || 0

  const marketCap = token.marketCap || 0
  const volume = token.volume24h || 0
  const tokenAddress = token.address || token.contractAddress

  // Debug market cap changes
  React.useEffect(() => {
    if (token.symbol === 'SHEX' || token.symbol === 'ATLAS') {
      console.log(`[Factory ${token.symbol}] MarketCap:`, marketCap, 'from token:', token.marketCap, 'price:', token.price)
    }
  }, [token.symbol, marketCap, token.marketCap, token.price])

  const navigate = useNavigate()
  const openTab = useTokenTabsStore(state => state.openTab)

  const handleClick = (e) => {
    // Allow right-click and middle-click to work normally
    if (e.button === 1 || e.ctrlKey || e.metaKey) {
      return
    }

    e.preventDefault()

    // Open tab and navigate (don't set priceChange24h - let it fetch from DB)
    openTab(tokenAddress, {
      name: token.name,
      ticker: token.symbol || token.ticker,
      image: metadata?.image || token.image,
      price: token.price
    })
    navigate(`/market/${tokenAddress}`)
  }

  return (
    <a
      href={`/market/${tokenAddress}`}
      onClick={handleClick}
      className="block px-4 py-3.5 border-b transition-all duration-200 cursor-pointer group"
      style={{
        borderColor: HAVEN_COLORS.border,
        textDecoration: 'none'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.elevated}80`
        e.currentTarget.style.borderColor = `${HAVEN_COLORS.primary}40`
        e.currentTarget.style.boxShadow = `inset 4px 0 0 ${HAVEN_COLORS.primary}`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
        e.currentTarget.style.borderColor = HAVEN_COLORS.border
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div className="flex gap-4">
        {/* Left: Image + Contract */}
        <div className="flex-shrink-0 flex flex-col items-center gap-1">
          <div className="relative w-20 h-16">
            {/* Progress Border - goes around entire rectangle */}
            <svg className="absolute -inset-1 w-[88px] h-[72px]" viewBox="0 0 88 72">
              {/* Background border */}
              <rect
                x="2"
                y="2"
                width="84"
                height="68"
                rx="10"
                ry="10"
                fill="none"
                stroke={HAVEN_COLORS.border}
                strokeWidth="3"
              />
              {/* Progress border - starts from top-left and goes clockwise */}
              <rect
                x="2"
                y="2"
                width="84"
                height="68"
                rx="10"
                ry="10"
                fill="none"
                stroke={token.isGraduated ? HAVEN_COLORS.success : HAVEN_COLORS.primary}
                strokeWidth="3"
                strokeDasharray={`${(token.progress || 0) / 100 * 304} 304`}
                strokeDashoffset="0"
                pathLength="304"
                style={{
                  filter: `drop-shadow(0 0 6px ${token.isGraduated ? HAVEN_COLORS.success : HAVEN_COLORS.primary}90)`,
                  transition: 'stroke-dasharray 0.5s ease',
                  strokeLinecap: 'round'
                }}
              />
            </svg>

            {/* Image Container */}
            <div
              className="w-20 h-16 rounded-lg overflow-hidden transition-transform duration-200 group-hover:scale-110 cursor-pointer relative group/image"
              onClick={(e) => {
                e.stopPropagation()
                const searchQuery = encodeURIComponent(token.name || token.symbol || 'robot')
                window.open(`https://www.google.com/search?tbm=isch&q=${searchQuery}`, '_blank')
              }}
              title="Search images on Google"
              style={{
                backgroundColor: HAVEN_COLORS.surface,
                boxShadow: `0 0 10px ${HAVEN_COLORS.primary}20`
              }}>
              <img
                src={safeImageUrl(token.image)}
                alt={token.symbol}
                className="w-full h-full object-cover transition-all duration-200 group-hover/image:brightness-75"
                onError={(e) => {
                  e.target.style.display = 'none'
                  e.target.nextSibling.style.display = 'flex'
                }}
              />
              <div className="w-full h-full hidden items-center justify-center text-white font-bold text-xl"
                   style={{
                     background: `linear-gradient(135deg, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`
                   }}>
                {token.symbol?.[0] || '?'}
              </div>

              {/* Magnifying Glass Overlay - Shows on hover */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/image:opacity-100 transition-all duration-200 pointer-events-none z-[5]"
                   style={{
                     backgroundColor: 'rgba(0, 0, 0, 0.5)',
                     backdropFilter: 'blur(2px)'
                   }}>
                <div className="p-2 rounded-full animate-pulse"
                     style={{
                       backgroundColor: `${HAVEN_COLORS.primary}20`,
                       border: `2px solid ${HAVEN_COLORS.primary}`
                     }}>
                  <Search size={20} style={{color: HAVEN_COLORS.primaryLight}} strokeWidth={3} />
                </div>
              </div>

              {/* Favorite Star Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFavorite(token.address || token.contractAddress)
                }}
                className="absolute top-1 right-1 p-1 rounded-full transition-all duration-200 z-10"
                style={{
                  backgroundColor: isFavorite ? `${HAVEN_COLORS.warning}20` : 'rgba(0, 0, 0, 0.5)',
                  backdropFilter: 'blur(4px)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.2)'
                  e.currentTarget.style.backgroundColor = isFavorite ? `${HAVEN_COLORS.warning}40` : 'rgba(0, 0, 0, 0.7)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.backgroundColor = isFavorite ? `${HAVEN_COLORS.warning}20` : 'rgba(0, 0, 0, 0.5)'
                }}
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star
                  size={14}
                  fill={isFavorite ? HAVEN_COLORS.warning : 'none'}
                  stroke={isFavorite ? HAVEN_COLORS.warning : 'white'}
                  strokeWidth={2}
                />
              </button>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigator.clipboard.writeText(token.address || token.contractAddress)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-all duration-200 cursor-pointer relative"
            style={{
              color: copied ? HAVEN_COLORS.success : HAVEN_COLORS.textMuted,
              cursor: 'pointer',
              backgroundColor: copied ? `${HAVEN_COLORS.success}15` : 'transparent'
            }}
            onMouseEnter={(e) => {
              if (!copied) {
                e.currentTarget.style.color = HAVEN_COLORS.primary
                e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.primary}15`
              }
              e.currentTarget.style.transform = 'scale(1.05)'
              e.currentTarget.style.cursor = 'pointer'
            }}
            onMouseLeave={(e) => {
              if (!copied) {
                e.currentTarget.style.color = HAVEN_COLORS.textMuted
                e.currentTarget.style.backgroundColor = 'transparent'
              }
              e.currentTarget.style.transform = 'scale(1)'
            }}
            title={copied ? "Copied!" : "Copy contract address"}
          >
            <Copy className="w-4 h-4" />
            <span>{copied ? 'Copied!' : `${(token.address || token.contractAddress)?.slice(0, 4)}...${(token.address || token.contractAddress)?.slice(-4)}`}</span>
          </button>
        </div>

        {/* Center: Main Info */}
        <div className="flex-1 min-w-0 text-xs">
          {/* Symbol & Name */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-bold text-sm">{token.symbol}</span>
            <span className="text-gray-400 text-xs truncate">{token.name}</span>
          </div>

          {/* Description, Time & Socials */}
          <div className="flex items-center gap-2.5 mb-1.5">
            <p className="text-gray-400 text-[11px] line-clamp-1 flex-1">
              {token.description || 'No description available'}
            </p>
            <span className="text-gray-500 text-[11px] flex-shrink-0">{getTimeAgo(token.timestamp)}</span>

            {token.twitter && (
              <a href={token.twitter} target="_blank" rel="noopener noreferrer"
                 onClick={(e) => e.stopPropagation()}
                 className="text-[#1DA1F2] flex-shrink-0 transition-all duration-200 hover:scale-125"
                 style={{filter: 'drop-shadow(0 0 4px rgba(29, 161, 242, 0))' }}
                 onMouseEnter={(e) => e.currentTarget.style.filter = 'drop-shadow(0 0 4px rgba(29, 161, 242, 0.6))'}
                 onMouseLeave={(e) => e.currentTarget.style.filter = 'drop-shadow(0 0 4px rgba(29, 161, 242, 0))'}
              >
                <Twitter className="w-4 h-4" />
              </a>
            )}

            {token.telegram && (
              <a href={token.telegram} target="_blank" rel="noopener noreferrer"
                 onClick={(e) => e.stopPropagation()}
                 className="text-[#0088cc] flex-shrink-0 transition-all duration-200 hover:scale-125"
                 style={{filter: 'drop-shadow(0 0 4px rgba(0, 136, 204, 0))' }}
                 onMouseEnter={(e) => e.currentTarget.style.filter = 'drop-shadow(0 0 4px rgba(0, 136, 204, 0.6))'}
                 onMouseLeave={(e) => e.currentTarget.style.filter = 'drop-shadow(0 0 4px rgba(0, 136, 204, 0))'}
              >
                <MessageCircle className="w-4 h-4" />
              </a>
            )}

            {token.website && (
              <a href={token.website} target="_blank" rel="noopener noreferrer"
                 onClick={(e) => e.stopPropagation()}
                 className="flex-shrink-0 transition-all duration-200 hover:scale-125"
                 style={{color: HAVEN_COLORS.textSecondary, filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0))' }}
                 onMouseEnter={(e) => {
                   e.currentTarget.style.color = HAVEN_COLORS.textPrimary
                   e.currentTarget.style.filter = 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.4))'
                 }}
                 onMouseLeave={(e) => {
                   e.currentTarget.style.color = HAVEN_COLORS.textSecondary
                   e.currentTarget.style.filter = 'drop-shadow(0 0 4px rgba(255, 255, 255, 0))'
                 }}
              >
                <Globe className="w-4 h-4" />
              </a>
            )}
          </div>

          {/* Stats with Icons - Haven themed */}
          <div className="flex items-center gap-1.5 text-gray-400 text-xs whitespace-nowrap mt-5">
            {/* Dev Stats */}
            <div className="flex items-center gap-0.5 bg-gray-800/50 px-2 py-0.5 rounded group/devstats relative cursor-help transition-colors hover:bg-gray-700/50" title="Dev Created / Dev Graduated">
              <Rocket className="w-3.5 h-3.5" style={{color: HAVEN_COLORS.primary}} />
              <span>{devCreated}</span>
              <Award className="w-3.5 h-3.5 text-yellow-400" />
              <span>{devGraduated}</span>
            </div>

            {/* Holders */}
            <div className="flex items-center gap-0.5 bg-gray-800/50 px-2 py-0.5 rounded cursor-help transition-colors hover:bg-gray-700/50" title="Total Holders">
              <Users className="w-3.5 h-3.5" style={{color: HAVEN_COLORS.primaryLight}} />
              <span>{holders}</span>
            </div>

            {/* Insiders */}
            <div className="flex items-center gap-0.5 bg-gray-800/50 px-2 py-0.5 rounded cursor-help transition-colors hover:bg-gray-700/50" title="Insiders Hold %">
              <Sparkles className="w-3.5 h-3.5 text-orange-400" />
              <span>{insidersHold}%</span>
            </div>

            {/* Top 10 */}
            <div className="flex items-center gap-0.5 bg-gray-800/50 px-2 py-0.5 rounded cursor-help transition-colors hover:bg-gray-700/50" title="Top 10 Holders %">
              <Award className="w-3.5 h-3.5 text-yellow-400" />
              <span>{top10Holds}%</span>
            </div>

            {/* Phishing */}
            <div className="flex items-center gap-0.5 bg-gray-800/50 px-2 py-0.5 rounded cursor-help transition-colors hover:bg-gray-700/50" title="Phishing Wallets Hold %">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span>{phishingHolds}%</span>
            </div>

            {/* Snipers */}
            <div className="flex items-center gap-0.5 bg-gray-800/50 px-2 py-0.5 rounded cursor-help transition-colors hover:bg-gray-700/50" title="Snipers Hold %">
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              <span>{snipersHold}%</span>
            </div>
          </div>
        </div>

        {/* Right: Stats & Buy */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0 text-[11px]">
          <div className="text-right space-y-1 text-gray-400 mb-1">
            <div className="flex items-center gap-3">
              <span>Vol: ${formatNumber(volume)}</span>
              <span>MC: ${formatNumber(marketCap)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={netBuy1m >= 0 ? "text-green-400" : "text-red-400"}>Net: {formatNumber(Math.abs(netBuy1m))} HAVEN</span>
              <span>TXs: {txCount}</span>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onBuy(token.address || token.contractAddress)
            }}
            className="text-white text-[10px] px-3 py-1.5 rounded-full font-bold transition-all duration-200 whitespace-nowrap cursor-pointer mt-1"
            title={`Quick buy with ${buyAmount} HAVEN`}
            style={{
              background: `linear-gradient(to right, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`,
              boxShadow: `0 2px 8px ${HAVEN_COLORS.primary}30`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `linear-gradient(to right, ${HAVEN_COLORS.primaryHover}, ${HAVEN_COLORS.primary})`
              e.currentTarget.style.transform = 'scale(1.05)'
              e.currentTarget.style.boxShadow = `0 4px 16px ${HAVEN_COLORS.primary}60`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `linear-gradient(to right, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow = `0 2px 8px ${HAVEN_COLORS.primary}30`
            }}
          >
            {formatBuyAmount(buyAmount)} HAVEN
          </button>
        </div>
      </div>
    </a>
  )
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if relevant data actually changed
  // Check if token data changed (price, volume, market cap, etc.)
  const tokenChanged =
    prevProps.token.price !== nextProps.token.price ||
    prevProps.token.priceChange24h !== nextProps.token.priceChange24h ||
    prevProps.token.volume24h !== nextProps.token.volume24h ||
    prevProps.token.marketCap !== nextProps.token.marketCap ||
    prevProps.token.txns24h !== nextProps.token.txns24h ||
    prevProps.token.holdersCount !== nextProps.token.holdersCount ||
    prevProps.buyAmount !== nextProps.buyAmount ||
    prevProps.isFavorite !== nextProps.isFavorite

  // Check if metadata changed
  const metadataChanged = JSON.stringify(prevProps.metadata) !== JSON.stringify(nextProps.metadata)

  // Return true to skip re-render (props are equal), false to re-render
  return !tokenChanged && !metadataChanged
})

// Token List Component
const TokenList = memo(function TokenList({
  tokens,
  loading,
  emptyMessage,
  onTokenClick,
  buyAmount,
  onBuy,
  tokenMetadata,
  favorites,
  onToggleFavorite
}) {
  if (loading) {
    return (
      <div className="px-4 py-8 text-center text-gray-400 text-sm">
        Loading...
      </div>
    )
  }

  if (tokens.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-gray-400 text-sm">
        {emptyMessage}
      </div>
    )
  }

  // Create a Set for faster lookups
  const favoritesSet = useMemo(() => new Set(favorites), [favorites])

  return (
    <>
      {tokens.map((token) => {
        const tokenAddress = (token.address || token.contractAddress)?.toLowerCase()
        const isFavorite = favoritesSet.has(tokenAddress)

        return (
          <TokenRow
            key={`${token.address || token.contractAddress || token.id}-${isFavorite}`}
            token={token}
            onClick={() => onTokenClick(token)}
            buyAmount={buyAmount}
            onBuy={onBuy}
            metadata={tokenMetadata[tokenAddress]}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
          />
        )
      })}
    </>
  )
})

export default function HavenFactory({ robots = [], favoritesHook }) {
  const navigate = useNavigate()
  const { address: walletAddress, isConnected } = useAccount()
  const { favorites, toggleFavorite } = favoritesHook

  // Create a stable favorites lookup that updates when favorites array changes
  const favoritesSet = useMemo(() => new Set(favorites), [favorites])
  const isFavorite = useCallback((address) => favoritesSet.has(address?.toLowerCase()), [favoritesSet])

  const [searchQuery, setSearchQuery] = useState('')
  const [newTokensSearch, setNewTokensSearch] = useState('')
  const [almostGradSearch, setAlmostGradSearch] = useState('')
  const [graduatedSearch, setGraduatedSearch] = useState('')
  const [showNewSearch, setShowNewSearch] = useState(false)
  const [showAlmostSearch, setShowAlmostSearch] = useState(false)
  const [showGradSearch, setShowGradSearch] = useState(false)
  const [showBuyInput, setShowBuyInput] = useState(false)
  const [buyAmount, setBuyAmount] = useState(100)
  const [isPending, startTransition] = useTransition()
  const [tokenMetadata, setTokenMetadata] = useState({})
  const [loading, setLoading] = useState(false)
  const lastFetchedRobotsKey = useRef('')

  // Filters state
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    protocols: [],
    quoteTokens: [],
    searchKeywords: '',
    excludeKeywords: '',
    dexPaid: false,
    caPump: false,
    ageMin: '',
    top10Min: '',
    top10Max: '',
    devMin: '',
    devMax: '',
    snipersMin: '',
    snipersMax: '',
    insidersMin: '',
    insidersMax: '',
    bundleMin: '',
    bundleMax: '',
    holdersMin: '',
    holdersMax: '',
    proTradersMin: '',
    proTradersMax: '',
    devMigrationsMin: '',
    devMigrationsMax: '',
    devPairsMin: '',
    devPairsMax: ''
  })

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Calculate token metadata from robots
  useEffect(() => {
    if (!robots || robots.length === 0) return

    // Create a stable key based on robot addresses only (ignore price changes)
    const robotsKey = robots.map(r => r.address || r.contractAddress).sort().join(',')

    // Skip if robots list hasn't changed
    if (robotsKey === lastFetchedRobotsKey.current) {
      return
    }

    lastFetchedRobotsKey.current = robotsKey

    const fetchMetadata = async () => {
      const metadata = {}
      const creatorStats = {}

      // First pass: count tokens per creator (for devCreated/devGraduated)
      // Do this synchronously for instant display
      for (const robot of robots) {
        const creator = (robot.creator || robot.creatorAddress || '').toLowerCase()
        const address = (robot.address || robot.contractAddress || '').toLowerCase()

        if (!address) continue

        if (creator) {
          if (!creatorStats[creator]) {
            creatorStats[creator] = { created: 0, graduated: 0 }
          }
          creatorStats[creator].created++
          if (robot.isGraduated) {
            creatorStats[creator].graduated++
          }
        }

        const stats = creatorStats[creator] || { created: 0, graduated: 0 }

        // Set initial metadata without wallet analysis
        metadata[address] = {
          devCreated: stats.created,
          devGraduated: stats.graduated,
          devHolds: 0,
          top10Holds: 0,
          phishingHolds: 0,
          snipersHold: 0,
          insidersHold: 0
        }
      }

      // Set metadata immediately for instant display
      setTokenMetadata(metadata)

      // Fetch wallet analysis in background (non-blocking)
      setTimeout(async () => {
        try {
          const addresses = robots
            .map(r => r.address || r.contractAddress)
            .filter(addr => addr && addr !== '0x0000000000000000000000000000000000000000')

          if (addresses.length > 0) {
            const { default: HavenApi } = await import('../../api/haven-api.js')
            const walletAnalysis = await HavenApi.Wallet.analyzeBatch(addresses)

            // Update metadata with wallet analysis
            setTokenMetadata(prev => {
              const updated = { ...prev }
              for (const robot of robots) {
                const address = (robot.address || robot.contractAddress || '').toLowerCase()
                if (!address) continue

                const analysis = walletAnalysis[address] || walletAnalysis[robot.address] || walletAnalysis[robot.contractAddress] || {}

                if (updated[address]) {
                  updated[address] = {
                    ...updated[address],
                    devHolds: analysis.devHolds || 0,
                    top10Holds: analysis.top10Holds || 0,
                    phishingHolds: analysis.phishingHolds || 0,
                    snipersHold: analysis.snipersHold || 0,
                    insidersHold: analysis.insidersHold || 0,
                    netBuy1m: analysis.netBuy1m || 0
                  }
                }
              }
              return updated
            })
          }
        } catch (error) {
          console.warn('Failed to fetch wallet analysis:', error)
        }
      }, 100) // Delay wallet analysis to prioritize initial render
    }

    fetchMetadata()
  }, [robots])

  const handleTokenClick = useCallback((token) => {
    const address = token.address || token.contractAddress
    if (address && address !== 'pending') {
      startTransition(() => {
        navigate(`/market/${address}`)
      })
    }
  }, [navigate, startTransition])

  const handleBuy = useCallback(async (tokenAddress) => {
    try {
      if (!isConnected || !walletAddress) {
        alert('Please connect your wallet first')
        return
      }

      const numericAmount = Number(buyAmount)
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        alert('Please enter a valid amount')
        return
      }

      // Find the robot/token
      const robot = robots.find(r => (r.address || r.contractAddress)?.toLowerCase() === tokenAddress?.toLowerCase())
      if (!robot) {
        alert('Token not found')
        return
      }

      const tokenLabel = robot.symbol || robot.ticker || 'TKN'

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

      // Interpret amount as XTOKEN amount (HAVEN tokens)
      const xTokenAmount = parseUnits(String(numericAmount), 18)
      if (xTokenAmount <= 0n) {
        alert('Amount too small to buy')
        return
      }

      // Get buy preview
      const preview = await readContract(wagmiConfig, {
        abi: TokenAbi,
        address: tokenAddress,
        functionName: 'previewBuy',
        args: [xTokenAmount],
      })

      const tokensOut = toBigIntSafe(preview?.tokensOut ?? (Array.isArray(preview) ? preview[0] : 0n))
      if (tokensOut <= 0n) {
        alert('Quote unavailable for this amount')
        return
      }

      const minTokensOut = applySlippage(tokensOut)
      if (minTokensOut <= 0n) {
        alert('Amount too small after slippage')
        return
      }

      // Check and approve XTOKEN allowance
      const currentAllowance = await readContract(wagmiConfig, {
        abi: ERC20_ABI_MIN,
        address: CONTRACTS.xtoken.address,
        functionName: 'allowance',
        args: [walletAddress, tokenAddress],
      }).catch(() => 0n)

      if (currentAllowance < xTokenAmount) {
        alert('Approving XTOKEN... Please confirm in your wallet')
        const maxUint = (2n ** 256n) - 1n
        const approveSim = await simulateContract(wagmiConfig, {
          abi: ERC20_ABI_MIN,
          address: CONTRACTS.xtoken.address,
          functionName: 'approve',
          args: [tokenAddress, maxUint],
        })
        const approveHash = await writeContract(wagmiConfig, approveSim.request)
        alert('Approval sent. Waiting for confirmation...')
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash })
        alert('XTOKEN approved!')
      }

      // Execute buy
      alert('Confirm buy in your wallet...')
      const sim = await simulateContract(wagmiConfig, {
        abi: TokenAbi,
        address: tokenAddress,
        functionName: 'buy',
        args: [xTokenAmount, minTokensOut],
      })
      const hash = await writeContract(wagmiConfig, sim.request)
      alert('Transaction sent. Waiting for confirmation...')
      await waitForTransactionReceipt(wagmiConfig, { hash })

      // Refresh balance
      try { window.dispatchEvent(new Event('haven:refresh-balance')) } catch {}

      const tokenAmountLabel = formatTokenAmount(tokensOut, tokenDecimals)
      alert(`Successfully bought ~${tokenAmountLabel} ${tokenLabel}!`)
    } catch (error) {
      console.error('Buy error:', error)
      const msg = error?.shortMessage || error?.message || 'Transaction failed'
      alert(msg)
    }
  }, [buyAmount, isConnected, walletAddress, robots])

  // Categorize robots/tokens
  const categorizedTokens = useMemo(() => {
    const allTokens = robots || []

    const filterBySearch = (tokens, search) => {
      if (!search) return tokens
      const lower = search.toLowerCase()
      return tokens.filter(token =>
        token.symbol?.toLowerCase().includes(lower) ||
        token.name?.toLowerCase().includes(lower) ||
        (token.address || token.contractAddress)?.toLowerCase().includes(lower)
      )
    }

    // Comprehensive filter function
    const applyFilters = (tokens) => {
      return tokens.filter(token => {
        const address = (token.address || token.contractAddress || '').toLowerCase()
        const metadata = tokenMetadata[address] || {}

        // Debug dex_paid filter
        if (filters.dexPaid) {
          console.log(`[Filter Debug] ${token.symbol}: dex_paid =`, token.dex_paid, 'passes filter:', token.dex_paid === true)
        }

        // Protocol filter
        if (filters.protocols.length > 0) {
          const tokenProtocol = token.protocol || token.platform || 'Unknown'
          if (!filters.protocols.includes(tokenProtocol)) return false
        }

        // Quote token filter
        if (filters.quoteTokens.length > 0) {
          const tokenQuote = token.quoteToken || token.quoteCurrency || 'SOL'
          if (!filters.quoteTokens.includes(tokenQuote)) return false
        }

        // Search keywords
        if (filters.searchKeywords) {
          const keywords = filters.searchKeywords.toLowerCase().split(',').map(k => k.trim()).filter(k => k)
          const searchableText = `${token.symbol} ${token.name} ${token.description || ''}`.toLowerCase()
          const hasKeyword = keywords.some(keyword => searchableText.includes(keyword))
          if (!hasKeyword) return false
        }

        // Exclude keywords
        if (filters.excludeKeywords) {
          const excludes = filters.excludeKeywords.toLowerCase().split(',').map(k => k.trim()).filter(k => k)
          const searchableText = `${token.symbol} ${token.name} ${token.description || ''}`.toLowerCase()
          const hasExclude = excludes.some(keyword => searchableText.includes(keyword))
          if (hasExclude) return false
        }

        // Dex Paid filter
        if (filters.dexPaid && !token.dex_paid) return false

        // CA ends in 'pump' filter
        if (filters.caPump) {
          const ca = address || ''
          if (!ca.endsWith('pump')) return false
        }

        // Age filter (in minutes)
        if (filters.ageMin) {
          const ageMinutes = token.timestamp ? (Date.now() - token.timestamp * 1000) / (1000 * 60) : 0
          if (ageMinutes < parseFloat(filters.ageMin)) return false
        }

        // Top 10 Holders %
        if (filters.top10Min && metadata.top10Holds < parseFloat(filters.top10Min)) return false
        if (filters.top10Max && metadata.top10Holds > parseFloat(filters.top10Max)) return false

        // Dev Holding %
        if (filters.devMin && metadata.devHolds < parseFloat(filters.devMin)) return false
        if (filters.devMax && metadata.devHolds > parseFloat(filters.devMax)) return false

        // Snipers %
        if (filters.snipersMin && metadata.snipersHold < parseFloat(filters.snipersMin)) return false
        if (filters.snipersMax && metadata.snipersHold > parseFloat(filters.snipersMax)) return false

        // Insiders %
        if (filters.insidersMin && metadata.insidersHold < parseFloat(filters.insidersMin)) return false
        if (filters.insidersMax && metadata.insidersHold > parseFloat(filters.insidersMax)) return false

        // Holders count
        if (filters.holdersMin) {
          const holderCount = token.holders || token.holdersCount || token.holders_count || 0
          console.log(`[Holders Filter] ${token.symbol}: holders =`, holderCount, 'min =', filters.holdersMin, 'passes:', holderCount >= parseFloat(filters.holdersMin))
          if (holderCount < parseFloat(filters.holdersMin)) return false
        }
        if (filters.holdersMax && (token.holders || token.holdersCount || token.holders_count || 0) > parseFloat(filters.holdersMax)) return false

        // Phishing Wallets
        if (filters.proTradersMin && (metadata.phishingHolds || 0) < parseFloat(filters.proTradersMin)) return false
        if (filters.proTradersMax && (metadata.phishingHolds || 0) > parseFloat(filters.proTradersMax)) return false

        // Dev Migrations
        if (filters.devMigrationsMin && metadata.devCreated < parseFloat(filters.devMigrationsMin)) return false
        if (filters.devMigrationsMax && metadata.devCreated > parseFloat(filters.devMigrationsMax)) return false

        // Dev Pairs Created
        if (filters.devPairsMin && metadata.devGraduated < parseFloat(filters.devPairsMin)) return false
        if (filters.devPairsMax && metadata.devGraduated > parseFloat(filters.devPairsMax)) return false

        return true
      })
    }

    // Filter out graduated tokens from "New Robots" section
    const newTokensBase = [...allTokens]
      .filter(t => !t.isGraduated)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    let newTokens = filterBySearch(newTokensBase, newTokensSearch)
    newTokens = applyFilters(newTokens)

    let almostGraduated = filterBySearch(allTokens.filter(t => t.progress >= 80 && !t.isGraduated), almostGradSearch)
    almostGraduated = applyFilters(almostGraduated)

    let graduated = filterBySearch(allTokens.filter(t => t.isGraduated), graduatedSearch)
    graduated = applyFilters(graduated)

    return { newTokens, almostGraduated, graduated }
  }, [robots, newTokensSearch, almostGradSearch, graduatedSearch, filters, tokenMetadata])

  const handleSearchChange = useCallback((e) => {
    const value = e.target.value
    startTransition(() => {
      setSearchQuery(value)
    })
  }, [startTransition])

  // Protocols list
  const PROTOCOLS = ['Pump', 'Bonk', 'Bags', 'Moonshot', 'Heaven', 'Daos.fun', 'Candle', 'Sugar', 'Believe', 'Jupiter Studio', 'Moonit', 'Boop', 'LaunchLab', 'Dynamic BC', 'Raydium', 'Meteora AMM', 'Meteora AMM V2', 'Pump AMM', 'Orca']
  const QUOTE_TOKENS = ['SOL', 'USDC', 'USD1']

  return (
    <>
      {/* Filters Modal - Beautiful Professional Design */}
      {showFilters && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300"
          style={{
            backgroundColor: 'rgba(0,0,0,0.75)',
            animation: 'fadeIn 0.3s ease-out'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowFilters(false)
          }}
        >
          <div
            className="w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-3xl shadow-2xl animate-in zoom-in-95 duration-300"
            style={{
              backgroundColor: '#0a0e1a',
              border: `1px solid ${HAVEN_COLORS.primary}40`,
              boxShadow: `0 25px 50px -12px rgba(88, 84, 244, 0.25), 0 0 0 1px ${HAVEN_COLORS.primary}20`
            }}
          >
            {/* Header - Gradient Background */}
            <div
              className="sticky top-0 z-10 px-6 py-5 border-b backdrop-blur-xl"
              style={{
                background: `linear-gradient(135deg, ${HAVEN_COLORS.primary}15 0%, ${HAVEN_COLORS.primaryLight}10 100%)`,
                borderColor: `${HAVEN_COLORS.border}60`
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2.5 rounded-xl"
                    style={{
                      background: `linear-gradient(135deg, ${HAVEN_COLORS.primary} 0%, ${HAVEN_COLORS.primaryLight} 100%)`,
                      boxShadow: `0 8px 16px ${HAVEN_COLORS.primary}40`
                    }}
                  >
                    <Filter size={22} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Advanced Filters</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Customize your token discovery experience</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFilters(false)}
                  className="group p-2.5 rounded-xl transition-all duration-200 hover:scale-110 hover:rotate-90"
                  style={{
                    backgroundColor: `${HAVEN_COLORS.elevated}dd`,
                    border: `1px solid ${HAVEN_COLORS.border}60`
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.danger}20`
                    e.currentTarget.style.borderColor = HAVEN_COLORS.danger
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.elevated}dd`
                    e.currentTarget.style.borderColor = `${HAVEN_COLORS.border}60`
                  }}
                >
                  <XIcon size={20} className="text-gray-400 group-hover:text-red-400 transition-colors" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto max-h-[calc(92vh-140px)] px-6 py-5 space-y-6">
              {/* Keywords & Filters Section */}
              <div
                className="p-5 rounded-2xl border transition-all duration-300 hover:border-opacity-60"
                style={{
                  backgroundColor: `${HAVEN_COLORS.elevated}80`,
                  border: `1px solid ${HAVEN_COLORS.border}40`,
                  backdropFilter: 'blur(10px)'
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-6 rounded-full" style={{background: `linear-gradient(to bottom, ${HAVEN_COLORS.warning}, #f59e0b)`}} />
                  <h3 className="text-base font-bold text-white">Keywords & Filters</h3>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">Search Keywords</label>
                    <input
                      type="text"
                      placeholder="keyword1, keyword2..."
                      value={filters.searchKeywords}
                      onChange={(e) => setFilters(f => ({...f, searchKeywords: e.target.value}))}
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm placeholder-gray-500 transition-all duration-200 focus:ring-2 focus:ring-offset-2 focus:outline-none"
                      style={{
                        backgroundColor: `${HAVEN_COLORS.surface}dd`,
                        border: `1px solid ${HAVEN_COLORS.border}60`,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = HAVEN_COLORS.primary
                        e.target.style.boxShadow = `0 0 0 3px ${HAVEN_COLORS.primary}20`
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = `${HAVEN_COLORS.border}60`
                        e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">Exclude Keywords</label>
                    <input
                      type="text"
                      placeholder="keyword1, keyword2..."
                      value={filters.excludeKeywords}
                      onChange={(e) => setFilters(f => ({...f, excludeKeywords: e.target.value}))}
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm placeholder-gray-500 transition-all duration-200 focus:ring-2 focus:ring-offset-2 focus:outline-none"
                      style={{
                        backgroundColor: `${HAVEN_COLORS.surface}dd`,
                        border: `1px solid ${HAVEN_COLORS.border}60`,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = HAVEN_COLORS.danger
                        e.target.style.boxShadow = `0 0 0 3px ${HAVEN_COLORS.danger}20`
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = `${HAVEN_COLORS.border}60`
                        e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                    />
                  </div>
                </div>

                {/* Special Filters Checkboxes */}
                <div className="flex gap-3 mt-4">
                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 hover:scale-[1.02]" style={{
                    backgroundColor: filters.dexPaid ? `${HAVEN_COLORS.primary}20` : `${HAVEN_COLORS.surface}dd`,
                    border: `1px solid ${filters.dexPaid ? HAVEN_COLORS.primary : 'transparent'}`
                  }}>
                    <div className="relative">
                      <input type="checkbox" checked={filters.dexPaid} onChange={(e) => setFilters(f => ({...f, dexPaid: e.target.checked}))} className="peer sr-only" />
                      <div className="w-5 h-5 rounded-md border-2 transition-all duration-200 flex items-center justify-center" style={{
                        borderColor: filters.dexPaid ? HAVEN_COLORS.primary : HAVEN_COLORS.border,
                        backgroundColor: filters.dexPaid ? HAVEN_COLORS.primary : 'transparent'
                      }}>
                        {filters.dexPaid && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-medium text-white">Dex Paid</span>
                  </label>
                </div>
              </div>

              {/* Metrics Section - Beautiful Styled */}
              <div className="p-5 rounded-2xl" style={{
                background: `linear-gradient(135deg, ${HAVEN_COLORS.surface}dd 0%, ${HAVEN_COLORS.elevated}dd 100%)`,
                border: `1px solid ${HAVEN_COLORS.border}40`,
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
              }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full" style={{background: `linear-gradient(to bottom, #f59e0b, #d97706)`}}></div>
                    Metrics & Ranges
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    {label: 'Age (min)', key: 'ageMin', icon: '⏱️'},
                    {label: 'Top 10 Holders', keys: ['top10Min', 'top10Max'], icon: '👥'},
                    {label: 'Dev Holding', keys: ['devMin', 'devMax'], icon: '👨‍💻'},
                    {label: 'Snipers', keys: ['snipersMin', 'snipersMax'], icon: '🎯'},
                    {label: 'Insiders', keys: ['insidersMin', 'insidersMax'], icon: '🔒'},
                    {label: 'Holders', keys: ['holdersMin', 'holdersMax'], icon: '👤'},
                    {label: 'Phishing Wallets', keys: ['proTradersMin', 'proTradersMax'], icon: '🎣'},
                    {label: 'Dev Graduations', keys: ['devMigrationsMin', 'devMigrationsMax'], icon: '🎓'},
                    {label: 'Dev Created', keys: ['devPairsMin', 'devPairsMax'], icon: '🔨'}
                  ].map(({label, key, keys, icon}) => (
                    <div key={label} className="p-3 rounded-xl transition-all duration-200 hover:scale-[1.02]" style={{
                      backgroundColor: `${HAVEN_COLORS.elevated}cc`,
                      border: `1px solid ${HAVEN_COLORS.border}30`
                    }}>
                      <label className="block text-xs font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
                        <span>{icon}</span>
                        <span>{label}</span>
                      </label>
                      {key ? (
                        <input
                          type="number"
                          placeholder="Min value"
                          value={filters[key]}
                          onChange={(e) => setFilters(f => ({...f, [key]: e.target.value}))}
                          className="w-full px-3 py-2 rounded-lg text-white text-sm font-medium placeholder-gray-500 transition-all duration-200 focus:outline-none focus:scale-[1.02]"
                          style={{
                            backgroundColor: HAVEN_COLORS.surface,
                            border: `1px solid ${HAVEN_COLORS.border}`,
                            boxShadow: filters[key] ? `0 0 12px ${HAVEN_COLORS.primary}30, inset 0 1px 3px rgba(0,0,0,0.3)` : 'inset 0 1px 3px rgba(0,0,0,0.3)'
                          }}
                          onFocus={(e) => e.target.style.borderColor = HAVEN_COLORS.primary}
                          onBlur={(e) => e.target.style.borderColor = HAVEN_COLORS.border}
                        />
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder="Min"
                            value={filters[keys[0]]}
                            onChange={(e) => setFilters(f => ({...f, [keys[0]]: e.target.value}))}
                            className="w-1/2 px-3 py-2 rounded-lg text-white text-sm font-medium placeholder-gray-500 transition-all duration-200 focus:outline-none focus:scale-[1.02]"
                            style={{
                              backgroundColor: HAVEN_COLORS.surface,
                              border: `1px solid ${HAVEN_COLORS.border}`,
                              boxShadow: filters[keys[0]] ? `0 0 12px ${HAVEN_COLORS.primary}30, inset 0 1px 3px rgba(0,0,0,0.3)` : 'inset 0 1px 3px rgba(0,0,0,0.3)'
                            }}
                            onFocus={(e) => e.target.style.borderColor = HAVEN_COLORS.primary}
                            onBlur={(e) => e.target.style.borderColor = HAVEN_COLORS.border}
                          />
                          <input
                            type="number"
                            placeholder="Max"
                            value={filters[keys[1]]}
                            onChange={(e) => setFilters(f => ({...f, [keys[1]]: e.target.value}))}
                            className="w-1/2 px-3 py-2 rounded-lg text-white text-sm font-medium placeholder-gray-500 transition-all duration-200 focus:outline-none focus:scale-[1.02]"
                            style={{
                              backgroundColor: HAVEN_COLORS.surface,
                              border: `1px solid ${HAVEN_COLORS.border}`,
                              boxShadow: filters[keys[1]] ? `0 0 12px ${HAVEN_COLORS.primary}30, inset 0 1px 3px rgba(0,0,0,0.3)` : 'inset 0 1px 3px rgba(0,0,0,0.3)'
                            }}
                            onFocus={(e) => e.target.style.borderColor = HAVEN_COLORS.primary}
                            onBlur={(e) => e.target.style.borderColor = HAVEN_COLORS.border}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons - Beautiful Gradient Styled */}
              <div className="flex gap-3 pt-6 mt-2">
                <button
                  onClick={() => {
                    const json = JSON.stringify(filters, null, 2)
                    const blob = new Blob([json], {type: 'application/json'})
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'haven-filters.json'
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="flex-1 px-5 py-3.5 rounded-xl font-bold text-sm transition-all duration-300 hover:scale-105 hover:shadow-xl flex items-center justify-center gap-2 group"
                  style={{
                    background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated} 0%, ${HAVEN_COLORS.surface} 100%)`,
                    color: 'white',
                    border: `1px solid ${HAVEN_COLORS.border}60`,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
                  }}
                >
                  <span className="transition-transform group-hover:scale-110">📥</span>
                  <span>Export</span>
                </button>
                <button
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = 'application/json'
                    input.onchange = (e) => {
                      const file = e.target.files[0]
                      if (file) {
                        const reader = new FileReader()
                        reader.onload = (event) => {
                          try {
                            const imported = JSON.parse(event.target.result)
                            setFilters(imported)
                          } catch (err) {
                            alert('Invalid filter file')
                          }
                        }
                        reader.readAsText(file)
                      }
                    }
                    input.click()
                  }}
                  className="flex-1 px-5 py-3.5 rounded-xl font-bold text-sm transition-all duration-300 hover:scale-105 hover:shadow-xl flex items-center justify-center gap-2 group"
                  style={{
                    background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated} 0%, ${HAVEN_COLORS.surface} 100%)`,
                    color: 'white',
                    border: `1px solid ${HAVEN_COLORS.border}60`,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
                  }}
                >
                  <span className="transition-transform group-hover:scale-110">📤</span>
                  <span>Import</span>
                </button>
                <button
                  onClick={() => setShowFilters(false)}
                  className="flex-1 px-5 py-3.5 rounded-xl font-bold text-sm transition-all duration-300 hover:scale-105 hover:shadow-2xl flex items-center justify-center gap-2 group"
                  style={{
                    background: `linear-gradient(135deg, ${HAVEN_COLORS.primary} 0%, ${HAVEN_COLORS.primaryLight} 100%)`,
                    color: 'white',
                    boxShadow: `0 8px 24px ${HAVEN_COLORS.primary}50`
                  }}
                >
                  <span className="transition-transform group-hover:scale-110">✨</span>
                  <span>Apply All</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    <div className="min-h-screen text-white" style={{backgroundColor: HAVEN_COLORS.background}}>
      <div className="pt-1 pb-0">
        <div className="max-w-full mx-auto px-4">
          {/* Three Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-80px)]">
            {/* New Tokens Column */}
            <div className="overflow-hidden flex flex-col h-full rounded-xl"
                 style={{backgroundColor: HAVEN_COLORS.surface, border: `1px solid ${HAVEN_COLORS.border}`}}>
              <div className="px-4 py-3 border-b flex-shrink-0" style={{borderColor: HAVEN_COLORS.border}}>
                <div className="flex items-center gap-3">
                  {/* Search Icon/Input */}
                  <div className="flex items-center gap-2 flex-1">
                    {!showNewSearch ? (
                      <button
                        onClick={() => {
                          setShowNewSearch(true)
                          setTimeout(() => document.getElementById('new-search-input')?.focus(), 100)
                        }}
                        className="group p-2 rounded-xl transition-all duration-300 hover:scale-110 animate-pulse hover:animate-none cursor-pointer"
                        title="Search robots"
                        style={{
                          backgroundColor: `${HAVEN_COLORS.primary}15`,
                          border: `2px solid ${HAVEN_COLORS.primary}30`
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.primary}25`
                          e.currentTarget.style.borderColor = HAVEN_COLORS.primary
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.primary}15`
                          e.currentTarget.style.borderColor = `${HAVEN_COLORS.primary}30`
                        }}
                      >
                        <Search size={16} style={{color: HAVEN_COLORS.primary}} />
                      </button>
                    ) : (
                      <div className="relative flex-1 animate-in slide-in-from-left duration-300">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 transition-colors"
                                style={{color: HAVEN_COLORS.primary}} />
                        <input
                          id="new-search-input"
                          type="text"
                          placeholder="Search robots..."
                          value={newTokensSearch}
                          onChange={(e) => setNewTokensSearch(e.target.value)}
                          className="w-full pl-10 pr-10 py-2 rounded-xl text-sm text-white focus:outline-none transition-all duration-300"
                          style={{
                            backgroundColor: HAVEN_COLORS.elevated,
                            border: `2px solid ${HAVEN_COLORS.primary}`,
                            boxShadow: `0 0 20px ${HAVEN_COLORS.primary}40`
                          }}
                        />
                        <button
                          onClick={() => {
                            setShowNewSearch(false)
                            setNewTokensSearch('')
                          }}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          <XIcon size={14} style={{color: HAVEN_COLORS.textSecondary}} />
                        </button>
                      </div>
                    )}

                    <h3 className="text-white font-semibold flex items-center gap-2 whitespace-nowrap">
                      <Zap size={18} style={{color: HAVEN_COLORS.primary}} className="animate-pulse" />
                      New Robots
                    </h3>
                  </div>

                  {/* Filters Button */}
                  <button
                    onClick={() => setShowFilters(true)}
                    className="group p-2 rounded-xl transition-all duration-300 hover:scale-110 flex-shrink-0 cursor-pointer"
                    title="Open Filters"
                    style={{
                      backgroundColor: `${HAVEN_COLORS.primary}15`,
                      border: `2px solid ${HAVEN_COLORS.primary}30`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.primary}25`
                      e.currentTarget.style.borderColor = HAVEN_COLORS.primary
                      e.currentTarget.style.transform = 'scale(1.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.primary}15`
                      e.currentTarget.style.borderColor = `${HAVEN_COLORS.primary}30`
                      e.currentTarget.style.transform = 'scale(1)'
                    }}
                  >
                    <Filter size={16} style={{color: HAVEN_COLORS.primary}} />
                  </button>

                  {/* Buy Input Icon/Expander */}
                  {!showBuyInput ? (
                    <button
                      onClick={() => setShowBuyInput(true)}
                      className="group p-2 rounded-xl transition-all duration-300 hover:scale-110 animate-pulse hover:animate-none flex-shrink-0 cursor-pointer"
                      title="Configure buy amount"
                      style={{
                        backgroundColor: `${HAVEN_COLORS.success}15`,
                        border: `2px solid ${HAVEN_COLORS.success}30`
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.success}25`
                        e.currentTarget.style.borderColor = HAVEN_COLORS.success
                        e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.success}15`
                        e.currentTarget.style.borderColor = `${HAVEN_COLORS.success}30`
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    >
                      <DollarSign size={16} style={{color: HAVEN_COLORS.success}} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowBuyInput(false)}
                      className="group p-2 rounded-xl transition-all duration-300 hover:scale-110 flex-shrink-0"
                      style={{
                        backgroundColor: `${HAVEN_COLORS.danger}15`,
                        border: `2px solid ${HAVEN_COLORS.danger}30`
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.danger}25`
                        e.currentTarget.style.borderColor = HAVEN_COLORS.danger
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.danger}15`
                        e.currentTarget.style.borderColor = `${HAVEN_COLORS.danger}30`
                      }}
                    >
                      <XIcon size={16} style={{color: HAVEN_COLORS.danger}} />
                    </button>
                  )}
                </div>

                {/* Buy Amount Section - Slides down */}
                {showBuyInput && (
                  <div className="mt-3 animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-2 p-3 rounded-xl"
                         style={{
                           backgroundColor: `${HAVEN_COLORS.success}10`,
                           border: `2px solid ${HAVEN_COLORS.success}30`
                         }}>
                      <input
                        type="number"
                        step="10"
                        min="0"
                        value={buyAmount}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value)
                          if (!isNaN(value) && value >= 0) {
                            setBuyAmount(value)
                          }
                        }}
                        className="w-20 px-3 py-1.5 rounded-lg text-sm font-bold text-white text-center focus:outline-none transition-all"
                        style={{
                          backgroundColor: HAVEN_COLORS.elevated,
                          border: `2px solid ${HAVEN_COLORS.success}`,
                          boxShadow: `0 0 15px ${HAVEN_COLORS.success}30`
                        }}
                        placeholder="100"
                      />
                      <span className="text-sm font-semibold" style={{color: HAVEN_COLORS.success}}>HAVEN</span>
                      <div className="flex gap-1.5 flex-1">
                        {[10, 50, 100, 500].map((amount) => (
                          <button
                            key={amount}
                            onClick={() => setBuyAmount(amount)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 hover:scale-105 cursor-pointer"
                            title={`Set buy amount to ${amount} HAVEN`}
                            style={{
                              backgroundColor: buyAmount === amount ? HAVEN_COLORS.success : HAVEN_COLORS.elevated,
                              border: `2px solid ${buyAmount === amount ? HAVEN_COLORS.success : 'transparent'}`,
                              color: buyAmount === amount ? 'white' : HAVEN_COLORS.textSecondary
                            }}
                            onMouseEnter={(e) => {
                              if (buyAmount !== amount) {
                                e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.success}20`
                                e.currentTarget.style.borderColor = `${HAVEN_COLORS.success}50`
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (buyAmount !== amount) {
                                e.currentTarget.style.backgroundColor = HAVEN_COLORS.elevated
                                e.currentTarget.style.borderColor = 'transparent'
                              }
                            }}
                          >
                            {amount}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                <TokenList
                  tokens={categorizedTokens.newTokens}
                  loading={loading}
                  emptyMessage="No robots yet"
                  onTokenClick={handleTokenClick}
                  buyAmount={buyAmount}
                  onBuy={handleBuy}
                  tokenMetadata={tokenMetadata}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
            </div>

            {/* Almost Graduated Column */}
            <div className="overflow-hidden flex flex-col h-full rounded-xl"
                 style={{backgroundColor: HAVEN_COLORS.surface, border: `1px solid ${HAVEN_COLORS.border}`}}>
              <div className="px-4 py-3 border-b flex-shrink-0" style={{borderColor: HAVEN_COLORS.border}}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    {!showAlmostSearch ? (
                      <button
                        onClick={() => {
                          setShowAlmostSearch(true)
                          setTimeout(() => document.getElementById('almost-search-input')?.focus(), 100)
                        }}
                        className="group p-2 rounded-xl transition-all duration-300 hover:scale-110 animate-pulse hover:animate-none cursor-pointer"
                        style={{
                          backgroundColor: `${HAVEN_COLORS.warning}15`,
                          border: `2px solid ${HAVEN_COLORS.warning}30`
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.warning}25`
                          e.currentTarget.style.borderColor = HAVEN_COLORS.warning
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.warning}15`
                          e.currentTarget.style.borderColor = `${HAVEN_COLORS.warning}30`
                        }}
                      >
                        <Search size={16} style={{color: HAVEN_COLORS.warning}} />
                      </button>
                    ) : (
                      <div className="relative flex-1 animate-in slide-in-from-left duration-300">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 transition-colors"
                                style={{color: HAVEN_COLORS.warning}} />
                        <input
                          id="almost-search-input"
                          type="text"
                          placeholder="Search robots..."
                          value={almostGradSearch}
                          onChange={(e) => setAlmostGradSearch(e.target.value)}
                          className="w-full pl-10 pr-10 py-2 rounded-xl text-sm text-white focus:outline-none transition-all duration-300"
                          style={{
                            backgroundColor: HAVEN_COLORS.elevated,
                            border: `2px solid ${HAVEN_COLORS.warning}`,
                            boxShadow: `0 0 20px ${HAVEN_COLORS.warning}40`
                          }}
                        />
                        <button
                          onClick={() => {
                            setShowAlmostSearch(false)
                            setAlmostGradSearch('')
                          }}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          <XIcon size={14} style={{color: HAVEN_COLORS.textSecondary}} />
                        </button>
                      </div>
                    )}

                    <h3 className="text-white font-semibold flex items-center gap-2 whitespace-nowrap">
                      <Rocket size={18} style={{color: HAVEN_COLORS.warning}} className="animate-bounce" />
                      Almost Graduated
                    </h3>
                  </div>

                  {/* Filters Button */}
                  <button
                    onClick={() => setShowFilters(true)}
                    className="group p-2 rounded-xl transition-all duration-300 hover:scale-110 flex-shrink-0 cursor-pointer"
                    title="Open Filters"
                    style={{
                      backgroundColor: `${HAVEN_COLORS.primary}15`,
                      border: `2px solid ${HAVEN_COLORS.primary}30`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.primary}25`
                      e.currentTarget.style.borderColor = HAVEN_COLORS.primary
                      e.currentTarget.style.transform = 'scale(1.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.primary}15`
                      e.currentTarget.style.borderColor = `${HAVEN_COLORS.primary}30`
                      e.currentTarget.style.transform = 'scale(1)'
                    }}
                  >
                    <Filter size={16} style={{color: HAVEN_COLORS.primary}} />
                  </button>

                  {/* Buy Input Icon/Expander */}
                  {!showBuyInput ? (
                    <button
                      onClick={() => setShowBuyInput(true)}
                      className="group p-2 rounded-xl transition-all duration-300 hover:scale-110 animate-pulse hover:animate-none flex-shrink-0 cursor-pointer"
                      title="Configure buy amount"
                      style={{
                        backgroundColor: `${HAVEN_COLORS.success}15`,
                        border: `2px solid ${HAVEN_COLORS.success}30`
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.success}25`
                        e.currentTarget.style.borderColor = HAVEN_COLORS.success
                        e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.success}15`
                        e.currentTarget.style.borderColor = `${HAVEN_COLORS.success}30`
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    >
                      <DollarSign size={16} style={{color: HAVEN_COLORS.success}} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowBuyInput(false)}
                      className="group p-2 rounded-xl transition-all duration-300 hover:scale-110 flex-shrink-0"
                      style={{
                        backgroundColor: `${HAVEN_COLORS.danger}15`,
                        border: `2px solid ${HAVEN_COLORS.danger}30`
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.danger}25`
                        e.currentTarget.style.borderColor = HAVEN_COLORS.danger
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.danger}15`
                        e.currentTarget.style.borderColor = `${HAVEN_COLORS.danger}30`
                      }}
                    >
                      <XIcon size={16} style={{color: HAVEN_COLORS.danger}} />
                    </button>
                  )}
                </div>

                {/* Buy Amount Section - Slides down */}
                {showBuyInput && (
                  <div className="mt-3 animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-2 p-3 rounded-xl"
                         style={{
                           backgroundColor: `${HAVEN_COLORS.success}10`,
                           border: `2px solid ${HAVEN_COLORS.success}30`
                         }}>
                      <input
                        type="number"
                        step="10"
                        min="0"
                        value={buyAmount}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value)
                          if (!isNaN(value) && value >= 0) {
                            setBuyAmount(value)
                          }
                        }}
                        className="w-20 px-3 py-1.5 rounded-lg text-sm font-bold text-white text-center focus:outline-none transition-all"
                        style={{
                          backgroundColor: HAVEN_COLORS.elevated,
                          border: `2px solid ${HAVEN_COLORS.success}`,
                          boxShadow: `0 0 15px ${HAVEN_COLORS.success}30`
                        }}
                        placeholder="100"
                      />
                      <span className="text-sm font-semibold" style={{color: HAVEN_COLORS.success}}>HAVEN</span>
                      <div className="flex gap-1.5 flex-1">
                        {[10, 50, 100, 500].map((amount) => (
                          <button
                            key={amount}
                            onClick={() => setBuyAmount(amount)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 hover:scale-105 cursor-pointer"
                            title={`Set buy amount to ${amount} HAVEN`}
                            style={{
                              backgroundColor: buyAmount === amount ? HAVEN_COLORS.success : HAVEN_COLORS.elevated,
                              border: `2px solid ${buyAmount === amount ? HAVEN_COLORS.success : 'transparent'}`,
                              color: buyAmount === amount ? 'white' : HAVEN_COLORS.textSecondary
                            }}
                            onMouseEnter={(e) => {
                              if (buyAmount !== amount) {
                                e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.success}20`
                                e.currentTarget.style.borderColor = `${HAVEN_COLORS.success}50`
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (buyAmount !== amount) {
                                e.currentTarget.style.backgroundColor = HAVEN_COLORS.elevated
                                e.currentTarget.style.borderColor = 'transparent'
                              }
                            }}
                          >
                            {amount}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                <TokenList
                  tokens={categorizedTokens.almostGraduated}
                  loading={loading}
                  emptyMessage="No robots near graduation"
                  onTokenClick={handleTokenClick}
                  buyAmount={buyAmount}
                  onBuy={handleBuy}
                  tokenMetadata={tokenMetadata}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
            </div>

            {/* Graduated Column */}
            <div className="overflow-hidden flex flex-col h-full rounded-xl"
                 style={{backgroundColor: HAVEN_COLORS.surface, border: `1px solid ${HAVEN_COLORS.border}`}}>
              <div className="px-4 py-3 border-b flex-shrink-0" style={{borderColor: HAVEN_COLORS.border}}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    {!showGradSearch ? (
                      <button
                        onClick={() => {
                          setShowGradSearch(true)
                          setTimeout(() => document.getElementById('grad-search-input')?.focus(), 100)
                        }}
                        className="group p-2 rounded-xl transition-all duration-300 hover:scale-110 animate-pulse hover:animate-none cursor-pointer"
                        style={{
                          backgroundColor: `${HAVEN_COLORS.success}15`,
                          border: `2px solid ${HAVEN_COLORS.success}30`
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.success}25`
                          e.currentTarget.style.borderColor = HAVEN_COLORS.success
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.success}15`
                          e.currentTarget.style.borderColor = `${HAVEN_COLORS.success}30`
                        }}
                      >
                        <Search size={16} style={{color: HAVEN_COLORS.success}} />
                      </button>
                    ) : (
                      <div className="relative flex-1 animate-in slide-in-from-left duration-300">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 transition-colors"
                                style={{color: HAVEN_COLORS.success}} />
                        <input
                          id="grad-search-input"
                          type="text"
                          placeholder="Search robots..."
                          value={graduatedSearch}
                          onChange={(e) => setGraduatedSearch(e.target.value)}
                          className="w-full pl-10 pr-10 py-2 rounded-xl text-sm text-white focus:outline-none transition-all duration-300"
                          style={{
                            backgroundColor: HAVEN_COLORS.elevated,
                            border: `2px solid ${HAVEN_COLORS.success}`,
                            boxShadow: `0 0 20px ${HAVEN_COLORS.success}40`
                          }}
                        />
                        <button
                          onClick={() => {
                            setShowGradSearch(false)
                            setGraduatedSearch('')
                          }}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          <XIcon size={14} style={{color: HAVEN_COLORS.textSecondary}} />
                        </button>
                      </div>
                    )}

                    <h3 className="text-white font-semibold flex items-center gap-2 whitespace-nowrap">
                      <TrendingUp size={18} style={{color: HAVEN_COLORS.success}} />
                      Graduated
                    </h3>
                  </div>

                  {/* Filters Button */}
                  <button
                    onClick={() => setShowFilters(true)}
                    className="group p-2 rounded-xl transition-all duration-300 hover:scale-110 flex-shrink-0 cursor-pointer"
                    title="Open Filters"
                    style={{
                      backgroundColor: `${HAVEN_COLORS.primary}15`,
                      border: `2px solid ${HAVEN_COLORS.primary}30`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.primary}25`
                      e.currentTarget.style.borderColor = HAVEN_COLORS.primary
                      e.currentTarget.style.transform = 'scale(1.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.primary}15`
                      e.currentTarget.style.borderColor = `${HAVEN_COLORS.primary}30`
                      e.currentTarget.style.transform = 'scale(1)'
                    }}
                  >
                    <Filter size={16} style={{color: HAVEN_COLORS.primary}} />
                  </button>

                  {/* Buy Input Icon/Expander */}
                  {!showBuyInput ? (
                    <button
                      onClick={() => setShowBuyInput(true)}
                      className="group p-2 rounded-xl transition-all duration-300 hover:scale-110 animate-pulse hover:animate-none flex-shrink-0 cursor-pointer"
                      title="Configure buy amount"
                      style={{
                        backgroundColor: `${HAVEN_COLORS.success}15`,
                        border: `2px solid ${HAVEN_COLORS.success}30`
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.success}25`
                        e.currentTarget.style.borderColor = HAVEN_COLORS.success
                        e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.success}15`
                        e.currentTarget.style.borderColor = `${HAVEN_COLORS.success}30`
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    >
                      <DollarSign size={16} style={{color: HAVEN_COLORS.success}} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowBuyInput(false)}
                      className="group p-2 rounded-xl transition-all duration-300 hover:scale-110 flex-shrink-0"
                      style={{
                        backgroundColor: `${HAVEN_COLORS.danger}15`,
                        border: `2px solid ${HAVEN_COLORS.danger}30`
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.danger}25`
                        e.currentTarget.style.borderColor = HAVEN_COLORS.danger
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.danger}15`
                        e.currentTarget.style.borderColor = `${HAVEN_COLORS.danger}30`
                      }}
                    >
                      <XIcon size={16} style={{color: HAVEN_COLORS.danger}} />
                    </button>
                  )}
                </div>

                {/* Buy Amount Section - Slides down */}
                {showBuyInput && (
                  <div className="mt-3 animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-2 p-3 rounded-xl"
                         style={{
                           backgroundColor: `${HAVEN_COLORS.success}10`,
                           border: `2px solid ${HAVEN_COLORS.success}30`
                         }}>
                      <input
                        type="number"
                        step="10"
                        min="0"
                        value={buyAmount}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value)
                          if (!isNaN(value) && value >= 0) {
                            setBuyAmount(value)
                          }
                        }}
                        className="w-20 px-3 py-1.5 rounded-lg text-sm font-bold text-white text-center focus:outline-none transition-all"
                        style={{
                          backgroundColor: HAVEN_COLORS.elevated,
                          border: `2px solid ${HAVEN_COLORS.success}`,
                          boxShadow: `0 0 15px ${HAVEN_COLORS.success}30`
                        }}
                        placeholder="100"
                      />
                      <span className="text-sm font-semibold" style={{color: HAVEN_COLORS.success}}>HAVEN</span>
                      <div className="flex gap-1.5 flex-1">
                        {[10, 50, 100, 500].map((amount) => (
                          <button
                            key={amount}
                            onClick={() => setBuyAmount(amount)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 hover:scale-105 cursor-pointer"
                            title={`Set buy amount to ${amount} HAVEN`}
                            style={{
                              backgroundColor: buyAmount === amount ? HAVEN_COLORS.success : HAVEN_COLORS.elevated,
                              border: `2px solid ${buyAmount === amount ? HAVEN_COLORS.success : 'transparent'}`,
                              color: buyAmount === amount ? 'white' : HAVEN_COLORS.textSecondary
                            }}
                            onMouseEnter={(e) => {
                              if (buyAmount !== amount) {
                                e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.success}20`
                                e.currentTarget.style.borderColor = `${HAVEN_COLORS.success}50`
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (buyAmount !== amount) {
                                e.currentTarget.style.backgroundColor = HAVEN_COLORS.elevated
                                e.currentTarget.style.borderColor = 'transparent'
                              }
                            }}
                          >
                            {amount}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                <TokenList
                  tokens={categorizedTokens.graduated}
                  loading={loading}
                  emptyMessage="No graduated robots yet"
                  onTokenClick={handleTokenClick}
                  buyAmount={buyAmount}
                  onBuy={handleBuy}
                  tokenMetadata={tokenMetadata}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
