/**
 * Comprehensive Blockchain Event Indexer
 *
 * This script indexes ALL blockchain events for tokens:
 * - Transfer events (for holders, balances, top10, etc.)
 * - Swap events from PancakeSwap (for volume, netBuy, etc.)
 * - Syncs data to transfers table for fast querying
 *
 * Run with: node scripts/index-blockchain-events.js
 */

import { ethers } from 'ethers'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Load .env manually
const envPath = path.join(process.cwd(), '.env')
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
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// BSC RPC - MUST use Alchemy from .env
const rpcUrl = process.env.VITE_BSC_RPC_URL
if (!rpcUrl) {
  console.error('❌ VITE_BSC_RPC_URL not found in .env')
  console.error('Please add your Alchemy RPC URL to .env file')
  process.exit(1)
}

console.log(`Using RPC: ${rpcUrl.includes('alchemy') ? 'Alchemy (from .env)' : rpcUrl}`)
const provider = new ethers.JsonRpcProvider(rpcUrl)

// ABIs
const TOKEN_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event CreatorFeesCollected(address indexed creator, uint256 amountETH)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function creator() view returns (address)'
]

const PANCAKE_PAIR_ABI = [
  'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
]

const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' // WBNB on BSC

/**
 * Index all Transfer events for a token from blockchain
 */
async function indexTransferEvents(tokenAddress, tokenName, fromBlock = 0) {
  console.log(`\n📥 Indexing Transfer events for ${tokenName} (${tokenAddress})...`)

  try {
    const contract = new ethers.Contract(tokenAddress, TOKEN_ABI, provider)
    const currentBlock = await provider.getBlockNumber()

    // Fetch in chunks (Alchemy limit: 10k blocks)
    const CHUNK_SIZE = 10000
    const allTransfers = []

    console.log(`  Fetching from block ${fromBlock} to ${currentBlock}...`)

    for (let start = fromBlock; start <= currentBlock; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, currentBlock)

      const transfers = await contract.queryFilter(
        contract.filters.Transfer(),
        start,
        end
      )

      allTransfers.push(...transfers)

      if (transfers.length > 0) {
        console.log(`  Found ${transfers.length} transfers in blocks ${start}-${end}`)
      }
    }

    console.log(`  Total transfers found: ${allTransfers.length}`)

    // Store transfers in database
    if (allTransfers.length > 0) {
      await storeTransfers(tokenAddress, allTransfers)
    }

    return allTransfers
  } catch (error) {
    console.error(`  ❌ Error indexing transfers for ${tokenName}:`, error.message)
    return []
  }
}

/**
 * Store transfer events in database
 */
async function storeTransfers(tokenAddress, transfers) {
  console.log(`  💾 Storing ${transfers.length} transfers in database...`)

  // Batch insert transfers (Supabase limit: 1000 per batch)
  const BATCH_SIZE = 1000
  let stored = 0

  for (let i = 0; i < transfers.length; i += BATCH_SIZE) {
    const batch = transfers.slice(i, i + BATCH_SIZE)

    const records = batch.map(transfer => ({
      token_address: tokenAddress.toLowerCase(),
      from_address: transfer.args.from.toLowerCase(),
      to_address: transfer.args.to.toLowerCase(),
      amount: transfer.args.value.toString(),
      tx_hash: transfer.transactionHash,
      block_number: transfer.blockNumber,
      log_index: transfer.index,
      timestamp: 0 // Will be updated with block timestamp
    }))

    // Upsert to avoid duplicates
    const { error } = await supabase
      .from('transfers')
      .upsert(records, {
        onConflict: 'tx_hash,token_address,log_index',
        ignoreDuplicates: true
      })

    if (error) {
      console.error(`  ❌ Error storing batch:`, error)
    } else {
      stored += batch.length
      console.log(`  Stored ${stored}/${transfers.length} transfers`)
    }
  }

  console.log(`  ✅ Stored ${stored} transfers`)
}

/**
 * Index PancakeSwap Swap events for graduated tokens
 */
