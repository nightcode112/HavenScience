/**
 * Haven API - Connects Haven UI components to Supabase backend
 *
 * This file provides the API layer that Haven components expect,
 * routing requests to Supabase instead of the original backend.
 */

import {
  supabase,
  BondingTokensApi,
  TradesApi,
  HoldingsApi,
  WalletApi,
  FavoritesApi,
  PriceHistoryApi
} from '../lib/supabase.js'

/**
 * Transform Supabase robot data to match Haven component expectations
 * Using robots table fields: contract, ticker, wallet, image, etc.
 */
function transformTokenData(token) {
  if (!token) return null

  // Calculate bonding progress from reserves
  let bondingProgress = 0
  if (!token.is_graduated && token.target_eth && token.real_eth_reserve) {
    const targetEth = Number(token.target_eth)
    const realEth = Number(token.real_eth_reserve)
    if (targetEth > 0) {
      bondingProgress = Math.min(100, (realEth / targetEth) * 100)
    }
  }

  // Calculate initial market cap and price from virtual reserves if they are 0 or null
  // For new tokens with no trades yet, calculate from bonding curve formula
  let marketCap = token.market_cap
  let price = token.price

  if ((!marketCap || marketCap === 0 || !price || price === 0) &&
      token.virtual_eth_reserve && token.virtual_token_reserve) {

    // Bonding curve formula: price = (virtualX + realX) / (virtualTokens - circulatingSupply)
    const virtualX = Number(token.virtual_eth_reserve) / 1e18 // HAVEN tokens
    const realX = (Number(token.real_eth_reserve) || 0) / 1e18 // HAVEN tokens
    const virtualTokens = Number(token.virtual_token_reserve) / 1e18
    const totalSupply = Number(token.total_supply) || 1000000 // 1M default
    const circulatingSupply = totalSupply - (Number(token.real_token_reserve) || totalSupply - (Number(token.real_eth_reserve) > 0 ? 1 : 0))

    // Calculate initial price in HAVEN tokens
    const remainingTokens = virtualTokens - circulatingSupply
    if (remainingTokens > 0) {
      const priceInHaven = (virtualX + realX) / remainingTokens

      // For display purposes, we show price in HAVEN tokens (not USD)
      // The indexer will update with USD prices when it runs
      if (!price || price === 0) {
        price = priceInHaven
      }

      // Market cap in HAVEN tokens
      if (!marketCap || marketCap === 0) {
        marketCap = priceInHaven * totalSupply
      }
    }
  }

  const transformed = {
    id: token.id,
    address: token.bonding_contract || token.contract,
    contractAddress: token.bonding_contract || token.contract,
    name: token.name,
    symbol: token.ticker || token.symbol,
    ticker: token.ticker,
    description: token.description || '',
    image: token.image,
    imageUrl: token.image,
    twitter: token.twitter,
    telegram: token.telegram,
    website: token.website,
    creator: token.wallet,
    creatorAddress: token.wallet,
    wallet: token.wallet,  // Keep wallet field for normalizeRobot
    deviceNode: token.device_node,
    totalSupply: token.total_supply,
    virtualEthReserve: token.virtual_eth_reserve,
    virtualTokenReserve: token.virtual_token_reserve,
    realEthReserve: token.real_eth_reserve,
    realTokenReserve: token.real_token_reserve,
    kValue: token.k_value,
    marketCap: marketCap,
    price: token.price,
    volume24h: token.volume_24h,
    liquidity: token.liquidity,
    txns24h: token.txns_24h,
    priceChange5m: token.price_change_5m,
    priceChange1h: token.price_change_1h,
    priceChange6h: token.price_change_6h,
    priceChange24h: token.price_change_24h,
    buys24h: token.buys_24h,
    buys24hVolume: token.buys_24h_volume,
    sells24h: token.sells_24h,
    sellsVolume: token.sells_24h_volume,
    netBuy24h: token.net_buy_24h,
    holdersCount: token.holders_count,
    targetEth: token.target_eth,
    bondingProgress: bondingProgress,
    uniswapVersion: token.uniswap_version,
    isGraduated: token.is_graduated,
    graduatedAt: token.graduated_at,
    uniswapPoolAddress: token.uniswap_pool_address,
    deployedBlockNumber: token.deployed_block_number,
    chainId: token.chain_id,
    createdAt: token.created_at,
    updatedAt: token.updated_at,
    timestamp: token.timestamp || (token.created_at ? new Date(token.created_at).getTime() / 1000 : Date.now() / 1000),
    // Robot-specific fields
    simType: token.sim_type,
    simulations: token.simulations,
    commandList: token.command_list,
    telemetry: token.telemetry,
    gamerules: token.gamerules,
    isAdvanced: token.is_advanced,
    extras: token.extras,
    // Real-time computed values (if available from enriched data)
    _realHoldersCount: token._realHoldersCount,
    _realTxnsCount: token._realTxnsCount
  }

  return transformed
}

