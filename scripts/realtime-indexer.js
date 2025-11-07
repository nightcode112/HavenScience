/**
 * Real-time Blockchain Indexer
 *
 * Continuously indexes new blockchain events as they happen:
 * - Listens to new blocks on BSC
 * - Fetches Transfer events for all tokens
 * - Fetches Swap events from PancakeSwap for graduated tokens
 * - Updates database in real-time
 * - On startup, backfills last 100 blocks to catch up
 *
 * Run with: node scripts/realtime-indexer.js
 * Runs forever - use Ctrl+C to stop or run with PM2 for production
 */

import { ethers } from 'ethers'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { getBNBPrice, convertToUSD } from './price-oracle.js'

// Load .env manually
// Use path relative to script location, not process.cwd() (which changes based on where PM2 starts from)
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = path.join(__dirname, '..', '.env')

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const match = trimmed.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      process.env[key] = value
    }
  })
  console.log(`✅ Loaded .env from: ${envPath}`)
} else {
  console.error(`❌ .env file not found at: ${envPath}`)
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// BSC RPC Configuration
// Using Alchemy (optimized usage fits in free tier)
const alchemyRpc = process.env.VITE_BSC_RPC_URL

if (!alchemyRpc) {
  console.error('❌ VITE_BSC_RPC_URL not found in .env')
  process.exit(1)
}

// Use Alchemy for all requests
let wsUrl, httpUrl, providerName

httpUrl = alchemyRpc
wsUrl = alchemyRpc.replace('https://', 'wss://').replace('http://', 'ws://')
providerName = 'Alchemy'

console.log(`🔌 Connecting to: ${providerName}`)
console.log(`   WebSocket: ${wsUrl} (for listening to new blocks)`)
console.log(`   HTTP: ${httpUrl} (for contract calls)`)

// Use WebSocket provider for instant block notifications
const wsProvider = new ethers.WebSocketProvider(wsUrl)

// Use HTTP provider for contract calls (some operations work better over HTTP)
const httpProvider = new ethers.JsonRpcProvider(httpUrl)

// Use httpProvider for contract calls, wsProvider for listening
const provider = httpProvider

// ABIs
const TOKEN_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function totalSupply() view returns (uint256)',
  'function creator() view returns (address)',
  'function getFees() view returns (uint256 factoryFeesETH, uint256 creatorFeesETH, uint256 factoryFeesXToken, uint256 creatorFeesXToken, uint256 factoryFeesTokens, uint256 creatorFeesTokens)'
]

const PANCAKE_PAIR_ABI = [
  'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
]

const BONDING_CURVE_ABI = [
  'function getBondingCurve() view returns (tuple(uint256 currentPriceXToken, uint256 virtualXTokenReserve, uint256 realXTokenReserve, uint256 tokenSupply, uint256 graduationThresholdXToken, uint256 progressToGraduation))',
  'function getMarketCapXToken() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'event Buy(address indexed user, uint256 xTokenIn, uint256 tokensOut, uint256 feeXToken)',
  'event Sell(address indexed user, uint256 tokensIn, uint256 xTokenOut, uint256 feeXToken)'
]

const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const HAVEN_ADDRESS = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690'

/**
 * Check for new creator fee collections (runs every 10 minutes)
 * OPTIMIZED: Use Transfer events to detect fee collections instead of scanning all blocks
 * Limited to 1000 blocks per run to avoid Allnodes rate limiting
 */
async function checkCreatorFeeCollections() {
  const currentBlock = await provider.getBlockNumber()

  // Start from last checked block, or go back 1000 blocks max
  const fromBlock = lastFeeCheckBlock > 0 ? lastFeeCheckBlock + 1 : currentBlock - 1000

  // Process max 1000 blocks per run (Allnodes free tier limit)
  const toBlock = Math.min(fromBlock + 1000, currentBlock)

  // Skip if we're already caught up
  if (fromBlock > currentBlock) {
    console.log(`\n💰 Fee checker: Already caught up (block ${currentBlock})`)
    return
  }

  console.log(`\n💰 Checking creator fee collections from block ${fromBlock} to ${toBlock} (${toBlock - fromBlock} blocks)...`)

  const tokens = await refreshTokens()
  const bnbPrice = await getBNBPrice(provider)
  let totalCollections = 0

  // OPTIMIZATION: Instead of scanning all blocks with getBlock(bn, true),
  // we look for Transfer events FROM the contract TO the creator
  // (which is what happens when collectCreatorFees() is called)

  for (const token of tokens) {
    const tokenAddress = token.bonding_contract || token.contract
    const tokenName = token.ticker || token.name || 'Unknown'

    if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
      continue
    }

    try {
      const contract = new ethers.Contract(tokenAddress, TOKEN_ABI, provider)

      // Get creator address
      let creatorAddress
      try {
        creatorAddress = await contract.creator()
      } catch (e) {
        continue // Skip if no creator() function
      }

      // OPTIMIZED: Query Transfer events FROM contract TO creator (these are fee collections)
      // This uses getLogs which is MUCH faster than getBlock
      const HAVEN_ADDRESS = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690'
      const havenContract = new ethers.Contract(HAVEN_ADDRESS, TOKEN_ABI, provider)

      // Query only the safe range (max 1000 blocks)
      const safeFromBlock = fromBlock

      // Look for HAVEN transfers from bonding contract to creator
      const transferFilter = havenContract.filters.Transfer(tokenAddress, creatorAddress)
      const transferEvents = await havenContract.queryFilter(transferFilter, safeFromBlock, toBlock)

      for (const transfer of transferEvents) {
        const txHash = transfer.transactionHash
        const amountBNB = transfer.args.value.toString()

        // Check if we already have this transaction
        const { data: existing } = await supabase
          .from('creator_fees_history')
          .select('tx_hash')
          .eq('tx_hash', txHash.toLowerCase())
          .single()

        if (existing) {
          continue // Already processed
        }

        const amountBNBFloat = parseFloat(ethers.formatEther(amountBNB))
        const amountUSD = amountBNBFloat * bnbPrice
        const block = await getBlockCached(transfer.blockNumber)
        const timestamp = new Date(block.timestamp * 1000).toISOString()

        console.log(`  📥 ${tokenName}: Found fee collection`)
        console.log(`    Tx: ${txHash}`)
        console.log(`    Amount: ${amountBNBFloat.toFixed(6)} HAVEN ($${amountUSD.toFixed(2)})`)

        // Insert into database
        const { error } = await supabase
          .from('creator_fees_history')
          .upsert({
            token_address: tokenAddress.toLowerCase(),
            creator_address: creatorAddress.toLowerCase(),
            amount_bnb: amountBNB,
            amount_usd: amountUSD.toFixed(2),
            tx_hash: txHash.toLowerCase(),
            block_number: transfer.blockNumber,
            timestamp: timestamp
          }, {
            onConflict: 'tx_hash',
            ignoreDuplicates: true
          })

        if (error && error.code !== '23505') {
          console.error(`    ❌ Error storing: ${error.message}`)
        } else {
          console.log(`    ✓ Stored successfully`)
          totalCollections++
        }
      }
    } catch (error) {
      // Skip tokens that fail
      console.error(`  ⚠️  Error checking ${token.ticker}: ${error.message}`)
    }
  }

  // Update progress tracker to the block we finished processing
  lastFeeCheckBlock = toBlock
  lastFeeCheckTime = Date.now()

  const blocksRemaining = currentBlock - toBlock
  if (blocksRemaining > 0) {
    console.log(`💰 Fee check complete: ${totalCollections} new collection(s) stored`)
    console.log(`   Progress: ${toBlock - fromBlock} blocks processed, ${blocksRemaining} blocks remaining\n`)
  } else {
    console.log(`💰 Fee check complete: ${totalCollections} new collection(s) stored (fully caught up)\n`)
  }
}

