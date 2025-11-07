import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEthPrice } from '../../hooks/useEthPrice'
import { formatNumber } from '../../lib/utils'
import { TrendingUpIcon, SparkleIcon, LightningIcon } from '../../components/icons/AnimatedIcons'
import TokenImage from '../../components/TokenImage'
import { Star } from 'lucide-react'
import { useTokenTabsStore } from '../../stores/token-tabs-store'
import { supabase } from '../../lib/supabase'

const HAVEN_COLORS = {
  warning: '#FFB800'
}

export default function TokenMarquee({ mode = 'trending', robots = [], favoritesHook }) {
  const navigate = useNavigate()
  // FIXED: Don't use mode prop for state initialization, always use 'trending'
  // The mode prop was causing the state to reset when component remounts
  const [currentMode, setCurrentMode] = useState('trending')
  const { favorites, toggleFavorite } = favoritesHook
  const { ethPrice } = useEthPrice() // This now returns BNB price
  const { tabs, getTab } = useTokenTabsStore()
  const [priceChangesFromDB, setPriceChangesFromDB] = useState({})

  // Debug: Log when mode prop changes
  useEffect(() => {
    if (mode !== currentMode) {
    }
  }, [mode, currentMode])

  // Create a stable favorites lookup
  const favoritesSet = useMemo(() => new Set(favorites), [favorites])

  // Stabilize tokens array - only update when addresses or prices actually change
  const tokensStableRef = useRef([])
  const lastUpdateTimeRef = useRef(0)
  const tokens = useMemo(() => {
    const now = Date.now()
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current

    const newTokens = robots.map((token, idx) => {
      const priceChange = token.priceChange24h || token.price_change_24h || 0
      return {
        address: token.contractAddress || token.address,
        name: token.name,
        symbol: token.symbol,
        price: typeof token.price === 'number' ? token.price : parseFloat(token.price || '0'),
        priceChange24h: typeof priceChange === 'number' ? priceChange : parseFloat(priceChange || 0),
        volume24h: token.volume24h || '0',
        totalSupply: token.totalSupply || 0,
        source: 'bonding',
        timestamp: token.timestamp || Math.floor(Date.now() / 1000),
        imageUrl: token.imageUrl || token.image,
        image_url: token.imageUrl || token.image
      }
    })

    // Throttle updates to max once every 5 seconds
    if (timeSinceLastUpdate < 5000 && tokensStableRef.current.length > 0) {
      return tokensStableRef.current
    }

    // Only update if the hash actually changed
    const newHash = JSON.stringify(newTokens.map(t => ({ address: t.address, price: t.price, change: t.priceChange24h })))
    const oldHash = JSON.stringify(tokensStableRef.current.map(t => ({ address: t.address, price: t.price, change: t.priceChange24h })))

    if (newHash !== oldHash) {
      tokensStableRef.current = newTokens
      lastUpdateTimeRef.current = now
      return newTokens
    }

    // Return the old reference if nothing changed
    return tokensStableRef.current
  }, [robots])

  // Fetch price changes from database for displayed tokens
  useEffect(() => {
    const fetchPriceChanges = async () => {
      if (!tokens || tokens.length === 0) return

      const addresses = tokens.map(t => t.address).filter(Boolean)
      if (addresses.length === 0) return

      try {
        // Fetch all at once and filter in JS for case-insensitive matching
        const { data, error } = await supabase
          .from('robots')
          .select('bonding_contract, price_change_24h')
          .not('bonding_contract', 'is', null)

        if (!error && data) {
          // Create lookup set of lowercase addresses we're looking for
          const addressLookup = new Set(addresses.map(addr => addr.toLowerCase()))

          const priceChangesMap = {}
          data.forEach(row => {
            if (row.bonding_contract) {
              const lowerAddress = row.bonding_contract.toLowerCase()
              if (addressLookup.has(lowerAddress)) {
                priceChangesMap[lowerAddress] = row.price_change_24h
              }
            }
          })
          setPriceChangesFromDB(priceChangesMap)
        }
      } catch (err) {
        console.error('[Marquee] Error fetching price changes:', err)
      }
    }

    fetchPriceChanges()
    const interval = setInterval(fetchPriceChanges, 5000) // Fetch every 5 seconds

    return () => clearInterval(interval)
  }, [tokens])

  // INSTANT DISPLAY: Initialize empty (no SSR issues), load from cache in useEffect
  const [stableTokens, setStableTokens] = useState(() => {
    // Try to load from cache on initial mount for instant display
    // BUT only if it matches our current mode (trending)
    try {
      const cached = localStorage.getItem('marquee_tokens_cache')
      if (cached) {
        const { tokens: cachedTokens, timestamp: cacheTime, mode: cachedMode } = JSON.parse(cached)
        // Use cache if less than 5 minutes old AND matches current mode
        if (Date.now() - cacheTime < 5 * 60 * 1000 && cachedMode === 'trending') {
          return cachedTokens
        }
      }
    } catch (e) {
    }
    return []
  })

  const updateTimerRef = useRef(null)
  const hasInitializedRef = useRef(false)
  const favoritesRef = useRef(favorites)
  const lastProcessedTokensRef = useRef(null)

  // Process tokens function
  const processTokens = useCallback(() => {
    if (tokens.length === 0) return []

    let result = []

    console.log('[TokenMarquee] Processing tokens:', {
      totalTokens: tokens.length,
      mode: currentMode,
      sampleTokens: tokens.slice(0, 3).map(t => ({ symbol: t.symbol, change24h: t.priceChange24h }))
    })

    switch (currentMode) {
      case 'new-pairs':
        result = tokens
          .sort((a, b) => {
            const timeA = a.timestamp > 1000000000000 ? a.timestamp : a.timestamp * 1000
            const timeB = b.timestamp > 1000000000000 ? b.timestamp : b.timestamp * 1000
            return timeB - timeA
          })
          .slice(0, 20)
        break

      case 'favorites':
        // Get favorited tokens from useFavorites hook (synced with DB)
        // Only show favorited tokens, no fallback
        result = tokens
          .filter((token) => {
            const tokenAddr = token.address?.toLowerCase()
            return favorites.includes(tokenAddr)
          })
          .sort((a, b) => {
            // Sort by timestamp (newest first)
            const timeA = a.timestamp > 1000000000000 ? a.timestamp : a.timestamp * 1000
            const timeB = b.timestamp > 1000000000000 ? b.timestamp : b.timestamp * 1000
            return timeB - timeA
          })
        break

      case 'trending':
      default:
        // Trending: Tokens with highest positive price changes
        result = tokens
          .filter((token) => {
            const change = typeof token.priceChange24h === 'number'
              ? token.priceChange24h
              : parseFloat(token.priceChange24h) || 0
            return change > 0 // Only show positive changes
          })
          .sort((a, b) => {
            // Sort by price change percentage (highest first)
            const changeA = typeof a.priceChange24h === 'number' ? a.priceChange24h : parseFloat(a.priceChange24h) || 0
            const changeB = typeof b.priceChange24h === 'number' ? b.priceChange24h : parseFloat(b.priceChange24h) || 0

            // If price changes are equal, use address as tiebreaker for stable sort
            if (Math.abs(changeB - changeA) < 0.001) {
              return a.address.localeCompare(b.address)
            }
            return changeB - changeA
          })
          .slice(0, 20)

        // If no trending tokens, show newest
        if (result.length === 0) {
          result = tokens
            .sort((a, b) => {
              const timeA = a.timestamp > 1000000000000 ? a.timestamp : a.timestamp * 1000
              const timeB = b.timestamp > 1000000000000 ? b.timestamp : b.timestamp * 1000

              // If timestamps are equal, use address as tiebreaker
              if (timeB === timeA) {
                return a.address.localeCompare(b.address)
              }
              return timeB - timeA
            })
            .slice(0, 20)
        }
        break
    }

    // Don't duplicate tokens - instead fill with additional unique tokens if needed
    if (currentMode !== 'favorites') {
      const minTokensNeeded = 20
      if (result.length > 0 && result.length < minTokensNeeded) {
        console.log('[TokenMarquee] Need to fill tokens:', {
          currentCount: result.length,
          needed: minTokensNeeded,
          currentSymbols: result.map(t => t.symbol)
        })

        // Get addresses of already selected tokens
        const selectedAddresses = new Set(result.map(t => t.address.toLowerCase()))

        // Fill with newest tokens that aren't already selected
        const additionalTokens = tokens
          .filter(t => !selectedAddresses.has(t.address.toLowerCase()))
          .sort((a, b) => {
            const timeA = a.timestamp > 1000000000000 ? a.timestamp : a.timestamp * 1000
            const timeB = b.timestamp > 1000000000000 ? b.timestamp : b.timestamp * 1000
            return timeB - timeA
          })
          .slice(0, minTokensNeeded - result.length)

        console.log('[TokenMarquee] Added tokens:', additionalTokens.map(t => t.symbol))
        result = [...result, ...additionalTokens]
      }
    }

    console.log('[TokenMarquee] Final result:', result.length, 'tokens')
    return result
  }, [tokens, currentMode, favorites])

  // Initial immediate load
  useEffect(() => {
    if (tokens.length > 0 && !hasInitializedRef.current) {
      const result = processTokens()
      if (result.length > 0) {
        setStableTokens(result)
        hasInitializedRef.current = true

        // Cache the tokens for instant display on next load
        try {
          localStorage.setItem('marquee_tokens_cache', JSON.stringify({
            tokens: result,
            timestamp: Date.now(),
            mode: currentMode
          }))
        } catch (e) {
          // Ignore cache errors
        }
      }
    }
  }, [tokens])

  // Listen for favorites changes (automatically handled by useFavorites hook + processTokens dependency)
  useEffect(() => {
    // Only update if favorites actually changed (not just reference)
    const favoritesChanged = JSON.stringify(favoritesRef.current.sort()) !== JSON.stringify([...favorites].sort())

    if (hasInitializedRef.current && favoritesChanged) {
      favoritesRef.current = favorites
      const result = processTokens()

      // Always update when favorites change, regardless of addresses
      // (the filter logic changes based on favorites)
      lastProcessedTokensRef.current = JSON.stringify(result.map(t => t.address))
      setStableTokens(result)
    }
  }, [favorites, processTokens])

  // Disabled: Debounced updates were causing flickering
  // Only update on mode change or favorites change now
  /*
  useEffect(() => {
    if (!hasInitializedRef.current) return

    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current)
    }

    updateTimerRef.current = setTimeout(() => {
      const result = processTokens()

      // Only update if result is different
      const resultHash = JSON.stringify(result.map(t => t.address))
      if (lastProcessedTokensRef.current !== resultHash) {
        lastProcessedTokensRef.current = resultHash
        setStableTokens(result)

        // Update cache for next page load
        try {
          localStorage.setItem('marquee_tokens_cache', JSON.stringify({
            tokens: result,
            timestamp: Date.now()
          }))
        } catch (e) {
          // Ignore cache errors
        }
      }
    }, 30000)

    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current)
      }
    }
  }, [tokens, currentMode, processTokens])
  */

  // Force update when switching modes
  useEffect(() => {
    if (hasInitializedRef.current) {
      // Immediately re-process when mode changes
      const result = processTokens()

      // Only update if result is different
      const resultHash = JSON.stringify(result.map(t => t.address))
      if (lastProcessedTokensRef.current !== resultHash) {
        lastProcessedTokensRef.current = resultHash
        setStableTokens(result)

        // Update cache with new mode
        try {
          localStorage.setItem('marquee_tokens_cache', JSON.stringify({
            tokens: result,
            timestamp: Date.now(),
            mode: currentMode
          }))
        } catch (e) {
          // Ignore cache errors
        }
      }
    }
  }, [currentMode])

  const filteredTokens = stableTokens
  const isLoading = !hasInitializedRef.current && stableTokens.length === 0

  // Don't show anything if in favorites mode and no favorites
  const shouldShowMarquee = currentMode !== 'favorites' || filteredTokens.length > 0

  const getModeIcon = (mode) => {
    switch (mode) {
      case 'trending': return TrendingUpIcon
      case 'favorites': return SparkleIcon
      case 'new-pairs': return LightningIcon
    }
  }

  const getModeLabel = (mode) => {
    switch (mode) {
      case 'trending': return 'Trending'
      case 'favorites': return 'Favorites'
      case 'new-pairs': return 'New Pairs'
    }
  }

  // Show loading skeleton on first load (no cache)
  if (isLoading) {
    return (
      <div className="glass-effect border-y border-white/10 py-1 overflow-hidden relative">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 px-3 flex-shrink-0">
            <div className="flex items-center gap-1 border-r border-white/20 pr-3">
              <div className="w-5 h-5 bg-white/10 rounded-2xl animate-pulse"></div>
              <div className="w-5 h-5 bg-white/10 rounded-2xl animate-pulse"></div>
              <div className="w-5 h-5 bg-white/10 rounded-2xl animate-pulse"></div>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="flex gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-1 flex-shrink-0">
                  <div className="w-4 h-4 bg-white/10 rounded-full animate-pulse"></div>
                  <div className="w-8 h-3 bg-white/10 rounded animate-pulse"></div>
                  <div className="w-12 h-3 bg-white/10 rounded animate-pulse"></div>
                  <div className="w-6 h-3 bg-white/10 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show mode selector always, but hide tokens if in favorites mode with no favorites
  const hasTokensToShow = currentMode !== 'favorites' || filteredTokens.length > 0

  return (
    <div className="glass-effect border-y border-white/10 py-1 overflow-hidden relative">
      <div className="flex items-center gap-3">
        {/* Mode Selector - Small Icons Only */}
        <div className="flex items-center gap-1 px-3 flex-shrink-0">
          <div className="flex items-center gap-1 border-r border-white/20 pr-3">
            {(['trending', 'favorites', 'new-pairs']).map((mode) => {
              const Icon = getModeIcon(mode)
              const isActive = currentMode === mode

              return (
                <button
                  key={mode}
                  onClick={() => setCurrentMode(mode)}
                  className={`p-1 rounded-2xl transition-all duration-300 ${
                    isActive
                      ? 'bg-white/20 text-white rainbow-glow'
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                  title={getModeLabel(mode)}
                >
                  <Icon size={12} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Static Tokens - Clean Display */}
        {hasTokensToShow ? (
          <div className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-hide">
            <div className="flex gap-4 whitespace-nowrap">
              {/* Show tokens without duplication */}
              {filteredTokens.map((token, index) => {
              // Use price directly from token data (already in USD)
              const priceUSD = token.price || 0

              // Get price change from database, fallback to token data
              const dbPriceChange = priceChangesFromDB[token.address?.toLowerCase()]
              const change = dbPriceChange !== undefined
                ? dbPriceChange
                : (typeof token.priceChange24h === 'number' ? token.priceChange24h : parseFloat(token.priceChange24h) || 0)

              const isPositive = change > 0
              const tokenIsFavorite = favoritesSet.has(token.address?.toLowerCase())

              return (
                <div
                  key={`${token.address}-${index}-${tokenIsFavorite}`}
                  className="flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded-full transition-all duration-200 hover:bg-white/10 group cursor-pointer"
                >
                  {/* Star Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(token.address)
                    }}
                    className={`${tokenIsFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-200 p-0.5 hover:scale-110`}
                    title={tokenIsFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star
                      size={12}
                      fill={tokenIsFavorite ? HAVEN_COLORS.warning : 'none'}
                      stroke={tokenIsFavorite ? HAVEN_COLORS.warning : 'currentColor'}
                      className="text-gray-400"
                    />
                  </button>

                  {/* Token content - clickable for navigation */}
                  <div
                    onClick={() => navigate(`/market/${token.address}`)}
                    className="flex items-center gap-1 flex-1"
                  >
                    {/* Token Logo - smaller */}
                    <div className="w-4 h-4 rounded-full overflow-hidden flex-shrink-0">
                      <TokenImage token={token} size="xs" showHalo={currentMode === 'trending'} />
                    </div>

                    {/* Token Symbol */}
                    <span className="text-white font-medium text-[11px]">{token.symbol}</span>

                    {/* Price */}
                    <span className="text-gray-300 text-[11px]">
                      ${priceUSD.toFixed(6)}
                    </span>

                    {/* 24h Change */}
                    <span className={`text-[11px] font-extrabold ${
                      change >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </span>
                  </div>
                </div>
              )
            })}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-gray-500 text-xs">No favorites yet. Star tokens to add them here!</span>
          </div>
        )}
      </div>
    </div>
  )
}