/**
 * Transform trade data to match Haven component expectations
 * Using trades table fields: contract, user, type, ethIn, tokensOut, etc.
 */
function transformTradeData(trade) {
  if (!trade) return null

  return {
    id: trade.id,
    tokenAddress: trade.contract,
    traderAddress: trade.user,
    trader: trade.user,
    type: trade.type,
    tradeType: trade.type,
    ethAmount: trade.ethIn || trade.ethOut,
    ethIn: trade.ethIn,
    ethOut: trade.ethOut,
    tokenAmount: trade.tokensOut || trade.tokensIn,
    tokensOut: trade.tokensOut,
    tokensIn: trade.tokensIn,
    usdSpent: trade.usdSpent,
    usdReceived: trade.usdReceived,
    pricePerToken: trade.price_per_token,
    newEthReserve: trade.new_eth_reserve,
    newTokenReserve: trade.new_token_reserve,
    newPrice: trade.new_price,
    txHash: trade.tx_hash,
    gasUsed: trade.gas_used,
    blockNumber: trade.block_number,
    timestamp: trade.timestamp,
    createdAt: trade.created_at
  }
}

/**
 * Calculate token metadata (dev stats, holder analysis, etc.)
 */
async function calculateTokenMetadata(tokens) {
  const metadata = {}

  // Group tokens by creator to calculate dev stats
  const creatorStats = {}

  for (const token of tokens) {
    const creator = (token.wallet || token.creator_address || '').toLowerCase()
    const tokenAddress = (token.bonding_contract || token.contract || token.contract_address || '').toLowerCase()

    if (!creator || !tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') continue

    // Initialize creator stats
    if (!creatorStats[creator]) {
      creatorStats[creator] = {
        created: 0,
        graduated: 0
      }
    }

    // Count created and graduated
    creatorStats[creator].created++
    if (token.is_graduated) {
      creatorStats[creator].graduated++
    }
  }

  // Import wallet analysis
  const { analyzeToken } = await import('./wallet-analysis.js')

  // Now assign metadata to each token and enrich with wallet analysis
  const promises = tokens.map(async (token) => {
    const creator = (token.wallet || token.creator_address || '').toLowerCase()
    const tokenAddress = (token.bonding_contract || token.contract || token.contract_address || '').toLowerCase()

    if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') return

    const stats = creatorStats[creator] || { created: 0, graduated: 0 }

    // Get wallet analysis (includes devHolds, top10Holds, phishingHolds, etc.)
    let analysis = {
      devHolds: 0,
      top10Holds: 0,
      phishingHolds: 0,
      snipersHold: 0,
      insidersHold: 0,
      netBuy1m: 0
    }

    try {
      analysis = await analyzeToken(tokenAddress, token)
    } catch (error) {
      console.warn(`Failed to analyze ${tokenAddress}:`, error.message)
    }

    metadata[tokenAddress] = {
      devCreated: stats.created,
      devGraduated: stats.graduated,
      devHolds: analysis.devHolds || 0,
      top10Holds: analysis.top10Holds || 0,
      phishingHolds: analysis.phishingHolds || 0,
      snipersHold: analysis.snipersHold || 0,
      insidersHold: analysis.insidersHold || 0,
      netBuy1m: analysis.netBuy1m || 0
    }
  })

  await Promise.all(promises)

  return metadata
}

/**
 * Get holder count from transfers table
 * Analyzes all transfer events to calculate current holders
 */
async function getHolderCountFromTransfers(tokenAddress, pairAddress) {
  try {
    // Get all transfers for this token from the transfers table
    const { data: transfers, error } = await supabase
      .from('transfers')
      .select('from_address, to_address, amount')
      .eq('token_address', tokenAddress.toLowerCase())
      .order('block_number', { ascending: true })

    if (error) {
      console.warn('Error fetching transfers:', error)
      return null
    }

    if (!transfers || transfers.length === 0) {
      return null // No transfer data available
    }

    // Calculate net balance for each address
    const balances = new Map()

    for (const transfer of transfers) {
      const from = transfer.from_address.toLowerCase()
      const to = transfer.to_address.toLowerCase()
      const amount = BigInt(transfer.amount)

      // Subtract from sender
      if (from !== '0x0000000000000000000000000000000000000000') {
        const currentFrom = balances.get(from) || 0n
        balances.set(from, currentFrom - amount)
      }

      // Add to receiver
      if (to !== '0x0000000000000000000000000000000000000000') {
        const currentTo = balances.get(to) || 0n
        balances.set(to, currentTo + amount)
      }
    }

    // Count addresses with balance > 0, excluding token contract and pair
    let holderCount = 0
    for (const [address, balance] of balances.entries()) {
      if (balance > 0n &&
          address !== tokenAddress.toLowerCase() &&
          (!pairAddress || address !== pairAddress.toLowerCase())) {
        holderCount++
      }
    }

    return holderCount
  } catch (error) {
    console.warn('Failed to calculate holders from transfers:', error)
    return null
  }
}

/**
 * Get transaction count from transfers table (last 24 hours)
 */
async function getTxnCountFromTransfers(tokenAddress) {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { count, error } = await supabase
      .from('transfers')
      .select('*', { count: 'exact', head: true })
      .eq('token_address', tokenAddress.toLowerCase())
      .gte('timestamp', Math.floor(new Date(oneDayAgo).getTime() / 1000))

    if (error) {
      console.warn('Error fetching transfer count:', error)
      return null
    }

    return count || 0
  } catch (error) {
    console.warn('Failed to get txn count from transfers:', error)
    return null
  }
}