// Track last processed block for each token
const lastProcessedBlock = new Map()

// Track last fee collection check
let lastFeeCheckBlock = 0
let lastFeeCheckTime = 0
const FEE_CHECK_INTERVAL = 10 * 60 * 1000 // 10 minutes (processes 1000 blocks each time)

// Cache token info
let tokensCache = []
let lastTokensRefresh = 0
const TOKENS_REFRESH_INTERVAL = 60000 // 1 minute

// Block cache for batch fetching
const blockCache = new Map()
async function getBlockCached(blockNumber) {
  if (blockCache.has(blockNumber)) {
    return blockCache.get(blockNumber)
  }
  const block = await provider.getBlock(blockNumber)
  blockCache.set(blockNumber, block)
  // Clean old blocks (keep last 1000)
  if (blockCache.size > 1000) {
    const firstKey = blockCache.keys().next().value
    blockCache.delete(firstKey)
  }
  return block
}

// Price cache per block for BNB/HAVEN
const priceCache = new Map()
async function getCachedPrices(blockNumber) {
  const key = `prices_${blockNumber}`
  if (priceCache.has(key)) {
    return priceCache.get(key)
  }
  const HAVEN_ADDRESS = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690'
  const [havenPriceUSD, bnbPriceUSD] = await Promise.all([
    convertToUSD(1, HAVEN_ADDRESS, provider),
    getBNBPrice(provider)
  ])
  const prices = { havenPriceUSD, bnbPriceUSD }
  priceCache.set(key, prices)
  // Keep only last 100 blocks
  if (priceCache.size > 100) {
    const firstKey = priceCache.keys().next().value
    priceCache.delete(firstKey)
  }
  return prices
}

/**
 * Refresh tokens list from database
 */
async function refreshTokens() {
  if (Date.now() - lastTokensRefresh < TOKENS_REFRESH_INTERVAL) {
    return tokensCache
  }

  // Fetch from both robots and agents tables
  const { data: robots, error: robotsError } = await supabase
    .from('robots')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: agents, error: agentsError } = await supabase
    .from('agents')
    .select('*')
    .order('created_at', { ascending: false })

  if (robotsError && agentsError) {
    console.error('❌ Error fetching tokens:', robotsError || agentsError)
    return tokensCache
  }

  // Combine robots and agents, marking which table they're from
  const allTokens = [
    ...(robots || []).map(t => ({ ...t, _table: 'robots' })),
    ...(agents || []).map(t => ({ ...t, _table: 'agents' }))
  ]

  tokensCache = allTokens.filter(t => {
    const addr = t.bonding_contract || t.contract
    return addr && addr !== '0x0000000000000000000000000000000000000000'
  })

  lastTokensRefresh = Date.now()
  console.log(`📋 Refreshed ${tokensCache.length} tokens (${robots?.length || 0} robots, ${agents?.length || 0} agents)`)

  return tokensCache
}

/**
 * Calculate stats from all transfers
 */
async function calculateStats(tokenAddress, pairAddress, creatorAddress, totalSupply, currentBlockNumber) {
  // Get all transfers from database
  const { data: transfers, error } = await supabase
    .from('transfers')
    .select('from_address, to_address, amount, block_number, tx_hash')
    .eq('token_address', tokenAddress.toLowerCase())
    .order('block_number', { ascending: true })

  if (error || !transfers) {
    console.error('  Error fetching transfers:', error)
    return null
  }

  // Calculate balances
  const balances = new Map()

  for (const transfer of transfers) {
    const from = transfer.from_address.toLowerCase()
    const to = transfer.to_address.toLowerCase()
    const value = BigInt(transfer.amount)

    if (from !== '0x0000000000000000000000000000000000000000') {
      const current = balances.get(from) || 0n
      balances.set(from, current - value)
    }

    if (to !== '0x0000000000000000000000000000000000000000') {
      const current = balances.get(to) || 0n
      balances.set(to, current + value)
    }
  }

  // Filter holders (exclude ONLY burn address to match BSCScan exactly)
  // BSCScan includes: contract address, pool address, and ALL positive balances
  // No threshold needed when amounts are stored with full bigint precision
  const excludeAddresses = [
    '0x0000000000000000000000000000000000000000' // Burn address only
  ]

  const holders = []
  for (const [address, balance] of balances.entries()) {
    if (balance > 0n && !excludeAddresses.includes(address)) {
      holders.push({ address, balance })
    }
  }

  holders.sort((a, b) => (a.balance > b.balance ? -1 : 1))

  // Calculate txns (count Transfer events, not unique transaction hashes)
  // For tokens deployed within last 7 days, count ALL transfers since deployment
  const currentBlock = currentBlockNumber
  const oneDayAgoBlock = currentBlock - 28800
  const sevenDaysAgoBlock = currentBlock - 201600 // 7 days on BSC

  // Check if deployment was within last 7 days
  let isRecentToken = false
  if (transfers.length > 0) {
    const deployBlock = Math.min(...transfers.map(t => t.block_number))
    isRecentToken = deployBlock >= sevenDaysAgoBlock
  }

  const recentTransfers = isRecentToken ? transfers : transfers.filter(t => t.block_number >= oneDayAgoBlock)

  // Exclude contract and pair from holder lists, but calculate % against full totalSupply
  const tokenAddressLower = tokenAddress.toLowerCase()
  const pairAddressLower = pairAddress?.toLowerCase()

  const holdersExcludingContractAndPair = holders.filter(h =>
    h.address !== tokenAddressLower && h.address !== pairAddressLower
  )

  // Dev holds (calculate against full total supply)
  const devBalance = balances.get(creatorAddress?.toLowerCase()) || 0n
  const devHolds = totalSupply > 0n
    ? Math.round(Number(devBalance * 10000n / totalSupply) / 100)
    : 0

  // Top 10 holds (exclude contract and pair from list, but calculate % against full total supply)
  const top10 = holdersExcludingContractAndPair.slice(0, 10)
  const top10Total = top10.reduce((sum, h) => sum + h.balance, 0n)
  const top10Holds = totalSupply > 0n
    ? Math.round(Number(top10Total * 10000n / totalSupply) / 100)
    : 0

  // Detect phishing/snipers from CURRENT HOLDERS only (not global blacklist)
  // On bonding curve: Buy = Transfer FROM contract TO buyer
  const buyerSet = new Set()

  // Get all transfers FROM the contract (these are buys on bonding curve)
  const { data: bondingBuys } = await supabase
    .from('transfers')
    .select('to_address')
    .eq('token_address', tokenAddress.toLowerCase())
    .eq('from_address', tokenAddress.toLowerCase())

  if (bondingBuys) {
    bondingBuys.forEach(b => buyerSet.add(b.to_address.toLowerCase()))
  }

  // Also check DEX swaps for graduated tokens
  const { data: swapBuys } = await supabase
    .from('swaps')
    .select('trader_address')
    .eq('token_address', tokenAddress.toLowerCase())
    .eq('is_buy', true)

  if (swapBuys) {
    swapBuys.forEach(s => buyerSet.add(s.trader_address.toLowerCase()))
  }

  // Detect snipers (bought in first 10 blocks)
  const sniperSet = new Set()
  if (transfers.length > 0) {
    const firstBlock = Math.min(...transfers.map(t => t.block_number))
    const snipeWindow = firstBlock + 10

    for (const t of transfers) {
      if (t.block_number <= snipeWindow && buyerSet.has(t.to_address.toLowerCase())) {
        sniperSet.add(t.to_address.toLowerCase())
      }
    }
  }

  // Calculate phishing and snipers
  let phishingTotal = 0n
  let snipersTotal = 0n

  for (const holder of holdersExcludingContractAndPair) {
    const addr = holder.address.toLowerCase()

    // Phishing = holds tokens but never bought
    if (!buyerSet.has(addr)) {
      phishingTotal += holder.balance
    }

    // Sniper = bought in first 10 blocks
    if (sniperSet.has(addr)) {
      snipersTotal += holder.balance
    }
  }

  const phishingHolds = totalSupply > 0n ? Math.round(Number(phishingTotal * 10000n / totalSupply) / 100) : 0
  const snipersHold = totalSupply > 0n ? Math.round(Number(snipersTotal * 10000n / totalSupply) / 100) : 0

  // Get global insider list
  const { data: insiderFlags } = await supabase
    .from('wallet_flags')
    .select('wallet_address')
    .eq('is_insider', true)

  const insiderSet = new Set()
  if (insiderFlags) {
    insiderFlags.forEach(f => insiderSet.add(f.wallet_address.toLowerCase()))
  }

  let insidersTotal = 0n
  for (const holder of holdersExcludingContractAndPair) {
    if (insiderSet.has(holder.address.toLowerCase())) {
      insidersTotal += holder.balance
    }
  }

  const insidersHold = totalSupply > 0n ? Math.round(Number(insidersTotal * 10000n / totalSupply) / 100) : 0

  return {
    holdersCount: holdersExcludingContractAndPair.length,
    txns24h: recentTransfers.length,
    devHolds,
    top10Holds,
    phishingHolds,
    snipersHold,
    insidersHold,
    holders: holdersExcludingContractAndPair
  }
}

