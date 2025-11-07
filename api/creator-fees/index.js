/**
 * API endpoint to get creator fees (both historical and pending)
 */

import { createClient } from '@supabase/supabase-js'
import { ethers } from 'ethers'

// Use environment variables (works both locally and on Vercel)
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_KEY
const rpcUrl = process.env.VITE_BSC_RPC_URL || 'https://bsc-dataseed.binance.org/'

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars:', { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey })
  throw new Error('Missing Supabase credentials')
}

const supabase = createClient(supabaseUrl, supabaseKey)
const provider = new ethers.JsonRpcProvider(rpcUrl)

const TOKEN_ABI = [
  'function getFees() view returns (uint256 factoryFeesETH, uint256 creatorFeesETH, uint256 factoryFeesXToken, uint256 creatorFeesXToken, uint256 factoryFeesTokens, uint256 creatorFeesTokens)',
  'function price() view returns (uint256)'
]

// Cache for 50 minutes
const cache = {
  data: null,
  timestamp: 0
}
const CACHE_DURATION = 50 * 60 * 1000 // 50 minutes in milliseconds

// Helper to send JSON response (compatible with Node.js HTTP response)
function sendJSON(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

async function getBNBPrice() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd')
    const data = await response.json()
    return data.binancecoin?.usd || 600
  } catch (error) {
    return 600
  }
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 200
    return res.end()
  }

  if (req.method !== 'GET') {
    return sendJSON(res, 405, { error: 'Method not allowed' })
  }

  const { address, action } = req.query

  try {
    // Get total fees across all tokens
    if (action === 'total') {
      return await getTotalFees(res)
    }

    // Get fees for specific token
    if (address) {
      return await getTokenFees(res, address)
    }

    // Get fees for all tokens (aggregated)
    return await getAllTokensFees(res)

  } catch (error) {
    console.error('Creator fees API error:', error)
    return sendJSON(res, 500, {
      success: false,
      error: error.message
    })
  }
}

async function getTotalFees(res) {
  // Check cache first
  const now = Date.now()
  if (cache.data && (now - cache.timestamp) < CACHE_DURATION) {
    console.log('[Creator Fees API] Serving from cache')
    return sendJSON(res, 200, {
      success: true,
      data: cache.data,
      cached: true,
      cacheAge: Math.floor((now - cache.timestamp) / 1000) // seconds
    })
  }

  console.log('[Creator Fees API] Cache miss, fetching fresh data...')

  // Get total historical collected fees
  const { data: historical, error: histError} = await supabase
    .from('creator_fees_history')
    .select('amount_bnb, amount_usd')

  if (histError) {
    throw histError
  }

  const totalHistoricalBNB = historical.reduce((sum, row) => {
    // Convert to string to handle large numbers from database
    const amountBnbStr = String(row.amount_bnb || '0')
    return sum + parseFloat(ethers.formatEther(amountBnbStr))
  }, 0)

  const totalHistoricalUSD = historical.reduce((sum, row) => {
    return sum + parseFloat(row.amount_usd || 0)
  }, 0)

  // Get all tokens to check pending fees
  const { data: tokens, error: tokensError } = await supabase
    .from('robots')
    .select('contract, bonding_contract, price')

  if (tokensError) {
    throw tokensError
  }

  let totalPendingBNB = 0
  let totalPendingTokensUSD = 0
  const bnbPrice = await getBNBPrice()

  // Check pending fees for each token (this is slow, consider caching)
  for (const token of tokens.slice(0, 50)) { // Limit to 50 for performance
    try {
      const tokenAddress = token.bonding_contract || token.contract
      const contract = new ethers.Contract(tokenAddress, TOKEN_ABI, provider)
      const fees = await contract.getFees()

      const pendingBNB = parseFloat(ethers.formatEther(fees[1])) // creatorFeesETH
      const pendingTokens = parseFloat(ethers.formatEther(fees[5])) // creatorFeesTokens

      totalPendingBNB += pendingBNB
      totalPendingTokensUSD += pendingTokens * (token.price || 0)
    } catch (e) {
      // Skip tokens that fail
    }
  }

  const totalPendingUSD = (totalPendingBNB * bnbPrice) + totalPendingTokensUSD

  const result = {
    historical: {
      bnb: totalHistoricalBNB,
      usd: totalHistoricalUSD,
      collections: historical.length
    },
    pending: {
      bnb: totalPendingBNB,
      tokensUSD: totalPendingTokensUSD,
      totalUSD: totalPendingUSD
    },
    total: {
      usd: totalHistoricalUSD + totalPendingUSD,
      bnb: totalHistoricalBNB + totalPendingBNB
    }
  }

  // Cache the result
  cache.data = result
  cache.timestamp = Date.now()
  console.log('[Creator Fees API] Cached fresh data for 50 minutes')

  return sendJSON(res, 200, {
    success: true,
    data: result,
    cached: false
  })
}

