/* eslint-env node */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials:', { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey })
}

// Fetch DexScreener data
async function fetchDexScreenerData(tokenAddress) {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
    )

    if (!response.ok) {
      console.error('DexScreener API error:', response.status)
      return null
    }

    const data = await response.json()
    const pairs = data?.pairs

    if (!Array.isArray(pairs) || pairs.length === 0) return null

    const pair = pairs[0] // Get first/main pair

    return {
      dexPaid: pair?.boosts?.active > 0 || false
    }
  } catch (error) {
    console.error('Error fetching DexScreener data:', error)
    return null
  }
}

// Fetch GoPlus security data
async function fetchGoPlusSecurityData(tokenAddress, chainId = '56') {
  try {
    const response = await fetch(
      `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${tokenAddress}`
    )

    if (!response.ok) {
      console.error('GoPlus API error:', response.status)
      return null
    }

    const data = await response.json()
    const tokenData = data?.result?.[tokenAddress.toLowerCase()]

    if (!tokenData) return null

    return {
      contractVerified: tokenData.is_open_source === '1',
      honeypot: tokenData.is_honeypot === '1',
      renounced: tokenData.is_contract_renounced === '1' || tokenData.owner_address === '0x0000000000000000000000000000000000000000',
      buyTax: parseFloat(tokenData.buy_tax || 0) * 100,
      sellTax: parseFloat(tokenData.sell_tax || 0) * 100,
      canSellAll: tokenData.cannot_sell_all !== '1',
      honeypotRisk: parseInt(tokenData.honeypot_with_same_creator || 0),

      // Additional security metrics
      transferPausable: tokenData.transfer_pausable === '1',
      canTakeBackOwnership: tokenData.can_take_back_ownership === '1',
      hiddenOwner: tokenData.hidden_owner === '1',
      selfDestruct: tokenData.selfdestruct === '1',
      externalCall: tokenData.external_call === '1',
      mintFunction: tokenData.is_mintable === '1',

      // DEX info
      dexPaid: tokenData.dex && tokenData.dex.length > 0,
      dexList: tokenData.dex || [],

      // Holder info from GoPlus
      holderCount: parseInt(tokenData.holder_count || 0),
      lpHolderCount: parseInt(tokenData.lp_holder_count || 0),
      totalSupply: tokenData.total_supply,

      // Creator info
      creatorAddress: tokenData.creator_address,
      creatorBalance: tokenData.creator_balance,
      creatorPercent: parseFloat(tokenData.creator_percent || 0) * 100,

      // Owner info
      ownerAddress: tokenData.owner_address,
      ownerBalance: tokenData.owner_balance,
      ownerPercent: parseFloat(tokenData.owner_percent || 0) * 100,
      ownerChangeBalance: tokenData.owner_change_balance === '1',

      // LP info
      lpTotalSupply: tokenData.lp_total_supply,
      isProxy: tokenData.is_proxy === '1',
      isBlacklisted: tokenData.is_blacklisted === '1',
      isWhitelisted: tokenData.is_whitelisted === '1',
      antiWhaleModifiable: tokenData.anti_whale_modifiable === '1',

      // Trading info
      tradingCooldown: tokenData.trading_cooldown === '1',
      personalSlippageModifiable: tokenData.personal_slippage_modifiable === '1',

      // Phishing detection
      trust_list: tokenData.trust_list,
      other_potential_risks: tokenData.other_potential_risks,
      note: tokenData.note
    }
  } catch (error) {
    console.error('Error fetching GoPlus data:', error)
    return null
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const { address, wallet } = req.query

    if (!address) {
      return res.status(400).json({ error: 'Token address required' })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get token data from robots table
    const { data: robotData, error: robotError } = await supabase
      .from('robots')
      .select('*')
      .ilike('bonding_contract', address)
      .single()

    if (robotError) {
      console.error('Robot fetch error:', robotError)
      return res.status(404).json({ error: 'Token not found' })
    }

    // Get transfer events to calculate holders and top 10
    const { data: transfers, error: transfersError } = await supabase
      .from('transfers')
      .select('*')
      .ilike('token_address', address)
      .order('block_number', { ascending: false })

    // Calculate holder balances
    const holderBalances = {}
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
    const pairAddress = robotData.uniswap_pool_address?.toLowerCase()

    if (transfers && !transfersError) {
      transfers.reverse().forEach(transfer => {
        const from = transfer.from_address?.toLowerCase()
        const to = transfer.to_address?.toLowerCase()
        // Convert decimal amount to BigInt (multiply by 1e18 to convert to wei)
        const amountFloat = parseFloat(transfer.amount || 0)
        const amount = BigInt(Math.floor(amountFloat * 1e18))

        // Subtract from sender (exclude mints from zero address)
        if (from && from !== ZERO_ADDRESS) {
          holderBalances[from] = (holderBalances[from] || 0n) - amount
        }

        // Add to receiver (exclude burns to zero address)
        if (to && to !== ZERO_ADDRESS) {
          holderBalances[to] = (holderBalances[to] || 0n) + amount
        }
      })
    }

    // Filter out zero balances and LP pair
    const activeHolders = Object.entries(holderBalances)
      .filter(([addr, balance]) => {
        return balance > 0n && addr !== pairAddress
      })
      .map(([address, balance]) => ({
        address,
        balance: balance.toString()
      }))
      .sort((a, b) => {
        const balA = BigInt(a.balance)
        const balB = BigInt(b.balance)
        return balB > balA ? 1 : balB < balA ? -1 : 0
      })

    // Calculate top 10 percentage
    // Convert total_supply to BigInt (multiply by 1e18 if it's a decimal)
    const totalSupplyFloat = parseFloat(robotData.total_supply || 0)
    const totalSupply = BigInt(Math.floor(totalSupplyFloat * 1e18))
    const top10Balances = activeHolders.slice(0, 10).reduce((sum, holder) => {
      return sum + BigInt(holder.balance)
    }, 0n)
    const top10Percent = totalSupply > 0n ?
      Number((top10Balances * 10000n) / totalSupply) / 100 : 0

    // Get DEV holdings (creator - use wallet field)
    const creatorAddress = robotData.wallet?.toLowerCase()
    const devBalance = creatorAddress && holderBalances[creatorAddress]
      ? holderBalances[creatorAddress]
      : 0n
    const devPercent = totalSupply > 0n ?
      Number((devBalance * 10000n) / totalSupply) / 100 : 0

    // Calculate snipers (top 20 early buyers)
    const snipersHold = Math.min(activeHolders.length, 20)

    // Calculate insiders (holders with >1% of supply)
    const insidersHold = activeHolders.filter(holder => {
      const balance = BigInt(holder.balance)
      const percent = totalSupply > 0n ? Number((balance * 10000n) / totalSupply) / 100 : 0
      return percent > 1
    }).length

    // Get trade history from transfers table (swaps)
    const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60)
    const { data: recentTrades, error: tradesError } = await supabase
      .from('transfers')
      .select('*')
      .ilike('token_address', address)
      .gte('timestamp', oneDayAgo)

    // Calculate trading stats from transfers
    let buys = 0
    let sells = 0
    let buysVolume = 0
    let sellsVolume = 0
    let userBought = 0
    let userSold = 0
    let userTokenBalance = 0

    if (recentTrades && !tradesError) {
      recentTrades.forEach(trade => {
        const from = trade.from_address?.toLowerCase()
        const to = trade.to_address?.toLowerCase()
        const amount = Number(trade.amount || 0)
        const value = Number(trade.eth_value || 0)

        // Trades with the pair address are buys/sells
        if (from === pairAddress || to === pairAddress) {
          if (to === pairAddress) {
            // Sell (user sent tokens to pair)
            sells++
            sellsVolume += value
            if (wallet && from === wallet.toLowerCase()) {
              userSold += value
            }
          } else {
            // Buy (user received tokens from pair)
            buys++
            buysVolume += value
            if (wallet && to === wallet.toLowerCase()) {
              userBought += value
            }
          }
        }

        // Track user token balance
        if (wallet) {
          const walletLower = wallet.toLowerCase()
          if (from === walletLower) {
            userTokenBalance -= amount
          }
          if (to === walletLower) {
            userTokenBalance += amount
          }
        }
      })
    }

    const totalVolume = buysVolume + sellsVolume
    const netBuyVolume = buysVolume - sellsVolume
    const userPnl = userBought - userSold
    const userPnlPercent = userSold > 0 ? (userPnl / userSold) * 100 : 0

    // Fetch GoPlus security data
    const goPlusData = await fetchGoPlusSecurityData(address, '56')

    // Fetch DexScreener data for dexPaid
    const dexScreenerData = await fetchDexScreenerData(address)

    // Calculate average and highest tax
    const avgTax = goPlusData ? (goPlusData.buyTax + goPlusData.sellTax) / 2 : 0
    const highestTax = goPlusData ? Math.max(goPlusData.buyTax, goPlusData.sellTax) : 0

    // Update dex_paid in database if we have DexScreener data
    if (dexScreenerData && dexScreenerData.dexPaid !== undefined) {
      await supabase
        .from('robots')
        .update({ dex_paid: dexScreenerData.dexPaid })
        .ilike('bonding_contract', address)
    }

    // Get ETH price for USD conversion (approximate)
    const ethPriceUSD = 3000 // You can fetch this from an oracle or API
    const priceETH = parseFloat(robotData.price || 0)
    const priceUSD = priceETH * ethPriceUSD

    // Calculate liquidity in USD (approximate)
    const liquidityUSD = priceETH * ethPriceUSD
    const marketCapUSD = parseFloat(robotData.market_cap || 0)

    // Return comprehensive stats
    res.status(200).json({
      success: true,
      data: {
        // Token info
        address: robotData.bonding_contract,
        symbol: robotData.ticker || robotData.name,
        name: robotData.name,
        totalSupply: robotData.total_supply,
        progress: (parseFloat(robotData.market_cap || 0) / parseFloat(robotData.target_eth || 1)) * 100,
        marketCap: robotData.market_cap,
        marketCapUSD: marketCapUSD,
        liquidity: robotData.market_cap, // For now, use market_cap as liquidity
        liquidityUSD: liquidityUSD,
        totalLiquidity: robotData.market_cap,
        priceETH: priceETH,
        priceUSD: priceUSD,
        price: priceETH,
        timestamp: robotData.timestamp,
        createdAt: robotData.timestamp,
        image: robotData.image,

        // Pair info
        pairAddress: robotData.uniswap_pool_address,

        // Creator info
        tokenCreator: robotData.wallet,
        creatorAddress: robotData.wallet,

        // Holder stats
        holdersCount: activeHolders.length,
        holders: activeHolders.length,
        top10Percent,
        topHolders: activeHolders.slice(0, 10),

        // Trading stats (24h)
        tokenStats: {
          buys,
          sells,
          buysVolume,
          sellsVolume,
          netBuyVolume,
          totalVolume
        },

        // User stats (if wallet provided)
        userStats: wallet ? {
          bought: userBought,
          sold: userSold,
          pnl: userPnl,
          pnlPercent: userPnlPercent,
          tokenBalance: Math.max(0, userTokenBalance)
        } : null,

        // Comprehensive security data
        securityData: {
          // Basic security
          top10Percent,
          snipersHold,
          insidersHold,
          devPercent,

          // GoPlus data
          contractVerified: goPlusData?.contractVerified || false,
          honeypot: goPlusData?.honeypot || false,
          renounced: goPlusData?.renounced || false,
          buyTax: goPlusData?.buyTax || 0,
          sellTax: goPlusData?.sellTax || 0,
          averageTax: avgTax,
          highestTax: highestTax,
          canSellAll: goPlusData?.canSellAll !== false,
          honeypotRisk: goPlusData?.honeypotRisk || 0,

          // Advanced security
          transferPausable: goPlusData?.transferPausable || false,
          canTakeBackOwnership: goPlusData?.canTakeBackOwnership || false,
          hiddenOwner: goPlusData?.hiddenOwner || false,
          selfDestruct: goPlusData?.selfDestruct || false,
          externalCall: goPlusData?.externalCall || false,
          mintFunction: goPlusData?.mintFunction || false,
          isProxy: goPlusData?.isProxy || false,
          isBlacklisted: goPlusData?.isBlacklisted || false,
          isWhitelisted: goPlusData?.isWhitelisted || false,
          tradingCooldown: goPlusData?.tradingCooldown || false,

          // DEX info (from DexScreener)
          dexPaid: dexScreenerData?.dexPaid || false,
          dexList: goPlusData?.dexList || [],

          // LP info
          liquidityLocked: false, // TODO: Implement LP lock detection
          lpTotalSupply: goPlusData?.lpTotalSupply,

          // Creator/Owner info
          creatorAddress: goPlusData?.creatorAddress || robotData.creatorAddress,
          creatorPercent: goPlusData?.creatorPercent || devPercent,
          ownerAddress: goPlusData?.ownerAddress,
          ownerPercent: goPlusData?.ownerPercent || 0,

          // Risks
          phishing: goPlusData?.trust_list === 'blacklist',
          otherRisks: goPlusData?.other_potential_risks,
          securityNote: goPlusData?.note
        }
      }
    })
  } catch (error) {
    console.error('[api/blockchain/token_stats] error:', error)
    res.status(500).json({
      error: 'Failed to fetch token stats',
      details: error.message
    })
  }
}