/**
 * Calculate price and market cap from bonding curve contract
 */
async function calculateBondingCurveMetrics(tokenAddress, totalSupply) {
  try {
    const bondingContract = new ethers.Contract(tokenAddress, BONDING_CURVE_ABI, provider)

    // Get bonding curve data and market cap directly from contract
    const [bondingCurve, marketCapXToken] = await Promise.all([
      bondingContract.getBondingCurve(),
      bondingContract.getMarketCapXToken()
    ])

    // Convert price from HAVEN to USD
    const priceInHaven = parseFloat(ethers.formatEther(bondingCurve.currentPriceXToken))
    const HAVEN_ADDRESS = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690'
    const priceUSD = await convertToUSD(priceInHaven, HAVEN_ADDRESS, provider)

    // Convert market cap from HAVEN to USD
    const marketCapInHaven = parseFloat(ethers.formatEther(marketCapXToken))
    const marketCapUSD = await convertToUSD(marketCapInHaven, HAVEN_ADDRESS, provider)

    // Calculate liquidity (HAVEN in reserve converted to USD)
    const liquidityInHaven = parseFloat(ethers.formatEther(bondingCurve.realXTokenReserve))
    const liquidityUSD = await convertToUSD(liquidityInHaven, HAVEN_ADDRESS, provider)

    // Get Buy/Sell events for last 10,000 blocks (~8.3 hours on BSC)
    const currentBlock = await provider.getBlockNumber()
    const startBlock = Math.max(0, currentBlock - 10000)

    // Query Buy and Sell events
    const [buyEvents, sellEvents] = await Promise.all([
      bondingContract.queryFilter(bondingContract.filters.Buy(), startBlock, currentBlock),
      bondingContract.queryFilter(bondingContract.filters.Sell(), startBlock, currentBlock)
    ])

    // Calculate buy/sell metrics AND store swaps in database
    const HAVEN_PRICE_USD = await convertToUSD(1, HAVEN_ADDRESS, provider)
    const swapRecords = []

    // Batch fetch all unique blocks first
    const uniqueBlockNumbers = new Set([...buyEvents.map(e => e.blockNumber), ...sellEvents.map(e => e.blockNumber)])
    const blockPromises = Array.from(uniqueBlockNumbers).map(bn => getBlockCached(bn))
    await Promise.all(blockPromises)

    let buys24hVolume = 0
    for (const buy of buyEvents) {
      const xTokenIn = parseFloat(ethers.formatEther(buy.args.xTokenIn))
      const tokensOut = parseFloat(ethers.formatEther(buy.args.tokensOut))
      buys24hVolume += xTokenIn * HAVEN_PRICE_USD

      // Get block timestamp from cache
      const block = await getBlockCached(buy.blockNumber)

      // Store bonding curve buy as a swap record
      swapRecords.push({
        token_address: tokenAddress.toLowerCase(),
        pair_address: tokenAddress.toLowerCase(), // Use bonding curve address as pair_address
        trader_address: buy.args.user.toLowerCase(),
        is_buy: true,
        token_amount: buy.args.tokensOut.toString(),
        bnb_amount: buy.args.xTokenIn.toString(), // Actually HAVEN, but stored in bnb_amount field
        price_usd: tokensOut > 0 ? (xTokenIn * HAVEN_PRICE_USD) / tokensOut : 0,
        tx_hash: buy.transactionHash.toLowerCase(),
        log_index: buy.index,
        block_number: buy.blockNumber,
        timestamp: new Date(block.timestamp * 1000).toISOString()
      })
    }

    let sells24hVolume = 0
    for (const sell of sellEvents) {
      const xTokenOut = parseFloat(ethers.formatEther(sell.args.xTokenOut))
      const tokensIn = parseFloat(ethers.formatEther(sell.args.tokensIn))
      sells24hVolume += xTokenOut * HAVEN_PRICE_USD

      // Get block timestamp from cache
      const block = await getBlockCached(sell.blockNumber)

      // Store bonding curve sell as a swap record
      swapRecords.push({
        token_address: tokenAddress.toLowerCase(),
        pair_address: tokenAddress.toLowerCase(), // Use bonding curve address as pair_address
        trader_address: sell.args.user.toLowerCase(),
        is_buy: false,
        token_amount: sell.args.tokensIn.toString(),
        bnb_amount: sell.args.xTokenOut.toString(), // Actually HAVEN, but stored in bnb_amount field
        price_usd: tokensIn > 0 ? (xTokenOut * HAVEN_PRICE_USD) / tokensIn : 0,
        tx_hash: sell.transactionHash.toLowerCase(),
        log_index: sell.index,
        block_number: sell.blockNumber,
        timestamp: new Date(block.timestamp * 1000).toISOString()
      })
    }

    // Store all swap records in database
    if (swapRecords.length > 0) {
      console.log(`  💾 Storing ${swapRecords.length} bonding curve swap records...`)
      const { error } = await supabase
        .from('swaps')
        .upsert(swapRecords, {
          onConflict: 'tx_hash,log_index',
          ignoreDuplicates: true
        })

      if (error) {
        console.error('  ⚠️  Error storing bonding curve swaps:', error.message)
        console.error('  ⚠️  First record:', JSON.stringify(swapRecords[0], null, 2))
      } else {
        console.log(`  ✅ Successfully stored ${swapRecords.length} swap records`)
      }
    } else {
      console.log('  ℹ️  No swap records to store (0 Buy/Sell events found)')
    }

    const netBuy24h = buys24hVolume - sells24hVolume
    const volume24h = buys24hVolume + sells24hVolume

    return {
      price: priceUSD,
      marketCap: marketCapUSD,
      volume24h,
      netBuy1m: netBuy24h, // Using 24h net buy as approximation for 1m
      liquidity: liquidityUSD,
      buys24h: buyEvents.length,
      buys24hVolume,
      sells24h: sellEvents.length,
      sells24hVolume,
      netBuy24h
    }
  } catch (error) {
    console.error('  Error calculating bonding curve metrics:', error.message)
    return {
      price: 0,
      marketCap: 0,
      volume24h: 0,
      netBuy1m: 0,
      liquidity: 0,
      buys24h: 0,
      buys24hVolume: 0,
      sells24h: 0,
      sells24hVolume: 0,
      netBuy24h: 0
    }
  }
}