/**
 * Enrich token data with real-time holder and transaction counts
 */
async function enrichTokenWithRealData(token) {
  if (!token) return token

  const tokenAddress = token.bonding_contract || token.contract
  if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
    return token
  }

  try {
    const pairAddress = token.uniswap_pool_address?.toLowerCase()

    // Try to get holder count from transfers table first (most accurate if populated)
    let holdersCount = await getHolderCountFromTransfers(tokenAddress, pairAddress)

    // If transfers table has no data, fall back to bonding_holdings
    if (holdersCount === null) {
      let holdersQuery = supabase
        .from('bonding_holdings')
        .select('holder_address', { count: 'exact', head: true })
        .eq('token_address', tokenAddress)
        .gt('balance', 0)
        .neq('holder_address', tokenAddress.toLowerCase())

      if (pairAddress) {
        holdersQuery = holdersQuery.neq('holder_address', pairAddress)
      }

      const { count } = await holdersQuery
      holdersCount = count || 0
    }

    // Get transaction count from transfers table (last 24 hours)
    let txnsCount = await getTxnCountFromTransfers(tokenAddress)

    // If transfers table has no data, fall back to trades table
    if (txnsCount === null) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('trades')
        .select('*', { count: 'exact', head: true })
        .eq('contract', tokenAddress)
        .gte('created_at', oneDayAgo)

      txnsCount = count || 0
    }

    // Enrich the token with real data
    return {
      ...token,
      _realHoldersCount: holdersCount || 0,
      _realTxnsCount: txnsCount || 0
    }
  } catch (error) {
    console.warn(`Failed to enrich token ${tokenAddress}:`, error)
    return token
  }
}

/**
 * Haven Factory API - for HavenFactory component
 */
