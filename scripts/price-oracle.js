/**
 * Price Oracle Helper Functions
 * Provides USD price conversion for tokens
 */

import { ethers } from 'ethers'

const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'
const HAVEN_ADDRESS = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690'
const PANCAKE_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'

const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) view returns (address pair)'
]

const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)'
]

// Cache prices for 60 seconds
let bnbPriceCache = { price: null, timestamp: 0 }
let havenPriceCache = { price: null, timestamp: 0 }

/**
 * Get BNB price in USD from BNB/USDT pair
 */
export async function getBNBPrice(provider) {
  const now = Date.now()
  if (bnbPriceCache.price && (now - bnbPriceCache.timestamp) < 60000) {
    return bnbPriceCache.price
  }

  try {
    const factory = new ethers.Contract(PANCAKE_FACTORY, FACTORY_ABI, provider)
    const pairAddress = await factory.getPair(WBNB_ADDRESS, USDT_ADDRESS)

    if (pairAddress === '0x0000000000000000000000000000000000000000') {
      console.error('  ⚠️  BNB/USDT pair not found, using fallback price $600')
      return 600
    }

    const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, provider)
    const [token0, reserves] = await Promise.all([
      pairContract.token0(),
      pairContract.getReserves()
    ])

    const isToken0 = token0.toLowerCase() === WBNB_ADDRESS.toLowerCase()
    const wbnbReserve = isToken0 ? reserves[0] : reserves[1]
    const usdtReserve = isToken0 ? reserves[1] : reserves[0]

    const bnbPrice = parseFloat(ethers.formatEther(usdtReserve)) / parseFloat(ethers.formatEther(wbnbReserve))

    bnbPriceCache = { price: bnbPrice, timestamp: now }
    return bnbPrice
  } catch (error) {
    console.error('  ⚠️  Error fetching BNB price:', error.message)
    return 600 // Fallback
  }
}

/**
 * Get HAVEN price in BNB from HAVEN/BNB pair
 */
export async function getHAVENPriceInBNB(provider) {
  const now = Date.now()
  if (havenPriceCache.price && (now - havenPriceCache.timestamp) < 60000) {
    return havenPriceCache.price
  }

  try {
    const factory = new ethers.Contract(PANCAKE_FACTORY, FACTORY_ABI, provider)
    const pairAddress = await factory.getPair(HAVEN_ADDRESS, WBNB_ADDRESS)

    if (pairAddress === '0x0000000000000000000000000000000000000000') {
      console.error('  ⚠️  HAVEN/BNB pair not found')
      return 0
    }

    const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, provider)
    const [token0, reserves] = await Promise.all([
      pairContract.token0(),
      pairContract.getReserves()
    ])

    const isToken0 = token0.toLowerCase() === HAVEN_ADDRESS.toLowerCase()
    const havenReserve = isToken0 ? reserves[0] : reserves[1]
    const wbnbReserve = isToken0 ? reserves[1] : reserves[0]

    const havenPriceInBNB = parseFloat(ethers.formatEther(wbnbReserve)) / parseFloat(ethers.formatEther(havenReserve))

    havenPriceCache = { price: havenPriceInBNB, timestamp: now }
    return havenPriceInBNB
  } catch (error) {
    console.error('  ⚠️  Error fetching HAVEN price:', error.message)
    return 0
  }
}

/**
 * Get HAVEN price in USD
 */
export async function getHAVENPriceUSD(provider) {
  const [havenInBNB, bnbInUSD] = await Promise.all([
    getHAVENPriceInBNB(provider),
    getBNBPrice(provider)
  ])

  return havenInBNB * bnbInUSD
}

/**
 * Convert token price to USD based on pair currency
 * @param {number} priceInPairToken - Price in the pair's base token
 * @param {string} pairTokenAddress - Address of the pair's base token
 * @param {object} provider - Ethers provider
 * @returns {number} Price in USD
 */
export async function convertToUSD(priceInPairToken, pairTokenAddress, provider) {
  const pairToken = pairTokenAddress.toLowerCase()

  if (pairToken === WBNB_ADDRESS.toLowerCase()) {
    // Direct BNB pair
    const bnbPrice = await getBNBPrice(provider)
    return priceInPairToken * bnbPrice
  } else if (pairToken === HAVEN_ADDRESS.toLowerCase()) {
    // HAVEN pair - convert through BNB
    const [havenInBNB, bnbInUSD] = await Promise.all([
      getHAVENPriceInBNB(provider),
      getBNBPrice(provider)
    ])
    return priceInPairToken * havenInBNB * bnbInUSD
  } else if (pairToken === USDT_ADDRESS.toLowerCase()) {
    // Already in USD
    return priceInPairToken
  } else {
    console.error(`  ⚠️  Unknown pair token: ${pairTokenAddress}`)
    return 0
  }
}