/**
 * Calculate volume, market cap, and net buy from DEX swaps
 */
async function calculateDEXMetrics(tokenAddress, pairAddress, totalSupply) {
  if (!pairAddress || pairAddress === '0x0000000000000000000000000000000000000000') {
    return { volume24h: 0, marketCap: 0, netBuy1m: 0, price: 0, liquidity: 0 }
  }

  try {
    const pairContract = new ethers.Contract(pairAddress, PANCAKE_PAIR_ABI, provider)
    const currentBlock = await provider.getBlockNumber()

    // Get token order in pair
    const token0 = await pairContract.token0()
    const token1 = await pairContract.token1()
    const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase()

    // Get the pair's base token (not our token)
    const pairTokenAddress = isToken0 ? token1 : token0

    // Get reserves (needed for liquidity calculation)
    const reserves = await pairContract.getReserves()
    const tokenReserve = isToken0 ? reserves[0] : reserves[1]
    const pairTokenReserve = isToken0 ? reserves[1] : reserves[0]

    // Use last swap's price_usd for consistent market cap calculation (same as frontend)
    const { data: lastSwap } = await supabase
      .from('swaps')
      .select('price_usd')
      .eq('token_address', tokenAddress.toLowerCase())
      .eq('pair_address', pairAddress.toLowerCase())
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()

    let priceUSD = 0
    if (lastSwap && lastSwap.price_usd) {
      // Use stored price_usd from last swap (consistent with frontend)
      priceUSD = lastSwap.price_usd
    } else {
      // Fallback: calculate from reserves if no swaps yet
      let priceInPairToken = 0
      if (tokenReserve > 0n) {
        priceInPairToken = parseFloat(ethers.formatEther(pairTokenReserve)) / parseFloat(ethers.formatEther(tokenReserve))
      }

      priceUSD = await convertToUSD(priceInPairToken, pairTokenAddress, provider)
    }

    // Calculate market cap in USD
    const supply = totalSupply ? parseFloat(totalSupply) : 0
    const marketCap = priceUSD * supply

    // Calculate liquidity (total value of both reserves in USD)
    const pairTokenReserveAmount = parseFloat(ethers.formatEther(pairTokenReserve))
    const pairTokenValueUSD = await convertToUSD(pairTokenReserveAmount, pairTokenAddress, provider)
    const liquidity = pairTokenValueUSD * 2 // Both sides have equal value

    // ✅ OPTIMIZATION: Get 24h metrics from DATABASE instead of querying 10k blocks!
    // This reduces RPC calls from 750k CUs to ~0 CUs per token
    const timestamp24hAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const timestamp1mAgo = new Date(Date.now() - 60 * 1000).toISOString()

    const { data: swaps24h, error: swapsError } = await supabase
      .from('swaps')
      .select('*')
      .eq('token_address', tokenAddress.toLowerCase())
      .eq('pair_address', pairAddress.toLowerCase())
      .gte('timestamp', timestamp24hAgo)

    if (swapsError) {
      console.error('  ⚠️  Error fetching swaps from database:', swapsError.message)
      // Fallback to 0 metrics if database query fails
      return {
        volume24h: 0,
        marketCap,
        netBuy1m: 0,
        price: priceUSD,
        liquidity,
        buys24h: 0,
        buys24hVolume: 0,
        sells24h: 0,
        sells24hVolume: 0,
        netBuy24h: 0
      }
    }

    // Calculate 24h volume, net buy (1m), and buy/sell metrics from database data
    let volume24hWei = 0n
    let netBuy1mWei = 0n
    let buys24hCount = 0
    let sells24hCount = 0
    let buys24hVolumeWei = 0n
    let sells24hVolumeWei = 0n
    let netBuy24hWei = 0n

    for (const swap of swaps24h || []) {
      const bnbAmount = BigInt(swap.bnb_amount || 0)
      const isRecent = new Date(swap.timestamp) >= new Date(timestamp1mAgo)

      // Add to total volume
      volume24hWei += bnbAmount

      if (swap.is_buy) {
        buys24hCount++
        buys24hVolumeWei += bnbAmount
        netBuy24hWei += bnbAmount
        if (isRecent) netBuy1mWei += bnbAmount
      } else {
        sells24hCount++
        sells24hVolumeWei += bnbAmount
        netBuy24hWei -= bnbAmount
        if (isRecent) netBuy1mWei -= bnbAmount
      }
    }

    const volume24h = parseFloat(ethers.formatEther(volume24hWei))
    const netBuy1m = parseFloat(ethers.formatEther(netBuy1mWei))

    // Convert pair token volumes to USD (can be BNB or HAVEN)
    const pairTokenPriceUSD = await convertToUSD(1, pairTokenAddress, provider)
    const buys24hVolumeUSD = parseFloat(ethers.formatEther(buys24hVolumeWei)) * pairTokenPriceUSD
    const sells24hVolumeUSD = parseFloat(ethers.formatEther(sells24hVolumeWei)) * pairTokenPriceUSD
    const netBuy24hUSD = parseFloat(ethers.formatEther(netBuy24hWei)) * pairTokenPriceUSD

    return {
      volume24h,
      marketCap,
      netBuy1m,
      price: priceUSD,
      liquidity,
      buys24h: buys24hCount,
      buys24hVolume: buys24hVolumeUSD,
      sells24h: sells24hCount,
      sells24hVolume: sells24hVolumeUSD,
      netBuy24h: netBuy24hUSD
    }
  } catch (error) {
    console.error('  Error calculating DEX metrics:', error.message)
    return {
      volume24h: 0,
      marketCap: 0,
      netBuy1m: 0,
      price: 0,
      liquidity: 0,
      buys24h: 0,
      buys24hVolume: 0,
      sells24h: 0,
      sells24hVolume: 0,
      netBuy24h: 0
    }
  }
}

/**
 * Store price snapshot for historical tracking
 */
async function storePriceSnapshot(tokenAddress, price) {
  if (!price || price === 0) return

  try {
    await supabase
      .from('price_snapshots')
      .insert({
        token_address: tokenAddress.toLowerCase(),
        price: price,
        timestamp: new Date().toISOString()
      })
  } catch (error) {
    // Silent fail - not critical
  }
}