async function indexSwapEvents(tokenAddress, pairAddress, tokenName) {
  if (!pairAddress || pairAddress === '0x0000000000000000000000000000000000000000') {
    return { swaps: [], netBuy1m: 0 }
  }

  console.log(`\n🥞 Indexing PancakeSwap swaps for ${tokenName}...`)

  try {
    const pairContract = new ethers.Contract(pairAddress, PANCAKE_PAIR_ABI, provider)
    const currentBlock = await provider.getBlockNumber()

    // Get token order in pair
    const token0 = await pairContract.token0()
    const token1 = await pairContract.token1()
    const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase()

    console.log(`  Token is token${isToken0 ? '0' : '1'} in pair`)
    console.log(`  Pair: ${token0} / ${token1}`)

    // Fetch recent swaps (last 24h = ~28800 blocks on BSC)
    const fromBlock = Math.max(0, currentBlock - 28800)

    const CHUNK_SIZE = 10000
    const allSwaps = []

    for (let start = fromBlock; start <= currentBlock; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, currentBlock)

      const swaps = await pairContract.queryFilter(
        pairContract.filters.Swap(),
        start,
        end
      )

      allSwaps.push(...swaps)
    }

    console.log(`  Found ${allSwaps.length} swaps in last 24h`)

    // Calculate net buy in last 1 minute
    const oneMinuteAgo = currentBlock - 20 // ~1 minute on BSC
    const recentSwaps = allSwaps.filter(s => s.blockNumber >= oneMinuteAgo)

    let netBuyWei = 0n

    for (const swap of recentSwaps) {
      const { amount0In, amount1In, amount0Out, amount1Out } = swap.args

      // Determine if this is a buy or sell of our token
      if (isToken0) {
        // Token is token0
        // Buy: BNB in (amount1In > 0), Token out (amount0Out > 0)
        // Sell: Token in (amount0In > 0), BNB out (amount1Out > 0)
        if (amount1In > 0n && amount0Out > 0n) {
          // Buy
          netBuyWei += amount1In
        } else if (amount0In > 0n && amount1Out > 0n) {
          // Sell
          netBuyWei -= amount1Out
        }
      } else {
        // Token is token1
        // Buy: BNB in (amount0In > 0), Token out (amount1Out > 0)
        // Sell: Token in (amount1In > 0), BNB out (amount0Out > 0)
        if (amount0In > 0n && amount1Out > 0n) {
          // Buy
          netBuyWei += amount0In
        } else if (amount1In > 0n && amount0Out > 0n) {
          // Sell
          netBuyWei -= amount0Out
        }
      }
    }

    const netBuy1m = parseFloat(ethers.formatEther(netBuyWei))

    console.log(`  Net buy (1m): ${netBuy1m.toFixed(4)} BNB from ${recentSwaps.length} swaps`)

    return { swaps: allSwaps, netBuy1m }
  } catch (error) {
    console.error(`  ❌ Error indexing swaps:`, error.message)
    return { swaps: [], netBuy1m: 0 }
  }
}

/**
 * Index creator fee collection events for a token
 */