export const FactoryApi = {
  // Get all tokens (what Factory page displays)
  async getTokens({ filter = 'new', limit = 100, enrichData = false } = {}) {
    try {
      let tokens

      switch (filter) {
        case 'trending':
          tokens = await BondingTokensApi.getTrending(limit)
          break
        case 'new':
          tokens = await BondingTokensApi.getNew(limit)
          break
        case 'almost':
          tokens = await BondingTokensApi.getAlmostGraduated(limit)
          break
        case 'graduated':
          tokens = await BondingTokensApi.getGraduated(limit)
          break
        default:
          tokens = await BondingTokensApi.getTokens({ limit })
      }

      // Optionally enrich tokens with real-time data
      // Disabled by default as it can be slow
      if (enrichData) {
        const enrichedTokens = await Promise.all(
          tokens.map(async token => {
            const enriched = await enrichTokenWithRealData(token)
            return transformTokenData(enriched)
          })
        )
        return enrichedTokens
      }

      const transformed = tokens.map(transformTokenData)

      // Debug logging for Optimus
      const optimus = transformed.find(t => t.symbol === 'OPTIMUS')
      if (optimus) {
        console.log('🔍 Optimus data from API:', {
          address: optimus.address,
          holdersCount: optimus.holdersCount,
          txns24h: optimus.txns24h
        })
      }

      return transformed
    } catch (error) {
      console.error('Failed to fetch tokens:', error)
      return []
    }
  },

  // Search tokens
  async searchTokens(query) {
    try {
      const tokens = await BondingTokensApi.searchTokens(query)
      return tokens.map(transformTokenData)
    } catch (error) {
      console.error('Failed to search tokens:', error)
      return []
    }
  },

  // Get single token details
  async getToken(contractAddress) {
    try {
      const token = await BondingTokensApi.getToken(contractAddress)
      return transformTokenData(token)
    } catch (error) {
      console.error('Failed to fetch token:', error)
      return null
    }
  },

  // Get tokens with metadata (includes dev stats, etc.)
  async getTokensWithMetadata({ filter = 'new', limit = 100 } = {}) {
    try {
      // First get all tokens to calculate stats
      const allTokens = await BondingTokensApi.getTokens({ limit: 1000 })

      // Calculate metadata from all tokens
      const metadata = await calculateTokenMetadata(allTokens)

      // Now get the filtered/limited tokens
      let tokens
      switch (filter) {
        case 'trending':
          tokens = await BondingTokensApi.getTrending(limit)
          break
        case 'new':
          tokens = await BondingTokensApi.getNew(limit)
          break
        case 'almost':
          tokens = await BondingTokensApi.getAlmostGraduated(limit)
          break
        case 'graduated':
          tokens = await BondingTokensApi.getGraduated(limit)
          break
        default:
          tokens = await BondingTokensApi.getTokens({ limit })
      }

      const transformedTokens = tokens.map(transformTokenData)

      return {
        tokens: transformedTokens,
        metadata
      }
    } catch (error) {
      console.error('Failed to fetch tokens with metadata:', error)
      return {
        tokens: [],
        metadata: {}
      }
    }
  }
}

/**
 * Robot API - for HavenMyRobots and HavenCreateRobot components
 */
export const RobotApi = {
  // Get user's robots (their holdings)
  async getUserRobots(userAddress) {
    try {
      const holdings = await HoldingsApi.getUserHoldings(userAddress)

      // Transform holdings to robot format with token data
      return holdings.map(holding => {
        const token = holding.token
        return {
          ...transformTokenData(token),
          balance: holding.balance,
          totalInvestedEth: holding.total_invested_eth,
          realizedPnl: holding.realized_pnl,
          unrealizedPnl: holding.unrealized_pnl,
          firstBuyTimestamp: holding.first_buy_timestamp,
          lastTradeTimestamp: holding.last_trade_timestamp
        }
      })
    } catch (error) {
      console.error('Failed to fetch user robots:', error)
      return []
    }
  },

  // Create new robot (token)
  async createRobot(robotData) {
    try {
      // Determine if this is a BNB-based token or HAVEN-based token
      // BNB-based: virtualEthReserve = 7e18, HAVEN-based: virtualEthReserve = 6000e18
      const isBnbPair = robotData.pairType === 'bnb' || robotData.isBnbPair
      const defaultVirtualEthReserve = isBnbPair ? '7000000000000000000' : '6000000000000000000000' // 7 BNB or 6000 HAVEN
      const defaultVirtualTokenReserve = isBnbPair ? '900000000000000000000000' : '1073000000000000000000000000' // 900k or 1.073B tokens

      const tokenData = {
        device_node: robotData.deviceNode || `robot_${Date.now()}`,
        contract: robotData.contractAddress || robotData.contract,
        bonding_contract: robotData.bondingContract,
        name: robotData.name,
        ticker: robotData.symbol || robotData.ticker,
        description: robotData.description,
        image: robotData.image || robotData.imageUrl,
        twitter: robotData.twitter,
        telegram: robotData.telegram,
        website: robotData.website,
        wallet: robotData.creatorAddress || robotData.creator || robotData.wallet,
        total_supply: robotData.totalSupply || '1000000000000000000000000',
        virtual_eth_reserve: robotData.virtualEthReserve || defaultVirtualEthReserve,
        virtual_token_reserve: robotData.virtualTokenReserve || defaultVirtualTokenReserve,
        real_eth_reserve: '0',
        real_token_reserve: robotData.totalSupply || '1000000000000000000000000',
        target_eth: robotData.targetEth || (isBnbPair ? '17000000000000000000' : '4000000000000000000'), // 17 BNB or 4000 HAVEN
        chain_id: robotData.chainId || 56,
        sim_type: robotData.simType || '',
        simulations: robotData.simulations || [],
        command_list: robotData.commandList,
        telemetry: robotData.telemetry,
        gamerules: robotData.gamerules,
        is_advanced: robotData.isAdvanced || 0,
        extras: robotData.extras || {},
        timestamp: new Date().toISOString()
      }

      const token = await BondingTokensApi.createToken(tokenData)
      return transformTokenData(token)
    } catch (error) {
      console.error('Failed to create robot:', error)
      throw error
    }
  },

  // Get robot details
  async getRobot(contractAddress) {
    try {
      const token = await BondingTokensApi.getToken(contractAddress)
      return transformTokenData(token)
    } catch (error) {
      console.error('Failed to fetch robot:', error)
      return null
    }
  }
}