/**
 * Calculate price changes from historical snapshots
 */
async function calculatePriceChanges(tokenAddress, currentPrice) {
  if (!currentPrice || currentPrice === 0) {
    return { priceChange5m: 0, priceChange1h: 0, priceChange6h: 0, priceChange24h: 0 }
  }

  try {
    const now = new Date()

    // Calculate timestamps for each interval
    const time5mAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
    const time1hAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const time6hAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()
    const time24hAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    // Query price snapshots for each interval
    const { data: snapshots } = await supabase
      .from('price_snapshots')
      .select('price, timestamp')
      .eq('token_address', tokenAddress.toLowerCase())
      .gte('timestamp', time24hAgo)
      .order('timestamp', { ascending: true })

    if (!snapshots || snapshots.length === 0) {
      return { priceChange5m: 0, priceChange1h: 0, priceChange6h: 0, priceChange24h: 0 }
    }

    // Find closest price for each interval
    const findClosestPrice = (targetTime) => {
      let closest = null
      let minDiff = Infinity

      for (const snapshot of snapshots) {
        const diff = Math.abs(new Date(snapshot.timestamp).getTime() - new Date(targetTime).getTime())
        if (diff < minDiff) {
          minDiff = diff
          closest = snapshot
        }
      }

      return closest ? parseFloat(closest.price) : null
    }

    const price5mAgo = findClosestPrice(time5mAgo)
    const price1hAgo = findClosestPrice(time1hAgo)
    const price6hAgo = findClosestPrice(time6hAgo)
    const price24hAgo = findClosestPrice(time24hAgo)

    // Calculate percentage changes
    const calcChange = (oldPrice) => {
      if (!oldPrice || oldPrice === 0) return 0
      return ((currentPrice - oldPrice) / oldPrice) * 100
    }

    return {
      priceChange5m: calcChange(price5mAgo),
      priceChange1h: calcChange(price1hAgo),
      priceChange6h: calcChange(price6hAgo),
      priceChange24h: calcChange(price24hAgo)
    }
  } catch (error) {
    console.error('  ⚠️  Error calculating price changes:', error.message)
    return { priceChange5m: 0, priceChange1h: 0, priceChange6h: 0, priceChange24h: 0 }
  }
}

/**
 * Check if token should be graduated by looking for Graduated event
 */
async function checkGraduation(token, tokenAddress) {
  // Skip if already graduated
  if (token.is_graduated) {
    return
  }

  try {
    // Look for Graduated event in recent blocks
    const BONDING_ABI = [
      'event Graduated(address indexed token, uint256 xTokenRaised, uint256 timestamp, bool isAutoGraduation)'
    ]

    const bondingContract = new ethers.Contract(tokenAddress, BONDING_ABI, provider)
    const currentBlock = await provider.getBlockNumber()

    // Only check last 1000 blocks for realtime (more efficient)
    const startBlock = Math.max(0, currentBlock - 1000)

    const graduatedEvents = await bondingContract.queryFilter(
      bondingContract.filters.Graduated(),
      startBlock,
      currentBlock
    )

    if (graduatedEvents.length > 0) {
      const graduatedEvent = graduatedEvents[0]
      const blockData = await provider.getBlock(graduatedEvent.blockNumber)
      const graduatedTime = new Date(blockData.timestamp * 1000).toISOString()

      console.log(`  🎉 ${token.ticker || token.name} graduated at block ${graduatedEvent.blockNumber}!`)

      // Fetch total supply from the token contract
      let totalSupply = 0
      try {
        const tokenContract = new ethers.Contract(token.bonding_contract, TOKEN_ABI, provider)
        const supply = await tokenContract.totalSupply()
        totalSupply = parseFloat(ethers.formatUnits(supply, 18))
        console.log(`  📊 Total supply: ${totalSupply}`)
      } catch (e) {
        console.error(`  ⚠️  Could not fetch total supply:`, e.message)
      }

      const { error } = await supabase
        .from(token._table || 'robots')
        .update({
          is_graduated: true,
          graduated_at: graduatedTime,
          total_supply: totalSupply
        })
        .eq('id', token.id)

      if (error) {
        console.error(`  ❌ Error marking as graduated:`, error)
      } else {
        console.log(`  ✅ Token marked as graduated`)
      }
    }
  } catch (error) {
    // Silently fail - graduation check is not critical for realtime indexing
  }
}

/**
 * Process new blocks for a token
 */