async function indexCreatorFeeCollections(tokenAddress, tokenName, fromBlock = 0) {
  console.log(`\n💰 Indexing Creator Fee Collections for ${tokenName}...`)

  try {
    const contract = new ethers.Contract(tokenAddress, TOKEN_ABI, provider)
    const currentBlock = await provider.getBlockNumber()

    // Get creator address
    let creatorAddress
    try {
      creatorAddress = await contract.creator()
    } catch (e) {
      console.log(`  ⚠️  No creator() function, skipping...`)
      return []
    }

    // Fetch CreatorFeesCollected events in chunks
    const CHUNK_SIZE = 10000
    const allCollections = []

    for (let start = fromBlock; start <= currentBlock; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, currentBlock)

      try {
        const events = await contract.queryFilter(
          contract.filters.CreatorFeesCollected(),
          start,
          end
        )

        allCollections.push(...events)

        if (events.length > 0) {
          console.log(`  Found ${events.length} fee collections in blocks ${start}-${end}`)
        }
      } catch (e) {
        // Skip chunk if error
      }
    }

    if (allCollections.length === 0) {
      console.log(`  No fee collections found`)
      return []
    }

    // Fetch BNB price (simplified - using fixed price for backfill)
    const BNB_PRICE = 600 // USD

    // Store in database
    for (const event of allCollections) {
      const amountBNB = event.args.amountETH // Named ETH but it's BNB
      const amountBNBFloat = parseFloat(ethers.formatEther(amountBNB))
      const amountUSD = amountBNBFloat * BNB_PRICE

      // Get block timestamp
      const block = await provider.getBlock(event.blockNumber)
      const timestamp = new Date(block.timestamp * 1000).toISOString()

      // Insert into database
      const { error } = await supabase
        .from('creator_fees_history')
        .upsert({
          token_address: tokenAddress.toLowerCase(),
          creator_address: creatorAddress.toLowerCase(),
          amount_bnb: amountBNB.toString(),
          amount_usd: amountUSD.toFixed(2),
          tx_hash: event.transactionHash.toLowerCase(),
          block_number: event.blockNumber,
          timestamp: timestamp
        }, {
          onConflict: 'tx_hash',
          ignoreDuplicates: true
        })

      if (error && error.code !== '23505') {
        console.error(`  ❌ Failed to insert: ${error.message}`)
      } else {
        console.log(`  ✓ ${amountBNBFloat.toFixed(6)} BNB ($${amountUSD.toFixed(2)}) - Block ${event.blockNumber}`)
      }
    }

    console.log(`  Total: ${allCollections.length} collection(s) indexed`)
    return allCollections

  } catch (error) {
    console.error(`  ❌ Error indexing fee collections:`, error.message)
    return []
  }
}

/**
 * Calculate ALL stats from blockchain Transfer events
 */
async function calculateStatsFromTransfers(transfers, tokenAddress, pairAddress, creatorAddress, totalSupply) {
  console.log(`\n📊 Calculating stats from ${transfers.length} transfers...`)

  // Calculate balances from all Transfer events
  const balances = new Map()

  for (const transfer of transfers) {
    const from = transfer.args.from.toLowerCase()
    const to = transfer.args.to.toLowerCase()
    const value = transfer.args.value

    // Subtract from sender (unless minting from zero address)
    if (from !== '0x0000000000000000000000000000000000000000') {
      const current = balances.get(from) || 0n
      balances.set(from, current - value)
    }

    // Add to receiver (unless burning to zero address)
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

  // Sort by balance descending
  holders.sort((a, b) => (a.balance > b.balance ? -1 : 1))

  const holdersCount = holders.length
  console.log(`  Holders: ${holdersCount}`)

  // Calculate transaction count
  // For tokens deployed within last 7 days, count ALL transfers since deployment
  // Otherwise show last 24h only
  const currentBlock = await provider.getBlockNumber()
  const oneDayAgoBlock = currentBlock - 28800
  const sevenDaysAgoBlock = currentBlock - 201600 // 7 days on BSC

  // Check if deployment was within last 7 days
  let isRecentToken = false
  let deployBlock = 0
  if (transfers.length > 0) {
    deployBlock = Math.min(...transfers.map(t => t.blockNumber))
    isRecentToken = deployBlock >= sevenDaysAgoBlock
  }

  const txns24h = isRecentToken ? transfers.length : transfers.filter(t => t.blockNumber >= oneDayAgoBlock).length

  console.log(`  24h Transfer Events: ${txns24h}${isRecentToken ? ` (deployed at block ${deployBlock}, showing all since launch)` : ''}`)

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

  console.log(`  Dev holds: ${devHolds}%`)

  // Top 10 holds (exclude contract and pair from list, but calculate % against full total supply)
  const top10 = holdersExcludingContractAndPair.slice(0, 10)
  const top10Total = top10.reduce((sum, h) => sum + h.balance, 0n)
  const top10Holds = totalSupply > 0n
    ? Math.round(Number(top10Total * 10000n / totalSupply) / 100)
    : 0

  console.log(`  Top 10 holds: ${top10Holds}%`)

  return {
    holdersCount,
    txns24h,
    devHolds,
    top10Holds,
    holders, // Full list for wallet analysis
    balances // Full balance map
  }
}

/**
 * Save holder balances to bonding_holdings table
 */
async function saveHolderBalances(tokenAddress, holders) {
  console.log(`\n💾 Saving ${holders.length} holder balances to database...`)

  if (holders.length === 0) return

  // Prepare records for bonding_holdings table
  const records = holders.map(holder => ({
    token_address: tokenAddress.toLowerCase(),
    holder_address: holder.address.toLowerCase(),
    balance: holder.balance.toString(),
    updated_at: new Date().toISOString()
  }))

  // Batch upsert (1000 per batch)
  const BATCH_SIZE = 1000
  let saved = 0

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
      .from('bonding_holdings')
      .upsert(batch, {
        onConflict: 'token_address,holder_address',
        ignoreDuplicates: false // Update existing records
      })

    if (error) {
      console.error(`  ❌ Error saving batch:`, error)
    } else {
      saved += batch.length
      console.log(`  Saved ${saved}/${records.length} holders`)
    }
  }

  console.log(`  ✅ Saved ${saved} holder balances`)
}