/**
 * Trade API - for trade history and execution
 */
export const TradeApi = {
  // Get trades for a token
  async getTokenTrades(tokenAddress, limit = 100) {
    try {
      const trades = await TradesApi.getTokenTrades(tokenAddress, limit)
      return trades.map(transformTradeData)
    } catch (error) {
      console.error('Failed to fetch token trades:', error)
      return []
    }
  },

  // Get trades for a user
  async getUserTrades(userAddress, limit = 100) {
    try {
      const trades = await TradesApi.getTraderTrades(userAddress, limit)
      return trades.map(transformTradeData)
    } catch (error) {
      console.error('Failed to fetch user trades:', error)
      return []
    }
  },

  // Record a trade (after blockchain confirmation)
  async recordTrade(tradeData) {
    try {
      // Use the stored procedure that updates everything atomically
      const result = await TradesApi.executeTrade({
        tokenAddress: tradeData.tokenAddress,
        traderAddress: tradeData.traderAddress,
        tradeType: tradeData.type || tradeData.tradeType,
        ethAmount: tradeData.ethAmount,
        tokenAmount: tradeData.tokenAmount,
        pricePerToken: tradeData.pricePerToken,
        newEthReserve: tradeData.newEthReserve,
        newTokenReserve: tradeData.newTokenReserve,
        newPrice: tradeData.newPrice,
        txHash: tradeData.txHash,
        gasUsed: tradeData.gasUsed,
        blockNumber: tradeData.blockNumber
      })

      return result
    } catch (error) {
      console.error('Failed to record trade:', error)
      throw error
    }
  }
}

/**
 * Wallet API - for wallet analysis and risk detection
 */
/**
 * Wallet Analysis API - Calculate holder statistics and check wallet flags
 */
export const WalletAnalysisApi = {
  // Analyze single token holder statistics
  async analyzeToken(tokenAddress) {
    try {
      const { analyzeToken } = await import('./wallet-analysis.js')
      return await analyzeToken(tokenAddress)
    } catch (error) {
      console.error('Failed to analyze token:', error)
      return {
        devHolds: 0,
        top10Holds: 0,
        phishingHolds: 0,
        snipersHold: 0,
        insidersHold: 0,
        holdersCount: 0
      }
    }
  },

  // Analyze multiple tokens in batch
  async analyzeBatch(tokenAddresses) {
    try {
      const { analyzeBatch } = await import('./wallet-analysis.js')
      return await analyzeBatch(tokenAddresses)
    } catch (error) {
      console.error('Failed to analyze batch:', error)
      return {}
    }
  },

  // Clear cache after trade
  async clearCache(tokenAddress) {
    try {
      const { clearCache } = await import('./wallet-analysis.js')
      clearCache(tokenAddress)
    } catch (error) {
      console.error('Failed to clear cache:', error)
    }
  },

  // Get wallet flags (phishing, sniper, insider detection)
  async analyzeWallet(walletAddress) {
    try {
      const flags = await WalletApi.getWalletFlags(walletAddress)

      if (!flags) {
        return {
          address: walletAddress,
          isPhishing: false,
          isSniper: false,
          isInsider: false,
          sniperScore: 0,
          insiderConnections: 0,
          phishingReports: 0
        }
      }

      return {
        address: flags.wallet_address,
        isPhishing: flags.is_phishing,
        isSniper: flags.is_sniper,
        isInsider: flags.is_insider,
        sniperScore: flags.sniper_score,
        insiderConnections: flags.insider_connections,
        phishingReports: flags.phishing_reports,
        firstDetectedAt: flags.first_detected_at,
        lastUpdatedAt: flags.last_updated_at,
        notes: flags.notes
      }
    } catch (error) {
      console.error('Failed to analyze wallet:', error)
      return null
    }
  }
}