async function processToken(token, fromBlock, toBlock, currentBlockNumber) {
  const tokenContractAddress = token.contract  // ERC20 token contract
  const bondingCurveAddress = token.bonding_contract  // Bonding curve contract
  const tokenAddress = bondingCurveAddress || tokenContractAddress  // For database storage - prefer bonding curve
  const tokenName = token.ticker || token.name || 'Unknown'
  const pairAddress = token.uniswap_pool_address
  const creatorAddress = token.wallet

  // Skip if neither contract is deployed
  if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
    return
  }

  // Check if token contract is deployed (for Transfer events)
  const isTokenDeployed = tokenContractAddress && tokenContractAddress !== '0x0000000000000000000000000000000000000000'

  try {
    // Create contract instance if token is deployed (needed for totalSupply later)
    let contract = null
    if (isTokenDeployed) {
      contract = new ethers.Contract(tokenContractAddress, TOKEN_ABI, provider)
    }

    // Fetch new transfers (only if ERC20 token is deployed)
    let transfers = []
    if (isTokenDeployed && contract) {
      try {
        transfers = await contract.queryFilter(
          contract.filters.Transfer(),
          fromBlock,
          toBlock
        )
      } catch (error) {
        console.error(`  ⚠️  Error fetching transfers for ${tokenName}:`, error.message)
      }
    }

    // Fetch Buy/Sell events from bonding curve (if not graduated)
    let buyEvents = []
    let sellEvents = []
    let dexSwapEvents = []

    if (!token.is_graduated && bondingCurveAddress) {
      try {
        const bondingContract = new ethers.Contract(bondingCurveAddress, BONDING_CURVE_ABI, provider)
        ;[buyEvents, sellEvents] = await Promise.all([
          bondingContract.queryFilter(bondingContract.filters.Buy(), fromBlock, toBlock),
          bondingContract.queryFilter(bondingContract.filters.Sell(), fromBlock, toBlock)
        ])
      } catch (error) {
        // Token might not have bonding curve methods, skip
      }
    } else if (pairAddress && pairAddress !== '0x0000000000000000000000000000000000000000') {
      // ✅ Fetch PancakeSwap Swap events for graduated tokens
      try {
        const pairContract = new ethers.Contract(pairAddress, PANCAKE_PAIR_ABI, provider)
        dexSwapEvents = await pairContract.queryFilter(
          pairContract.filters.Swap(),
          fromBlock,
          toBlock
        )
      } catch (error) {
        console.error(`  ⚠️  Error fetching DEX swaps for ${tokenName}:`, error.message)
      }
    }

    // Batch fetch all unique blocks for transfers, buys, sells, and DEX swaps
    const allBlockNumbers = new Set([
      ...transfers.map(t => t.blockNumber),
      ...buyEvents.map(b => b.blockNumber),
      ...sellEvents.map(s => s.blockNumber),
      ...dexSwapEvents.map(s => s.blockNumber)
    ])
    const blockPromises = Array.from(allBlockNumbers).map(bn => getBlockCached(bn))
    await Promise.all(blockPromises)

    if (transfers.length > 0) {
      console.log(`  📥 ${tokenName}: ${transfers.length} new transfers (blocks ${fromBlock}-${toBlock})`)

      // Store transfers in database
      const records = transfers.map(transfer => ({
        token_address: tokenAddress.toLowerCase(),
        from_address: transfer.args.from.toLowerCase(),
        to_address: transfer.args.to.toLowerCase(),
        amount: transfer.args.value.toString(),
        tx_hash: transfer.transactionHash,
        block_number: transfer.blockNumber,
        log_index: transfer.index,
        timestamp: 0
      }))

      const { error } = await supabase
        .from('transfers')
        .upsert(records, {
          onConflict: 'tx_hash,token_address,log_index',
          ignoreDuplicates: true
        })

      if (error) {
        console.error(`  ❌ Error storing transfers:`, error.message)
      }
    }

    // Store Buy/Sell events in trades table
    if (buyEvents.length > 0 || sellEvents.length > 0) {
      console.log(`  💰 ${tokenName}: ${buyEvents.length} buys, ${sellEvents.length} sells`)

      // Get current prices for USD conversion (use cached prices)
      const prices = await getCachedPrices(currentBlockNumber)
      const havenPriceUSD = prices.havenPriceUSD
      const bnbPriceUSD = prices.bnbPriceUSD

      const tradeRecords = []

      // Process Buy events
      for (const buy of buyEvents) {
        const xTokenIn = ethers.formatEther(buy.args.xTokenIn)
        const tokensOut = ethers.formatEther(buy.args.tokensOut)
        const block = await getBlockCached(buy.blockNumber)

        tradeRecords.push({
          contract: tokenAddress.toLowerCase(),
          type: 'buy',
          user: buy.args.user.toLowerCase(),
          ethIn: xTokenIn,
          tokensOut: tokensOut,
          tokensIn: null,
          ethOut: null,
          usdSpent: parseFloat(xTokenIn) * havenPriceUSD,
          usdReceived: null,
          timestamp: block.timestamp,
          tx_hash: buy.transactionHash,
          block_number: buy.blockNumber
        })
      }

      // Process Sell events
      for (const sell of sellEvents) {
        const tokensIn = ethers.formatEther(sell.args.tokensIn)
        const xTokenOut = ethers.formatEther(sell.args.xTokenOut)
        const block = await getBlockCached(sell.blockNumber)

        tradeRecords.push({
          contract: tokenAddress.toLowerCase(),
          type: 'sell',
          user: sell.args.user.toLowerCase(),
          ethIn: null,
          tokensOut: null,
          tokensIn: tokensIn,
          ethOut: xTokenOut,
          usdSpent: null,
          usdReceived: parseFloat(xTokenOut) * havenPriceUSD,
          timestamp: block.timestamp,
          tx_hash: sell.transactionHash,
          block_number: sell.blockNumber
        })
      }

      // Store trades in database
      if (tradeRecords.length > 0) {
        // First, try to update existing trades that match by user, contract, timestamp (within 1 second), type
        // This handles the case where backend already created the trade without tx_hash
        for (const trade of tradeRecords) {
          // Find matching trade within 1 second of timestamp (to handle floating point precision)
          const timestampLower = trade.timestamp - 1
          const timestampUpper = trade.timestamp + 1

          const { data: existingTrades } = await supabase
            .from('trades')
            .select('id, tx_hash, usdSpent, ethIn')
            .eq('contract', trade.contract)
            .eq('user', trade.user)
            .eq('type', trade.type)
            .gte('timestamp', timestampLower)
            .lte('timestamp', timestampUpper)
            .limit(1)

          if (existingTrades && existingTrades.length > 0) {
            // Update the existing trade with tx_hash and other data
            const { error } = await supabase
              .from('trades')
              .update({
                tx_hash: trade.tx_hash,
                block_number: trade.block_number,
                timestamp: trade.timestamp, // Update to exact timestamp from blockchain
                ethIn: trade.ethIn,
                ethOut: trade.ethOut,
                tokensIn: trade.tokensIn,
                tokensOut: trade.tokensOut,
                usdSpent: trade.usdSpent,
                usdReceived: trade.usdReceived
              })
              .eq('id', existingTrades[0].id)

            if (error) {
              console.error(`  ⚠️  Error updating trade:`, error.message)
            } else {
              console.log(`  ✅ Updated trade ${existingTrades[0].id} with tx_hash`)
            }
          } else {
            // No existing trade found, insert new one
            const { error: insertError } = await supabase
              .from('trades')
              .insert([trade])

            if (insertError) {
              console.error(`  ⚠️  Error inserting trade:`, insertError.message)
            }
          }
        }
      }

      // ALSO store in swaps table for charts (charts query from swaps, not trades)
      const swapRecords = []

      // Add Buy events to swaps
      for (const buy of buyEvents) {
        const xTokenIn = parseFloat(ethers.formatEther(buy.args.xTokenIn))
        const tokensOut = parseFloat(ethers.formatEther(buy.args.tokensOut))
        const block = await getBlockCached(buy.blockNumber)

        swapRecords.push({
          token_address: tokenAddress.toLowerCase(),
          pair_address: tokenAddress.toLowerCase(), // Use bonding curve address as pair_address
          trader_address: buy.args.user.toLowerCase(),
          is_buy: true,
          token_amount: buy.args.tokensOut.toString(),
          bnb_amount: buy.args.xTokenIn.toString(), // Actually HAVEN, but stored in bnb_amount field
          price_usd: tokensOut > 0 ? (xTokenIn * havenPriceUSD) / tokensOut : 0,
          tx_hash: buy.transactionHash.toLowerCase(),
          log_index: buy.index,
          block_number: buy.blockNumber,
          timestamp: new Date(block.timestamp * 1000).toISOString()
        })
      }

      // Add Sell events to swaps
      for (const sell of sellEvents) {
        const tokensIn = parseFloat(ethers.formatEther(sell.args.tokensIn))
        const xTokenOut = parseFloat(ethers.formatEther(sell.args.xTokenOut))
        const block = await getBlockCached(sell.blockNumber)

        swapRecords.push({
          token_address: tokenAddress.toLowerCase(),
          pair_address: tokenAddress.toLowerCase(), // Use bonding curve address as pair_address
          trader_address: sell.args.user.toLowerCase(),
          is_buy: false,
          token_amount: sell.args.tokensIn.toString(),
          bnb_amount: sell.args.xTokenOut.toString(), // Actually HAVEN
          price_usd: tokensIn > 0 ? (xTokenOut * havenPriceUSD) / tokensIn : 0,
          tx_hash: sell.transactionHash.toLowerCase(),
          log_index: sell.index,
          block_number: sell.blockNumber,
          timestamp: new Date(block.timestamp * 1000).toISOString()
        })
      }

      // Store swap records for chart display
      if (swapRecords.length > 0) {
        console.log(`  💾 Storing ${swapRecords.length} swap records for chart...`)
        const { error: swapError } = await supabase
          .from('swaps')
          .upsert(swapRecords, {
            onConflict: 'tx_hash,log_index',
            ignoreDuplicates: true
          })

        if (swapError) {
          console.error(`  ⚠️  Error storing swaps:`, swapError.message)
        } else {
          console.log(`  ✅ Stored ${swapRecords.length} swaps for chart`)
        }
      }
    }

    // ✅ Process and store DEX swaps for graduated tokens
    if (dexSwapEvents.length > 0 && pairAddress) {
      console.log(`  🔄 ${tokenName}: ${dexSwapEvents.length} new DEX swaps (blocks ${fromBlock}-${toBlock})`)

      try {
        const pairContract = new ethers.Contract(pairAddress, PANCAKE_PAIR_ABI, provider)
        const [token0, token1] = await Promise.all([
          pairContract.token0(),
          pairContract.token1()
        ])
        const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase()

        // Get pair token address for price conversion
        const pairTokenAddress = isToken0 ? token1 : token0

        const dexSwapRecords = []
        for (const swap of dexSwapEvents) {
          const { amount0In, amount1In, amount0Out, amount1Out, to } = swap.args

          let isBuy = false
          let tokenAmount = 0n
          let pairTokenAmount = 0n

          if (isToken0) {
            const pairTokenIn = amount1In
            const pairTokenOut = amount1Out

            if (pairTokenIn > 0n && amount0Out > 0n) {
              isBuy = true
              tokenAmount = amount0Out
              pairTokenAmount = pairTokenIn
            } else if (amount0In > 0n && pairTokenOut > 0n) {
              isBuy = false
              tokenAmount = amount0In
              pairTokenAmount = pairTokenOut
            }
          } else {
            const pairTokenIn = amount0In
            const pairTokenOut = amount0Out

            if (pairTokenIn > 0n && amount1Out > 0n) {
              isBuy = true
              tokenAmount = amount1Out
              pairTokenAmount = pairTokenIn
            } else if (amount1In > 0n && pairTokenOut > 0n) {
              isBuy = false
              tokenAmount = amount1In
              pairTokenAmount = pairTokenOut
            }
          }

          if (tokenAmount > 0n && pairTokenAmount > 0n) {
            const block = await getBlockCached(swap.blockNumber)
            const timestamp = new Date(block.timestamp * 1000).toISOString()

            // Calculate price from ACTUAL swap amounts (not reserves)
            // This gives the exact execution price for THIS trade
            const priceInPairToken = parseFloat(ethers.formatEther(pairTokenAmount)) / parseFloat(ethers.formatEther(tokenAmount))
            const priceUSD = await convertToUSD(priceInPairToken, pairTokenAddress, provider)

            dexSwapRecords.push({
              token_address: tokenAddress.toLowerCase(),
              pair_address: pairAddress.toLowerCase(),
              tx_hash: swap.transactionHash,
              block_number: swap.blockNumber,
              log_index: swap.index,
              timestamp: timestamp,
              trader_address: to.toLowerCase(),
              is_buy: isBuy,
              token_amount: tokenAmount.toString(),
              bnb_amount: pairTokenAmount.toString(),
              price_usd: priceUSD
            })
          }
        }

        if (dexSwapRecords.length > 0) {
          const { error: dexSwapError } = await supabase
            .from('swaps')
            .upsert(dexSwapRecords, {
              onConflict: 'tx_hash,log_index',
              ignoreDuplicates: true
            })

          if (dexSwapError) {
            console.error(`  ⚠️  Error storing DEX swaps:`, dexSwapError.message)
          } else {
            console.log(`  ✅ Stored ${dexSwapRecords.length} DEX swaps`)
          }
        }
      } catch (error) {
        console.error(`  ⚠️  Error processing DEX swaps for ${tokenName}:`, error.message)
      }
    }

    // Calculate stats if there were any transfers or trades
    if (transfers.length > 0 || buyEvents.length > 0 || sellEvents.length > 0 || dexSwapEvents.length > 0) {
      // Get total supply (use bonding curve contract if token contract not deployed)
      let totalSupply = 0n
      if (contract) {
        totalSupply = await contract.totalSupply()
      } else if (bondingCurveAddress) {
        // Try bonding curve contract for totalSupply
        try {
          const bondingContract = new ethers.Contract(bondingCurveAddress, BONDING_CURVE_ABI, provider)
          totalSupply = await bondingContract.totalSupply()
        } catch (error) {
          console.error(`  ⚠️  Error fetching totalSupply for ${tokenName}:`, error.message)
        }
      }

      const stats = await calculateStats(tokenAddress, pairAddress, creatorAddress, totalSupply, currentBlockNumber)

      if (stats) {
        // Save holder balances
        if (stats.holders.length > 0) {
          const holdingRecords = stats.holders.map(h => ({
            token_address: tokenAddress.toLowerCase(),
            holder_address: h.address.toLowerCase(),
            balance: h.balance.toString(),
            updated_at: new Date().toISOString()
          }))

          await supabase
            .from('bonding_holdings')
            .upsert(holdingRecords, {
              onConflict: 'token_address,holder_address',
              ignoreDuplicates: false
            })
        }

        // Calculate price and market cap based on token state
        let metrics = { volume24h: 0, marketCap: 0, netBuy1m: 0, price: 0 }

        if (token.is_graduated && pairAddress) {
          // Graduated tokens: use DEX metrics (PancakeSwap)
          metrics = await calculateDEXMetrics(tokenAddress, pairAddress, totalSupply)
        } else {
          // Non-graduated tokens: use bonding curve metrics
          metrics = await calculateBondingCurveMetrics(tokenAddress, totalSupply)
        }

        // Store price snapshot for historical tracking
        await storePriceSnapshot(tokenAddress, metrics.price)

        // Store BNB and HAVEN price snapshots (every 5 minutes to avoid spam)
        const HAVEN_ADDRESS = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690'
        const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
        const now = Date.now()

        if (!lastProcessedBlock.get('bnb_snapshot') || now - lastProcessedBlock.get('bnb_snapshot') > 5 * 60 * 1000) {
          const [havenPrice, bnbPrice] = await Promise.all([
            convertToUSD(1, HAVEN_ADDRESS, provider),
            getBNBPrice(provider)
          ])

          await Promise.all([
            storePriceSnapshot(HAVEN_ADDRESS, havenPrice),
            storePriceSnapshot(WBNB_ADDRESS, bnbPrice)
          ])

          lastProcessedBlock.set('bnb_snapshot', now)
        }

        // Calculate price changes from historical snapshots
        const priceChanges = await calculatePriceChanges(tokenAddress, metrics.price)

        // Sync virtual reserves from blockchain if missing or obviously wrong (only for non-graduated tokens)
        let virtualReservesUpdate = {}
        if (!token.is_graduated && bondingCurveAddress) {
          try {
            const currentVirtualEth = token.virtual_eth_reserve || '0'
            const parsedValue = parseFloat(currentVirtualEth)

            // Check if virtual reserves look wrong (0, 1e18, or neither 7e18 nor 6000e18)
            const needsSync = parsedValue === 0 ||
                             currentVirtualEth === '1000000000000000000' || // 1e18 (wrong default)
                             (currentVirtualEth !== '7000000000000000000' && currentVirtualEth !== '6000000000000000000000') // Not 7 BNB or 6000 HAVEN

            if (needsSync) {
              console.log(`  🔄 ${tokenName}: Syncing virtual reserves from blockchain...`)
              const bondingContract = new ethers.Contract(bondingCurveAddress, BONDING_CURVE_ABI, provider)
              const [virtualXTokens, virtualProjectTokens] = await Promise.all([
                bondingContract.VIRTUAL_X_TOKENS().catch(() => null),
                bondingContract.VIRTUAL_PROJECT_TOKENS().catch(() => null)
              ])

              if (virtualXTokens && virtualProjectTokens) {
                virtualReservesUpdate = {
                  virtual_eth_reserve: virtualXTokens.toString(),
                  virtual_token_reserve: virtualProjectTokens.toString()
                }
                console.log(`  ✅ ${tokenName}: Synced virtual reserves - ${ethers.formatEther(virtualXTokens)} (${virtualXTokens.toString()})`)
              }
            }
          } catch (error) {
            // Silently fail - not critical
          }
        }

        // Update robots table
        const metadata = {
          devHolds: stats.devHolds,
          top10Holds: stats.top10Holds,
          phishingHolds: stats.phishingHolds,
          snipersHold: stats.snipersHold,
          insidersHold: stats.insidersHold,
          netBuy1m: metrics.netBuy1m,
          lastIndexed: new Date().toISOString()
        }

        // Update both robots and agents tables (token might be in either)
        await supabase
          .from('robots')
          .update({
            holders_count: stats.holdersCount,
            txns_24h: stats.txns24h,
            volume_24h: metrics.volume24h,
            market_cap: metrics.marketCap,
            price: metrics.price,
            liquidity: metrics.liquidity,
            price_change_5m: priceChanges.priceChange5m,
            price_change_1h: priceChanges.priceChange1h,
            price_change_6h: priceChanges.priceChange6h,
            price_change_24h: priceChanges.priceChange24h,
            buys_24h: metrics.buys24h || 0,
            buys_24h_volume: metrics.buys24hVolume || 0,
            sells_24h: metrics.sells24h || 0,
            sells_24h_volume: metrics.sells24hVolume || 0,
            net_buy_24h: metrics.netBuy24h || 0,
            extras: metadata,
            updated_at: new Date().toISOString(),
            ...virtualReservesUpdate // Add virtual reserves if synced
          })
          .or(`contract.eq.${tokenAddress},bonding_contract.eq.${tokenAddress}`)

        await supabase
          .from('agents')
          .update({
            holders_count: stats.holdersCount,
            txns_24h: stats.txns24h,
            volume_24h: metrics.volume24h,
            market_cap: metrics.marketCap,
            price: metrics.price,
            liquidity: metrics.liquidity,
            price_change_5m: priceChanges.priceChange5m,
            price_change_1h: priceChanges.priceChange1h,
            price_change_6h: priceChanges.priceChange6h,
            price_change_24h: priceChanges.priceChange24h,
            buys_24h: metrics.buys24h || 0,
            buys_24h_volume: metrics.buys24hVolume || 0,
            sells_24h: metrics.sells24h || 0,
            sells_24h_volume: metrics.sells24hVolume || 0,
            net_buy_24h: metrics.netBuy24h || 0,
            extras: metadata,
            updated_at: new Date().toISOString(),
            ...virtualReservesUpdate // Add virtual reserves if synced
          })
          .or(`contract.eq.${tokenAddress},bonding_contract.eq.${tokenAddress}`)

        console.log(`  ✅ ${tokenName}: ${stats.holdersCount} holders, ${stats.txns24h} txs, vol ${metrics.volume24h.toFixed(2)} BNB, mc $${metrics.marketCap.toFixed(0)}, price $${metrics.price.toFixed(8)}, net ${metrics.netBuy1m.toFixed(2)} BNB`)
      }

      // Check if token should be graduated
      await checkGraduation(token, tokenAddress)
    }

    lastProcessedBlock.set(tokenAddress, toBlock)
  } catch (error) {
    console.error(`  ❌ Error processing ${tokenName}:`, error.message)
    console.error(`     Stack:`, error.stack)
  }
}