async function getTokenFees(res, tokenAddress) {
  // Get historical collected fees for this token
  const { data: historical, error: histError } = await supabase
    .from('creator_fees_history')
    .select('*')
    .eq('token_address', tokenAddress.toLowerCase())
    .order('timestamp', { ascending: false })

  if (histError) {
    throw histError
  }

  const totalHistoricalBNB = historical.reduce((sum, row) => {
    return sum + parseFloat(ethers.formatEther(row.amount_bnb || '0'))
  }, 0)

  const totalHistoricalUSD = historical.reduce((sum, row) => {
    return sum + parseFloat(row.amount_usd || 0)
  }, 0)

  // Get pending fees from contract
  let pendingBNB = 0
  let pendingTokens = 0
  let pendingUSD = 0

  try {
    const contract = new ethers.Contract(tokenAddress, TOKEN_ABI, provider)
    const [fees, tokenPrice] = await Promise.all([
      contract.getFees(),
      contract.price().catch(() => 0n)
    ])

    pendingBNB = parseFloat(ethers.formatEther(fees[1])) // creatorFeesETH
    pendingTokens = parseFloat(ethers.formatEther(fees[5])) // creatorFeesTokens

    const tokenPriceFloat = parseFloat(ethers.formatEther(tokenPrice))
    const bnbPrice = await getBNBPrice()

    pendingUSD = (pendingBNB * bnbPrice) + (pendingTokens * tokenPriceFloat)
  } catch (e) {
    console.warn(`Failed to get pending fees for ${tokenAddress}:`, e.message)
  }

  return sendJSON(res, 200, {
    success: true,
    data: {
      tokenAddress: tokenAddress.toLowerCase(),
      historical: {
        bnb: totalHistoricalBNB,
        usd: totalHistoricalUSD,
        collections: historical,
        totalCollections: historical.length
      },
      pending: {
        bnb: pendingBNB,
        tokens: pendingTokens,
        usd: pendingUSD
      },
      total: {
        bnb: totalHistoricalBNB + pendingBNB,
        usd: totalHistoricalUSD + pendingUSD
      }
    }
  })
}

async function getAllTokensFees(res) {
  // Get summary from database view (if exists) or raw table
  const { data: summary, error } = await supabase
    .from('creator_fees_history')
    .select('token_address, amount_bnb, amount_usd')

  if (error) {
    throw error
  }

  // Group by token
  const byToken = {}
  summary.forEach(row => {
    const addr = row.token_address
    if (!byToken[addr]) {
      byToken[addr] = {
        tokenAddress: addr,
        historicalBNB: 0,
        historicalUSD: 0,
        collections: 0
      }
    }
    byToken[addr].historicalBNB += parseFloat(ethers.formatEther(row.amount_bnb || '0'))
    byToken[addr].historicalUSD += parseFloat(row.amount_usd || 0)
    byToken[addr].collections += 1
  })

  return sendJSON(res, 200, {
    success: true,
    data: Object.values(byToken).sort((a, b) => b.historicalUSD - a.historicalUSD)
  })
}