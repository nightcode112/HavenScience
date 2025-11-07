/**
 * Wallet Analysis API
 * Calculates devHolds, top10Holds, phishingHolds, snipersHold, insidersHold
 * Based on D:\haven\src\pages\api\wallet-analysis.ts
 */

import { supabase, HoldingsApi } from '../lib/supabase.js'
import { reloadWalletFlags, getWalletFlags } from '../lib/walletDetection.js'

// Cache for analysis results (5 minute TTL)
const analysisCache = new Map()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

/**
 * Get net buy in last 1 minute (in HAVEN/ETH)
 */
async function getNetBuy1m(tokenAddress) {
  try {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()

    // Get all trades in the last minute from bonding_trades
    const { data: bondingTrades, error: bondingError } = await supabase
      .from('bonding_trades')
      .select('trade_type, eth_amount')
      .eq('token_address', tokenAddress)
      .gte('timestamp', oneMinuteAgo)

    // Also check the 'trades' table as fallback
    const { data: legacyTrades, error: legacyError } = await supabase
      .from('trades')
      .select('type, ethIn, ethOut')
      .eq('contract', tokenAddress)
      .gte('created_at', oneMinuteAgo)

    const allTrades = []

    // Process bonding_trades
    if (!bondingError && bondingTrades) {
      allTrades.push(...bondingTrades.map(t => ({
        type: t.trade_type,
        ethAmount: parseFloat(t.eth_amount?.toString() || '0')
      })))
    }

    // Process legacy trades
    if (!legacyError && legacyTrades) {
      allTrades.push(...legacyTrades.map(t => ({
        type: t.type,
        ethAmount: t.type === 'buy' ? parseFloat(t.ethIn?.toString() || '0') : parseFloat(t.ethOut?.toString() || '0')
      })))
    }

    if (allTrades.length === 0) {
      return 0
    }

    // Calculate net buy (buys - sells) in ETH
    const netBuyWei = allTrades.reduce((sum, trade) => {
      const amount = trade.ethAmount
      return trade.type === 'buy' ? sum + amount : sum - amount
    }, 0)

    // Convert from wei to ETH and round to 2 decimals
    return parseFloat((netBuyWei / 1e18).toFixed(2))
  } catch (error) {
    console.error(`Failed to calculate netBuy1m for ${tokenAddress}:`, error)
    return 0
  }
}

/**
 * Analyze wallet holdings for a single token
 * NOW READS FROM DATABASE (indexed by blockchain indexer script)
 * @param {string} tokenAddress - The token contract address
 * @param {object} tokenData - Optional: The token object if already fetched (avoids redundant DB lookup)
 */
