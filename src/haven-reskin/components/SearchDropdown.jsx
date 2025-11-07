import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { History, X as XIcon, Clock, TrendingUp, Users, Droplet, BarChart3, Copy, Twitter, Globe, Loader2, ExternalLink } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
)

const HAVEN_COLORS = {
  primary: '#4169e1',
  primaryLight: '#6495ed',
  surface: '#1a1a1a',
  elevated: '#2a2a2a',
  border: '#333333',
  textPrimary: '#ffffff',
  textSecondary: '#a0a0a0',
}

// Helper functions for search history
const HISTORY_KEY = 'haven_search_history'
const MAX_HISTORY = 10

const getSearchHistory = () => {
  if (typeof window === 'undefined') return []
  try {
    const history = localStorage.getItem(HISTORY_KEY)
    return history ? JSON.parse(history) : []
  } catch (e) {
    return []
  }
}

const addToSearchHistory = async (token, userAddress, supabase) => {
  if (typeof window === 'undefined') return

  try {
    // Save to localStorage (instant)
    let history = getSearchHistory()
    history = history.filter(t => t.address.toLowerCase() !== token.address.toLowerCase())
    history.unshift(token)
    history = history.slice(0, MAX_HISTORY)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))

    // Sync to database if user is connected
    if (userAddress && supabase) {
      console.log('Saving to DB:', {
        user_address: userAddress.toLowerCase(),
        token_address: token.address.toLowerCase(),
        token_name: token.name,
        token_symbol: token.symbol,
        token_image_url: token.imageUrl,
      })

      // Use upsert to update or insert (prevents duplicates with unique constraint)
      const { data, error } = await supabase
        .from('user_search_history')
        .upsert({
          user_address: userAddress.toLowerCase(),
          token_address: token.address.toLowerCase(),
          token_name: token.name,
          token_symbol: token.symbol,
          token_image_url: token.imageUrl,
          searched_at: new Date().toISOString(),
        }, {
          onConflict: 'user_address,token_address'
        })

      if (error) {
        console.error('Failed to save to DB:', error)
      } else {
        console.log('Saved to DB successfully:', data)
      }
    }
  } catch (e) {
    console.error('Failed to save search history:', e)
  }
}

const clearSearchHistory = async (userAddress, supabase) => {
  if (typeof window === 'undefined') return

  try {
    // Clear localStorage
    localStorage.removeItem(HISTORY_KEY)

    // Clear from database if user is connected
    if (userAddress && supabase) {
      await supabase
        .from('user_search_history')
        .delete()
        .eq('user_address', userAddress.toLowerCase())
    }
  } catch (e) {
    console.error('Failed to clear search history:', e)
  }
}

const loadSearchHistoryFromDB = async (userAddress, supabase) => {
  try {
    console.log('Loading search history for:', userAddress.toLowerCase())

    const { data, error } = await supabase
      .from('user_search_history')
      .select('*')
      .eq('user_address', userAddress.toLowerCase())
      .order('searched_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Error fetching search history:', error)
      return []
    }

    console.log('Search history from DB:', data)

    if (data && data.length > 0) {
      // Use RobotApi to get fresh token data (same as search results)
      const { RobotApi } = await import('../../utils/api')
      const { normalizeRobots } = await import('../../utils/robotUtils')

      const allRobots = await RobotApi.getAllRobots(undefined)
      const normalized = normalizeRobots(allRobots, {})

      // Helper to convert IPFS URLs
      const convertIpfsUrl = (url) => {
        if (!url) return url
        if (url.startsWith('ipfs://')) {
          return `https://ipfs.io/ipfs/${url.replace('ipfs://', '')}`
        }
        return url
      }

      // Create a map of normalized robots by contract address
      const robotsMap = {}
      normalized.forEach(robot => {
        if (robot.contractAddress) {
          robotsMap[robot.contractAddress.toLowerCase()] = robot
        }
      })

      // Merge history order with fresh normalized data
      return data.map((item) => {
        const robot = robotsMap[item.token_address.toLowerCase()]
        if (robot) {
          // For graduated tokens: calculate market cap as price * total_supply (like Factory does)
          const isGraduated = robot.is_graduated || robot.isGraduated || robot.graduated
          const marketCap = isGraduated && robot.total_supply
            ? (robot.price || 0) * robot.total_supply
            : (robot.market_cap || robot.fdv || 0)

          return {
            address: robot.contractAddress,
            name: robot.name,
            symbol: robot.ticker,
            imageUrl: convertIpfsUrl(robot.image),
            price: robot.price || robot.token?.price || 0,
            marketCap: marketCap,
            volume24h: robot.volume_24h || robot.volume24h || 0,
            priceChange24h: robot.price_change_24h || robot.change24h || 0,
            holders: robot.holders_count || 0,
            liquidity: robot.liquidity || 0,
            timestamp: robot.timestamp || robot.created_at,
            twitter: robot.twitter,
            telegram: robot.telegram,
            website: robot.website,
          }
        } else {
          // Fallback if token not found in API response
          return {
            address: item.token_address,
            name: item.token_name,
            symbol: item.token_symbol,
            imageUrl: item.token_image_url,
            price: 0,
            marketCap: 0,
            volume24h: 0,
            priceChange24h: 0,
            holders: 0,
            liquidity: 0,
            timestamp: item.searched_at,
          }
        }
      })
    }
    return []
  } catch (e) {
    console.error('Failed to load search history from DB:', e)
    return []
  }
}