/**
 * Detect phishing/snipers/insiders from CURRENT HOLDERS only
 */
async function calculateWalletStats(holders, totalSupply, tokenAddress, pairAddress) {
  console.log(`\n🔍 Analyzing current holders for phishing/snipers...`)

  const tokenAddressLower = tokenAddress.toLowerCase()
  const pairAddressLower = pairAddress?.toLowerCase()

  // Exclude contract and pair from analysis
  const holdersExcludingContractAndPair = holders.filter(h =>
    h.address !== tokenAddressLower && h.address !== pairAddressLower
  )

  console.log(`  Analyzing ${holdersExcludingContractAndPair.length} current holders`)

  // Get all buyers (wallets that actually bought tokens)
  // On bonding curve: Buy = Transfer FROM contract TO buyer
  const buyerSet = new Set()

  // Get all transfers FROM the contract (these are buys on bonding curve)
  const { data: bondingBuys } = await supabase
    .from('transfers')
    .select('to_address')
    .eq('token_address', tokenAddressLower)
    .eq('from_address', tokenAddressLower)

  if (bondingBuys) {
    bondingBuys.forEach(b => buyerSet.add(b.to_address.toLowerCase()))
  }

  // Also check DEX swaps for graduated tokens
  const { data: swapBuys } = await supabase
    .from('swaps')
    .select('trader_address')
    .eq('token_address', tokenAddressLower)
    .eq('is_buy', true)

  if (swapBuys) {
    swapBuys.forEach(s => buyerSet.add(s.trader_address.toLowerCase()))
  }

  console.log(`  Found ${buyerSet.size} unique buyers`)

  // Get first transfer block to detect snipers
  const { data: transfers } = await supabase
    .from('transfers')
    .select('block_number, to_address')
    .eq('token_address', tokenAddressLower)
    .order('block_number', { ascending: true })
    .limit(100)

  const firstBlock = transfers && transfers.length > 0 ? transfers[0].block_number : 0
  const snipeWindow = firstBlock + 10 // First 10 blocks = snipers

  // Detect snipers (bought in first 10 blocks)
  const sniperSet = new Set()
  if (transfers) {
    for (const t of transfers) {
      if (t.block_number <= snipeWindow && buyerSet.has(t.to_address.toLowerCase())) {
        sniperSet.add(t.to_address.toLowerCase())
      }
    }
  }

  console.log(`  Detected ${sniperSet.size} snipers (bought in first 10 blocks)`)

  // Calculate totals
  let phishingTotal = 0n
  let snipersTotal = 0n
  let phishingCount = 0
  let sniperCount = 0

  for (const holder of holdersExcludingContractAndPair) {
    const addr = holder.address.toLowerCase()

    // Phishing = holds tokens but never bought
    if (!buyerSet.has(addr)) {
      phishingTotal += holder.balance
      phishingCount++
    }

    // Sniper = bought in first 10 blocks
    if (sniperSet.has(addr)) {
      snipersTotal += holder.balance
      sniperCount++
    }
  }

  const phishingHolds = totalSupply > 0n
    ? Math.round(Number(phishingTotal * 10000n / totalSupply) / 100)
    : 0

  const snipersHold = totalSupply > 0n
    ? Math.round(Number(snipersTotal * 10000n / totalSupply) / 100)
    : 0

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
  let insiderCount = 0

  for (const holder of holdersExcludingContractAndPair) {
    const addr = holder.address.toLowerCase()
    if (insiderSet.has(addr)) {
      insidersTotal += holder.balance
      insiderCount++
    }
  }

  const insidersHold = totalSupply > 0n
    ? Math.round(Number(insidersTotal * 10000n / totalSupply) / 100)
    : 0

  console.log(`  Phishing: ${phishingCount} holders (${phishingHolds}%)`)
  console.log(`  Snipers: ${sniperCount} holders (${snipersHold}%)`)
  console.log(`  Insiders: ${insiderCount} holders (${insidersHold}%)`)

  return { phishingHolds, snipersHold, insidersHold }
}