/**
 * User Favorites API
 */
export const UserFavoritesApi = {
  // Get user's favorite tokens
  async getFavorites(userAddress) {
    try {
      const favorites = await FavoritesApi.getUserFavorites(userAddress)
      return favorites.map(fav => ({
        ...transformTokenData(fav.token),
        addedAt: fav.added_at
      }))
    } catch (error) {
      console.error('Failed to fetch favorites:', error)
      return []
    }
  },

  // Add to favorites
  async addFavorite(userAddress, tokenAddress) {
    try {
      await FavoritesApi.addFavorite(userAddress, tokenAddress)
      return true
    } catch (error) {
      console.error('Failed to add favorite:', error)
      return false
    }
  },

  // Remove from favorites
  async removeFavorite(userAddress, tokenAddress) {
    try {
      await FavoritesApi.removeFavorite(userAddress, tokenAddress)
      return true
    } catch (error) {
      console.error('Failed to remove favorite:', error)
      return false
    }
  },

  // Check if favorited
  async isFavorited(userAddress, tokenAddress) {
    try {
      return await FavoritesApi.isFavorited(userAddress, tokenAddress)
    } catch (error) {
      console.error('Failed to check favorite status:', error)
      return false
    }
  }
}

/**
 * Chart Data API - for price history charts
 */
export const ChartApi = {
  // Get chart data for a token
  async getChartData(tokenAddress, hoursBack = 24) {
    try {
      const history = await PriceHistoryApi.getTokenPriceHistory(tokenAddress, hoursBack)

      return history.map(point => ({
        timestamp: new Date(point.timestamp).getTime() / 1000,
        price: point.price,
        marketCap: point.market_cap,
        volume: point.volume
      }))
    } catch (error) {
      console.error('Failed to fetch chart data:', error)
      return []
    }
  },

  // Record price point (for building historical data)
  async recordPricePoint(tokenAddress, price, marketCap, volume) {
    try {
      await PriceHistoryApi.recordPrice(tokenAddress, price, marketCap, volume)
      return true
    } catch (error) {
      console.error('Failed to record price point:', error)
      return false
    }
  }
}

/**
 * Real-time subscriptions
 */
export const RealtimeApi = {
  // Subscribe to token updates
  subscribeToToken(tokenAddress, callback) {
    const channel = supabase
      .channel(`token:${tokenAddress}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'robots',
          filter: `contract=eq.${tokenAddress}`
        },
        (payload) => {
          callback(transformTokenData(payload.new))
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  },

  // Subscribe to new trades for a token
  subscribeToTrades(tokenAddress, callback) {
    const channel = supabase
      .channel(`trades:${tokenAddress}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trades',
          filter: `contract=eq.${tokenAddress}`
        },
        (payload) => {
          callback(transformTradeData(payload.new))
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  },

  // Subscribe to all new tokens
  subscribeToNewTokens(callback) {
    const channel = supabase
      .channel('all-tokens')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'robots'
        },
        (payload) => {
          callback(transformTokenData(payload.new))
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }
}

// Export all APIs as a single object for convenience
export default {
  Factory: FactoryApi,
  Robot: RobotApi,
  Trade: TradeApi,
  Wallet: WalletAnalysisApi,
  Favorites: UserFavoritesApi,
  Chart: ChartApi,
  Realtime: RealtimeApi
}