const formatNumber = (num) => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`
  return num.toFixed(2)
}

const formatAddress = (address) => {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const getTimeAgo = (timestamp) => {
  if (!timestamp) return 'Unknown'
  const now = Date.now()
  const time = timestamp > 1000000000000 ? timestamp : timestamp * 1000
  const diff = now - time

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

export default function SearchDropdown({
  tokens,
  loading,
  onSelectToken,
  searchQuery,
  showHistory = false
}) {
  const navigate = useNavigate()
  const { address: userAddress, isConnected } = useAccount()
  const [sortBy, setSortBy] = useState('time')
  const [copiedAddress, setCopiedAddress] = useState(null)
  const [history, setHistory] = useState([])

  // Load history from DB when user connects
  useEffect(() => {
    const loadHistory = async () => {
      if (userAddress) {
        const dbHistory = await loadSearchHistoryFromDB(userAddress, supabase)
        if (dbHistory.length > 0) {
          setHistory(dbHistory)
          // Update localStorage with DB history
          localStorage.setItem(HISTORY_KEY, JSON.stringify(dbHistory))
        } else {
          // Fallback to localStorage
          setHistory(getSearchHistory())
        }
      } else {
        // Not connected, use localStorage only
        setHistory(getSearchHistory())
      }
    }
    loadHistory()
  }, [userAddress])

  const handleClearHistory = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    await clearSearchHistory(userAddress, supabase)
    setHistory([])
  }

  const handleSelectToken = async (token) => {
    await addToSearchHistory(token, userAddress, supabase)
    // Reload history to show the updated list
    if (userAddress) {
      const dbHistory = await loadSearchHistoryFromDB(userAddress, supabase)
      setHistory(dbHistory.length > 0 ? dbHistory : getSearchHistory())
    } else {
      setHistory(getSearchHistory())
    }
    onSelectToken(token.address)
  }

  const copyAddress = (address, e) => {
    e.stopPropagation()
    e.preventDefault()
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => setCopiedAddress(null), 2000)
  }

  const getNumericValue = (value) => {
    if (typeof value === 'bigint') return Number(value) / 1e18
    if (typeof value === 'string') return parseFloat(value)
    return value || 0
  }

  const sortedTokens = [...tokens].sort((a, b) => {
    switch (sortBy) {
      case 'time':
        // Handle both timestamp formats (epoch seconds/milliseconds and ISO strings)
        const getTimestamp = (token) => {
          if (!token.timestamp) return 0
          if (typeof token.timestamp === 'string') {
            return new Date(token.timestamp).getTime()
          }
          // If timestamp is in seconds (< 10000000000), convert to milliseconds
          return token.timestamp < 10000000000 ? token.timestamp * 1000 : token.timestamp
        }
        return getTimestamp(b) - getTimestamp(a)
      case 'mcap':
        return getNumericValue(b.marketCap) - getNumericValue(a.marketCap)
      case 'holders':
        return (b.holders || 0) - (a.holders || 0)
      case 'liquidity':
        return getNumericValue(b.liquidity) - getNumericValue(a.liquidity)
      case 'volume':
        return getNumericValue(b.volume24h) - getNumericValue(a.volume24h)
      default:
        return 0
    }
  })

  // Show history when no search query and not loading
  console.log('SearchDropdown render:', { showHistory, searchQuery, loading, historyLength: history.length })

  if (showHistory && !searchQuery && !loading) {
    if (history.length === 0) {
      // Show empty state for first-time users
      return (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl shadow-2xl overflow-hidden z-[200]"
             style={{
               background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated}ee 0%, ${HAVEN_COLORS.surface}dd 100%)`,
               border: `1.5px solid ${HAVEN_COLORS.border}60`,
               backdropFilter: 'blur(16px)',
               boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
             }}>
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                 style={{
                   background: `linear-gradient(135deg, ${HAVEN_COLORS.surface}cc 0%, ${HAVEN_COLORS.elevated}bb 100%)`,
                   border: `1px solid ${HAVEN_COLORS.border}60`
                 }}>
              <History className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-sm font-semibold text-gray-400 mb-1">Start typing to search</p>
            <p className="text-xs text-gray-500">Search for robots by name, symbol, or address</p>
          </div>
        </div>
      )
    }

    return (
      <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl shadow-2xl overflow-hidden z-[200] max-h-[400px] overflow-y-auto"
           style={{
             background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated}ee 0%, ${HAVEN_COLORS.surface}dd 100%)`,
             border: `1.5px solid ${HAVEN_COLORS.border}60`,
             backdropFilter: 'blur(16px)',
             boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
           }}>
        {/* History Header */}
        <div className="sticky top-0 px-4 py-3 z-10"
             style={{
               background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated}ee 0%, ${HAVEN_COLORS.surface}dd 100())`,
               borderBottom: `1px solid ${HAVEN_COLORS.border}60`,
               backdropFilter: 'blur(12px)'
             }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4" style={{color: HAVEN_COLORS.primaryLight}} />
              <span className="text-xs font-bold text-white uppercase tracking-wide">Recent Searches</span>
            </div>
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all duration-200"
              style={{
                background: `${HAVEN_COLORS.surface}88`,
                border: `1px solid ${HAVEN_COLORS.border}40`,
                color: HAVEN_COLORS.textSecondary
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ef444433'
                e.currentTarget.style.borderColor = '#ef4444'
                e.currentTarget.style.color = '#f87171'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `${HAVEN_COLORS.surface}88`
                e.currentTarget.style.borderColor = `${HAVEN_COLORS.border}40`
                e.currentTarget.style.color = HAVEN_COLORS.textSecondary
              }}
            >
              <XIcon className="w-3 h-3" />
              Clear
            </button>
          </div>
        </div>

        {/* History List */}
        <div className="divide-y" style={{borderColor: `${HAVEN_COLORS.border}40`}}>
          {history.map((token, idx) => (
            <TokenRow
              key={token.address}
              token={token}
              onClick={() => handleSelectToken(token)}
              copyAddress={copyAddress}
              copiedAddress={copiedAddress}
              isHistory={true}
            />
          ))}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl shadow-2xl overflow-hidden z-[200]"
           style={{
             background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated}ee 0%, ${HAVEN_COLORS.surface}dd 100%)`,
             border: `1.5px solid ${HAVEN_COLORS.border}60`,
             backdropFilter: 'blur(16px)'
           }}>
        <div className="p-12 flex flex-col items-center justify-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
                 style={{borderColor: `${HAVEN_COLORS.primary} transparent transparent transparent`}} />
            <div className="absolute inset-2 rounded-full border-4 border-b-transparent animate-spin"
                 style={{
                   borderColor: `transparent transparent ${HAVEN_COLORS.primaryLight} transparent`,
                   animationDirection: 'reverse',
                   animationDuration: '1s'
                 }} />
          </div>
          <p className="text-sm font-semibold text-gray-400">Searching...</p>
        </div>
      </div>
    )
  }

  if (tokens.length === 0 && searchQuery) {
    return (
      <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl shadow-2xl overflow-hidden z-[200]"
           style={{
             background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated}ee 0%, ${HAVEN_COLORS.surface}dd 100%)`,
             border: `1.5px solid ${HAVEN_COLORS.border}60`,
             backdropFilter: 'blur(16px)'
           }}>
        <div className="p-12 text-center">
          <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center"
               style={{
                 background: `linear-gradient(135deg, ${HAVEN_COLORS.surface}cc 0%, ${HAVEN_COLORS.elevated}bb 100%)`,
                 border: `1px solid ${HAVEN_COLORS.border}60`
               }}>
            <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-400 mb-1">No tokens found</p>
          <p className="text-xs text-gray-500">Try searching for a different token</p>
        </div>
      </div>
    )
  }

  if (tokens.length === 0) {
    return null
  }

  return (
    <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl shadow-2xl overflow-hidden z-[200] max-h-[500px] overflow-y-auto"
         style={{
           background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated}ee 0%, ${HAVEN_COLORS.surface}dd 100%)`,
           border: `1.5px solid ${HAVEN_COLORS.border}60`,
           backdropFilter: 'blur(16px)',
           boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
         }}>
      {/* Header with Sort Controls */}
      <div className="sticky top-0 px-4 py-3 z-10"
           style={{
             background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated}ee 0%, ${HAVEN_COLORS.surface}dd 100%)`,
             borderBottom: `1px solid ${HAVEN_COLORS.border}60`,
             backdropFilter: 'blur(12px)'
           }}>
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {sortedTokens.length} result{sortedTokens.length !== 1 ? 's' : ''}
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide mr-2" style={{color: HAVEN_COLORS.textSecondary}}>
              Sort:
            </span>
            {[
              { id: 'time', icon: Clock, title: 'Time deployed' },
              { id: 'mcap', icon: TrendingUp, title: 'Market cap' },
              { id: 'holders', icon: Users, title: 'Holders' },
              { id: 'liquidity', icon: Droplet, title: 'Liquidity' },
              { id: 'volume', icon: BarChart3, title: '24h volume' }
            ].map(({ id, icon: Icon, title }) => (
              <button
                key={id}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setSortBy(id)
                }}
                className="p-1.5 rounded-lg transition-all duration-200 cursor-pointer"
                style={{
                  background: sortBy === id ? `${HAVEN_COLORS.primary}44` : 'transparent',
                  color: sortBy === id ? HAVEN_COLORS.primaryLight : HAVEN_COLORS.textSecondary,
                  border: `1px solid ${sortBy === id ? HAVEN_COLORS.primary : 'transparent'}`,
                  transform: 'scale(1)'
                }}
                title={title}
                onMouseEnter={(e) => {
                  if (sortBy !== id) {
                    e.currentTarget.style.background = `${HAVEN_COLORS.primary}22`
                  }
                  e.currentTarget.style.transform = 'scale(1.1)'
                }}
                onMouseLeave={(e) => {
                  if (sortBy !== id) {
                    e.currentTarget.style.background = 'transparent'
                  }
                  e.currentTarget.style.transform = 'scale(1)'
                }}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Token List */}
      <div className="divide-y" style={{borderColor: `${HAVEN_COLORS.border}40`}}>
        {sortedTokens.slice(0, 10).map((token) => (
          <TokenRow
            key={token.address}
            token={token}
            onClick={() => handleSelectToken(token)}
            copyAddress={copyAddress}
            copiedAddress={copiedAddress}
          />
        ))}
      </div>

      {/* Footer - Show More */}
      {sortedTokens.length > 10 && (
        <div className="sticky bottom-0 px-4 py-3 text-center"
             style={{
               background: `linear-gradient(135deg, ${HAVEN_COLORS.elevated}ee 0%, ${HAVEN_COLORS.surface}dd 100%)`,
               borderTop: `1px solid ${HAVEN_COLORS.border}60`,
               backdropFilter: 'blur(12px)'
             }}>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            className="text-xs font-semibold transition-colors px-4 py-2 rounded-lg"
            style={{
              color: HAVEN_COLORS.primaryLight,
              background: `${HAVEN_COLORS.primary}22`,
              border: `1px solid ${HAVEN_COLORS.primary}40`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${HAVEN_COLORS.primary}44`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `${HAVEN_COLORS.primary}22`
            }}
          >
            View all {sortedTokens.length} results
          </button>
        </div>
      )}
    </div>
  )
}

function TokenRow({ token, onClick, copyAddress, copiedAddress, isHistory = false }) {
  const marketCap = typeof token.marketCap === 'bigint' ? Number(token.marketCap) / 1e18 : (token.marketCap || 0)
  const volume24h = typeof token.volume24h === 'bigint' ? Number(token.volume24h) / 1e18 : (token.volume24h || 0)
  const liquidity = typeof token.liquidity === 'bigint' ? Number(token.liquidity) / 1e18 : (token.liquidity || 0)

  return (
    <div
      onClick={onClick}
      className="px-4 py-3 cursor-pointer group transition-all duration-200"
      style={{background: 'transparent'}}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `linear-gradient(90deg, ${HAVEN_COLORS.primary}08 0%, ${HAVEN_COLORS.primaryLight}05 100%)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <div className="flex items-start gap-3">
        {/* Token Image */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden"
             style={{
               background: `linear-gradient(135deg, ${HAVEN_COLORS.surface} 0%, ${HAVEN_COLORS.elevated} 100%)`,
               border: `1px solid ${HAVEN_COLORS.border}60`
             }}>
          {token.imageUrl ? (
            <img src={token.imageUrl} alt={token.symbol} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-500">
              {token.symbol?.[0] || '?'}
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Top Row */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-bold text-sm">{token.symbol}</span>
            <span className="text-gray-400 text-xs truncate">{token.name}</span>
            <span className="text-gray-500 text-xs ml-auto flex-shrink-0">
              {getTimeAgo(token.timestamp)}
            </span>
          </div>

          {/* Contract Address */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={(e) => copyAddress(token.address, e)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition-all duration-200 cursor-pointer"
              style={{
                background: `${HAVEN_COLORS.surface}88`,
                border: `1px solid ${HAVEN_COLORS.border}40`,
                color: '#60a5fa',
                transform: 'scale(1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${HAVEN_COLORS.primary}22`
                e.currentTarget.style.borderColor = HAVEN_COLORS.primary
                e.currentTarget.style.color = HAVEN_COLORS.primaryLight
                e.currentTarget.style.transform = 'scale(1.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `${HAVEN_COLORS.surface}88`
                e.currentTarget.style.borderColor = `${HAVEN_COLORS.border}40`
                e.currentTarget.style.color = '#60a5fa'
                e.currentTarget.style.transform = 'scale(1)'
              }}
            >
              {formatAddress(token.address)}
              <Copy className={`w-3 h-3 transition-colors ${
                copiedAddress === token.address ? 'text-green-400' : ''
              }`} />
            </button>

            {/* Social Links */}
            {token.twitter && (
              <a
                href={token.twitter}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1 text-gray-500 hover:text-[#1DA1F2] transition-colors"
              >
                <Twitter className="w-3.5 h-3.5" />
              </a>
            )}
            {token.website && (
              <a
                href={token.website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1 text-gray-500 hover:text-white transition-colors"
              >
                <Globe className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {/* Stats Row */}
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-gray-500">MC: </span>
              <span className="text-white font-semibold">${formatNumber(marketCap)}</span>
            </div>
            <div>
              <span className="text-gray-500">Vol: </span>
              <span className="text-white font-semibold">${formatNumber(volume24h)}</span>
            </div>
            <div>
              <span className="text-gray-500">Liq: </span>
              <span className="text-white font-semibold">${formatNumber(liquidity)}</span>
            </div>
            <div>
              <span className="text-gray-500">Holders: </span>
              <span className="text-white font-semibold">{token.holders || 0}</span>
            </div>
          </div>
        </div>

        {/* Arrow Icon */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
          <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
        </div>
      </div>
    </div>
  )
}