/**
 * Update robot stats in database
 */
async function updateRobotStats(tokenAddress, stats) {
  console.log(`\n💾 Updating database...`)

  const { error } = await supabase
    .from('robots')
    .update({
      holders_count: stats.holdersCount,
      txns_24h: stats.txns24h,
      updated_at: new Date().toISOString()
    })
    .or(`contract.eq.${tokenAddress},bonding_contract.eq.${tokenAddress}`)

  if (error) {
    console.error(`  ❌ Error updating database:`, error)
  } else {
    console.log(`  ✅ Database updated`)
  }

  // Store metadata in extras field
  const metadata = {
    devHolds: stats.devHolds,
    top10Holds: stats.top10Holds,
    phishingHolds: stats.phishingHolds,
    snipersHold: stats.snipersHold,
    insidersHold: stats.insidersHold,
    netBuy1m: stats.netBuy1m || 0,
    lastIndexed: new Date().toISOString()
  }

  const { error: metaError } = await supabase
    .from('robots')
    .update({ extras: metadata })
    .or(`contract.eq.${tokenAddress},bonding_contract.eq.${tokenAddress}`)

  if (metaError) {
    console.error(`  ❌ Error updating metadata:`, metaError)
  } else {
    console.log(`  ✅ Metadata stored in extras field`)
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

  console.log(`\n🎓 Checking graduation status...`)

  try {
    // Look for Graduated event
    const BONDING_ABI = [
      'event Graduated(address indexed token, uint256 xTokenRaised, uint256 timestamp, bool isAutoGraduation)'
    ]

    const bondingContract = new ethers.Contract(tokenAddress, BONDING_ABI, provider)
    const currentBlock = await provider.getBlockNumber()

    // Search from deploy block or last 100k blocks
    const startBlock = token.deployed_block_number || Math.max(0, currentBlock - 100000)

    // Look for Graduated event in chunks
    const CHUNK_SIZE = 10000
    let graduatedEvents = []

    for (let start = startBlock; start <= currentBlock; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, currentBlock)
      const events = await bondingContract.queryFilter(
        bondingContract.filters.Graduated(),
        start,
        end
      )
      if (events.length > 0) {
        graduatedEvents = events
        break
      }
    }

    if (graduatedEvents.length > 0) {
      const graduatedEvent = graduatedEvents[0]
      const blockData = await provider.getBlock(graduatedEvent.blockNumber)
      const graduatedTime = new Date(blockData.timestamp * 1000).toISOString()

      console.log(`  🎉 Found Graduated event at block ${graduatedEvent.blockNumber}!`)
      console.log(`  Raised: ${ethers.formatEther(graduatedEvent.args.xTokenRaised)} HAVEN`)
      console.log(`  Time: ${graduatedTime}`)

      const { error } = await supabase
        .from('robots')
        .update({
          is_graduated: true,
          graduated_at: graduatedTime
        })
        .eq('id', token.id)

      if (error) {
        console.error(`  ❌ Error marking as graduated:`, error)
      } else {
        console.log(`  ✅ Token marked as graduated`)
      }
    } else {
      console.log(`  Token not yet graduated`)
    }
  } catch (error) {
    console.error(`  ❌ Error checking graduation:`, error.message)
  }
}