/**
 * Main loop - listen for new blocks via WebSocket (instant notifications)
 */
async function main() {
  console.log('🚀 Starting real-time blockchain indexer...\n')

  // Initial backfill - last 100 blocks
  const currentBlock = await provider.getBlockNumber()
  const backfillFromBlock = currentBlock - 100

  console.log(`📚 Initial backfill from block ${backfillFromBlock} to ${currentBlock}\n`)

  const tokens = await refreshTokens()

  // Backfill last 100 blocks for all tokens
  for (const token of tokens) {
    const tokenAddress = token.bonding_contract || token.contract
    await processToken(token, backfillFromBlock, currentBlock, currentBlock)
    lastProcessedBlock.set(tokenAddress, currentBlock)
  }

  console.log(`\n✅ Initial backfill complete! Now listening for new blocks...\n`)

  // Initial fee collection check (run in background, don't block WebSocket setup)
  checkCreatorFeeCollections().catch(error => {
    console.error('❌ Error in initial fee check:', error)
  })

  // Check for fee collections every 10 minutes (1000 blocks each time)
  setInterval(async () => {
    try {
      await checkCreatorFeeCollections()
    } catch (error) {
      console.error('❌ Error checking fee collections:', error)
    }
  }, FEE_CHECK_INTERVAL)

  console.log(`⏰ Fee collection checker scheduled every 10 minutes (1000 blocks per run)\n`)

  // Subscribe to database changes for new tokens (instant notifications!)
  const robotsSubscription = supabase
    .channel('robots-changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'robots'
      },
      async (payload) => {
        console.log(`\n🆕 New token detected: ${payload.new.name} (${payload.new.ticker})`)
        const newToken = payload.new
        const tokenAddress = newToken.bonding_contract || newToken.contract

        if (tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000') {
          // Add to cache immediately
          tokensCache.push(newToken)

          // Process the new token from its deployment block
          const currentBlock = await provider.getBlockNumber()
          const startBlock = newToken.deployed_block_number || (currentBlock - 100)

          console.log(`  📊 Processing new token from block ${startBlock}...`)
          await processToken(newToken, startBlock, currentBlock, currentBlock)
          lastProcessedBlock.set(tokenAddress, currentBlock)
          console.log(`  ✅ New token processed and tracking started!`)
        }
      }
    )
    .subscribe()

  console.log('📡 Subscribed to database for new token inserts!\n')

  // Subscribe to new blocks via WebSocket (instant notifications!)
  let lastBlock = currentBlock

  wsProvider.on('block', async (blockNumber) => {
    try {
      if (blockNumber > lastBlock) {
        console.log(`\n⚡ New block: ${blockNumber} (${blockNumber - lastBlock} blocks behind)`)

        // Refresh tokens list
        const tokens = await refreshTokens()

        // Process each token
        for (const token of tokens) {
          const tokenAddress = token.bonding_contract || token.contract
          const fromBlock = (lastProcessedBlock.get(tokenAddress) || lastBlock) + 1

          if (fromBlock <= blockNumber) {
            await processToken(token, fromBlock, blockNumber, blockNumber)
          }
        }

        lastBlock = blockNumber
      }
    } catch (error) {
      console.error('❌ Error processing block:', error)
    }
  })

  // Add error handlers for WebSocket
  wsProvider.on('error', (error) => {
    console.error('⚠️  WebSocket error:', error.message)
  })

  wsProvider.on('debug', (info) => {
    console.log('🔍 WebSocket debug:', info)
  })

  console.log('🎧 Subscribed to new blocks via WebSocket - updates are instant!\n')
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down gracefully...')
  await wsProvider.destroy()
  await httpProvider.destroy()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n👋 Shutting down gracefully...')
  await wsProvider.destroy()
  await httpProvider.destroy()
  process.exit(0)
})

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