export async function analyzeToken(tokenAddress, tokenData = null) {
  try {
    // Skip invalid addresses
    if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
      return {
        devHolds: 0,
        top10Holds: 0,
        phishingHolds: 0,
        snipersHold: 0,
        insidersHold: 0,
        holdersCount: 0,
        netBuy1m: 0
      }
    }

    // Check cache first
    const cached = analysisCache.get(tokenAddress)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data
    }

    // Use provided token data or fetch from database
    let token = tokenData

    if (!token) {
      // Get token info - check both contract and bonding_contract fields
      // Try bonding_contract first
      const { data: bondingToken, error: bondingError } = await supabase
        .from('robots')
        .select('*')
        .eq('bonding_contract', tokenAddress)
        .maybeSingle()

      if (bondingToken) {
        token = bondingToken
      } else {
        // Fall back to contract field
        const { data: contractToken, error: contractError } = await supabase
          .from('robots')
          .select('*')
          .eq('contract', tokenAddress)
          .maybeSingle()

        token = contractToken
      }

      if (!token) {
        return {
          devHolds: 0,
          top10Holds: 0,
          phishingHolds: 0,
          snipersHold: 0,
          insidersHold: 0,
          holdersCount: 0,
          netBuy1m: 0
        }
      }
    }

    // Read metadata from extras field (populated by blockchain indexer)
    const extras = token.extras || {}

    // Use net_buy_24h from database (already in USD)
    const netBuy1m = token.net_buy_24h || 0

    // If extras has indexed data, use it
    if (extras.lastIndexed) {
      const result = {
        devHolds: extras.devHolds || 0,
        top10Holds: extras.top10Holds || 0,
        phishingHolds: extras.phishingHolds || 0,
        snipersHold: extras.snipersHold || 0,
        insidersHold: extras.insidersHold || 0,
        holdersCount: token.holders_count || 0,
        netBuy1m: netBuy1m
      }

      // Cache result
      analysisCache.set(tokenAddress, { data: result, timestamp: Date.now() })

      return result
    }

    // Fallback: Calculate from bonding_holdings table (old method)

    // Reload wallet flags
    await reloadWalletFlags(true)
    const flags = getWalletFlags()

    const creatorAddress = token?.wallet
    const totalSupply = parseFloat(token?.total_supply || 1000000)

    // Get all holdings for this token
    const holdings = await HoldingsApi.getTokenHolders(tokenAddress, 1000)

    // Filter out token contract and Uniswap pool
    const pairAddress = token?.uniswap_pool_address
    const filteredHoldings = holdings.filter(h => {
      const addr = h.holder_address.toLowerCase()
      return addr !== tokenAddress.toLowerCase() &&
             (!pairAddress || addr !== pairAddress.toLowerCase())
    })

    // Use net_buy_24h from database (already in USD)
    const netBuy1mFromDb = token.net_buy_24h || 0

    if (filteredHoldings.length === 0) {
      const result = {
        devHolds: 0,
        top10Holds: 0,
        phishingHolds: 0,
        snipersHold: 0,
        insidersHold: 0,
        holdersCount: 0,
        netBuy1m: netBuy1mFromDb
      }
      analysisCache.set(tokenAddress, { data: result, timestamp: Date.now() })
      return result
    }

    // Calculate stats from holdings
    const totalHeld = filteredHoldings.reduce((sum, h) => sum + parseFloat(h.balance), 0)

    // 1. Dev Holds - % held by creator
    const devHolding = filteredHoldings.find(h =>
      h.holder_address.toLowerCase() === creatorAddress?.toLowerCase()
    )
    const devHoldsPercentage = devHolding
      ? Math.round((parseFloat(devHolding.balance) / totalSupply) * 100)
      : 0

    // 2. Top 10 Holds - % held by top 10 wallets
    const top10Holdings = filteredHoldings.slice(0, 10)
    const top10Total = top10Holdings.reduce((sum, h) => sum + parseFloat(h.balance), 0)
    const top10Percentage = Math.round((top10Total / totalSupply) * 100)

    // 3. Phishing Holds - % held by known phishing wallets
    const phishingSet = new Set(flags.phishing)
    const phishingHoldings = filteredHoldings.filter(h =>
      phishingSet.has(h.holder_address.toLowerCase())
    )
    const phishingTotal = phishingHoldings.reduce((sum, h) => sum + parseFloat(h.balance), 0)
    const phishingPercentage = Math.round((phishingTotal / totalSupply) * 100)

    // 4. Snipers Hold - % held by known snipers
    const snipersSet = new Set(flags.snipers)
    const snipersHoldings = filteredHoldings.filter(h =>
      snipersSet.has(h.holder_address.toLowerCase())
    )
    const snipersTotal = snipersHoldings.reduce((sum, h) => sum + parseFloat(h.balance), 0)
    const snipersPercentage = Math.round((snipersTotal / totalSupply) * 100)

    // 5. Insiders Hold - % held by known insiders
    const insidersSet = new Set(flags.insiders)
    const insidersHoldings = filteredHoldings.filter(h =>
      insidersSet.has(h.holder_address.toLowerCase())
    )
    const insidersTotal = insidersHoldings.reduce((sum, h) => sum + parseFloat(h.balance), 0)
    const insidersPercentage = Math.round((insidersTotal / totalSupply) * 100)

    const result = {
      devHolds: devHoldsPercentage,
      top10Holds: top10Percentage,
      phishingHolds: phishingPercentage,
      snipersHold: snipersPercentage,
      insidersHold: insidersPercentage,
      holdersCount: filteredHoldings.length,
      netBuy1m: netBuy1mFromDb
    }

    // Cache result
    analysisCache.set(tokenAddress, { data: result, timestamp: Date.now() })

    return result
  } catch (error) {
    console.error(`Failed to analyze token ${tokenAddress}:`, error)
    return {
      devHolds: 0,
      top10Holds: 0,
      phishingHolds: 0,
      snipersHold: 0,
      insidersHold: 0,
      holdersCount: 0,
      netBuy1m: 0
    }
  }
}

/**
 * Analyze multiple tokens in batch
 */
export async function analyzeBatch(tokenAddresses) {
  const results = {}

  // Process in parallel
  await Promise.all(
    tokenAddresses.map(async (address) => {
      const normalized = address.toLowerCase()
      results[normalized] = await analyzeToken(address)
    })
  )

  return results
}

/**
 * Clear cache for a specific token (call after trades)
 */
export function clearCache(tokenAddress) {
  analysisCache.delete(tokenAddress)
}

/**
 * Clear all cache
 */
export function clearAllCache() {
  analysisCache.clear()
}

export default {
  analyzeToken,
  analyzeBatch,
  clearCache,
  clearAllCache
}