/**
 * Index a single token completely
 */
async function indexToken(token) {
  const tokenAddress = token.bonding_contract || token.contract
  const tokenName = token.ticker || token.name || 'Unknown'
  const pairAddress = token.uniswap_pool_address
  const creatorAddress = token.wallet

  console.log(`\n${'='.repeat(80)}`)
  console.log(`📦 INDEXING: ${tokenName} (${tokenAddress})`)
  console.log(`${'='.repeat(80)}`)

  // Step 1: Index Transfer events
  // Use token's deployed block OR start from 7 days ago (approx 201,600 blocks on BSC)
  const currentBlock = await provider.getBlockNumber()
  const startBlock = token.deployed_block_number || Math.max(0, currentBlock - 201600)

  const transfers = await indexTransferEvents(tokenAddress, tokenName, startBlock)

  if (transfers.length === 0) {
    console.log(`⚠️  No transfers found, skipping...`)
    return
  }

  // Step 2: Get total supply from contract
  const contract = new ethers.Contract(tokenAddress, TOKEN_ABI, provider)
  const totalSupply = await contract.totalSupply()

  console.log(`  Total supply: ${ethers.formatEther(totalSupply)}`)

  // Step 3: Calculate stats from transfers
  const stats = await calculateStatsFromTransfers(
    transfers,
    tokenAddress,
    pairAddress,
    creatorAddress,
    totalSupply
  )

  // Step 4: Save holder balances to database
  await saveHolderBalances(tokenAddress, stats.holders)

  // Step 5: Calculate wallet stats (phishing, snipers, insiders)
  const walletStats = await calculateWalletStats(stats.holders, totalSupply, tokenAddress, pairAddress)
  Object.assign(stats, walletStats)

  // Step 6: Index DEX swaps for graduated tokens
  if (token.is_graduated && pairAddress) {
    const { netBuy1m } = await indexSwapEvents(tokenAddress, pairAddress, tokenName)
    stats.netBuy1m = netBuy1m
  } else {
    stats.netBuy1m = 0
  }

  // Step 7: Index creator fee collections
  await indexCreatorFeeCollections(tokenAddress, tokenName, startBlock)

  // Step 8: Check if token should be graduated
  await checkGraduation(token, tokenAddress)

  // Step 9: Update database with all stats
  await updateRobotStats(tokenAddress, stats)

  console.log(`\n✅ ${tokenName} indexed successfully!`)

  return stats
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting comprehensive blockchain indexer...\n')

  // Get ATLAS token only
  const { data: tokens, error } = await supabase
    .from('robots')
    .select('*')
    .eq('bonding_contract', '0x9948098C3d452FEc752B84B34847165bD9461ee8')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Error fetching tokens:', error)
    process.exit(1)
  }

  // Filter valid tokens
  const validTokens = tokens.filter(t => {
    const addr = t.bonding_contract || t.contract
    return addr && addr !== '0x0000000000000000000000000000000000000000'
  })

  console.log(`Found ${validTokens.length} tokens to index\n`)

  // Index all tokens
  for (let i = 0; i < validTokens.length; i++) {
    const token = validTokens[i]

    try {
      await indexToken(token)
    } catch (error) {
      console.error(`\n❌ Failed to index token:`, error)
    }

    // Rate limiting between tokens
    if (i < validTokens.length - 1) {
      console.log(`\n⏳ Waiting 2 seconds before next token...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  console.log(`\n${'='.repeat(80)}`)
  console.log(`✅ INDEXING COMPLETE!`)
  console.log(`${'='.repeat(80)}`)
  console.log(`Indexed ${validTokens.length} tokens with full blockchain data`)
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
