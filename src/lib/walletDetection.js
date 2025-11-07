/**
 * Wallet Detection System
 * Identifies phishing, sniper, and insider wallets
 * Based on D:\haven\src\lib\walletDetection.ts
 */

import { supabase } from './supabase.js'

// Cache for wallet flags (reloaded every 5 minutes)
let KNOWN_PHISHING = new Set()
let KNOWN_SNIPERS = new Set()
let KNOWN_INSIDERS = new Set()
let lastWalletReload = 0
const WALLETS_RELOAD_INTERVAL = 5 * 60 * 1000 // 5 minutes

/**
 * Reload wallet flags from database
 */
export async function reloadWalletFlags(force = false) {
  const now = Date.now()
  if (!force && now - lastWalletReload < WALLETS_RELOAD_INTERVAL) {
    return // Don't reload too frequently
  }

  try {
    const { data, error } = await supabase
      .from('wallet_flags')
      .select('*')

    if (error) throw error

    KNOWN_PHISHING.clear()
    KNOWN_SNIPERS.clear()
    KNOWN_INSIDERS.clear()

    for (const flag of data || []) {
      const addr = flag.wallet_address.toLowerCase()
      if (flag.is_phishing) KNOWN_PHISHING.add(addr)
      if (flag.is_sniper) KNOWN_SNIPERS.add(addr)
      if (flag.is_insider) KNOWN_INSIDERS.add(addr)
    }

    lastWalletReload = now
  } catch (error) {
    console.error('Failed to reload wallet flags:', error)
  }
}

/**
 * Check if a wallet is flagged as phishing
 */
export function isPhishingWallet(address) {
  return KNOWN_PHISHING.has(address.toLowerCase())
}

/**
 * Check if a wallet is flagged as sniper
 */
export function isSniperWallet(address) {
  return KNOWN_SNIPERS.has(address.toLowerCase())
}

/**
 * Check if a wallet is flagged as insider
 */
export function isInsiderWallet(address) {
  return KNOWN_INSIDERS.has(address.toLowerCase())
}

/**
 * Detect phishing wallets
 * Phishing wallets received tokens via transfer (not through buying)
 */
export async function detectPhishing(tokenAddress) {
  try {
    // Get all wallets that received tokens via transfer
    const { data: transfers, error: transfersError } = await supabase
      .from('transfers')
      .select('to_address')
      .eq('token_address', tokenAddress)
      .neq('from_address', '0x0000000000000000000000000000000000000000') // Exclude mints

    if (transfersError) throw transfersError

    if (!transfers || transfers.length === 0) return []

    // Get unique recipient addresses
    const recipientAddresses = [...new Set(transfers.map(t => t.to_address.toLowerCase()))]

    // Get all wallets that bought tokens (from trades, bonding_trades, and swaps)
    const buyerAddresses = new Set()

    // Check bonding_trades (bonding curve buys)
    const { data: bondingBuys } = await supabase
      .from('bonding_trades')
      .select('trader_address')
      .eq('token_address', tokenAddress)
      .eq('trade_type', 'buy')

    if (bondingBuys) {
      bondingBuys.forEach(b => buyerAddresses.add(b.trader_address.toLowerCase()))
    }

    // Check trades table (legacy bonding curve buys)
    const { data: legacyBuys } = await supabase
      .from('trades')
      .select('user')
      .eq('contract', tokenAddress)
      .eq('type', 'buy')

    if (legacyBuys) {
      legacyBuys.forEach(t => buyerAddresses.add(t.user.toLowerCase()))
    }

    // Check swaps table (DEX buys)
    const { data: swapBuys } = await supabase
      .from('swaps')
      .select('trader_address')
      .eq('token_address', tokenAddress)
      .eq('is_buy', true)

    if (swapBuys) {
      swapBuys.forEach(s => buyerAddresses.add(s.trader_address.toLowerCase()))
    }

    // Phishing wallets = recipients that never bought
    const phishing = recipientAddresses.filter(addr => !buyerAddresses.has(addr))

    return phishing
  } catch (error) {
    console.error('Failed to detect phishing:', error)
    return []
  }
}

/**
 * Detect sniper wallets
 * Snipers buy tokens within the first 5 minutes of launch
 */
export async function detectSnipers(tokenAddress, createdAt) {
  try {
    const SNIPE_WINDOW = 5 * 60 // 5 minutes in seconds
    const tokenCreatedTime = new Date(createdAt).getTime() / 1000
    const snipeDeadline = tokenCreatedTime + SNIPE_WINDOW

    // Get all buy trades within first 5 minutes
    const { data: earlyTrades, error } = await supabase
      .from('trades')
      .select('user, timestamp')
      .eq('contract', tokenAddress)
      .eq('type', 'buy')
      .lte('timestamp', snipeDeadline)

    if (error) throw error

    // Count snipes per wallet
    const snipeCounts = {}
    for (const trade of earlyTrades || []) {
      const wallet = trade.user.toLowerCase()
      snipeCounts[wallet] = (snipeCounts[wallet] || 0) + 1
    }

    // Flag wallets with multiple snipes as snipers
    const newSnipers = []
    for (const [wallet, count] of Object.entries(snipeCounts)) {
      if (count >= 1) { // Even 1 early buy is suspicious
        newSnipers.push(wallet)
      }
    }

    return newSnipers
  } catch (error) {
    console.error('Failed to detect snipers:', error)
    return []
  }
}

/**
 * Detect insider wallets for a token
 * Method: Find wallets holding multiple tokens from the same creator
 */
export async function detectInsiders(tokenAddress, creatorAddress) {
  try {
    if (!creatorAddress) return []

    // Get all tokens created by this creator
    const { data: creatorTokens, error: tokensError } = await supabase
      .from('robots')
      .select('contract')
      .eq('wallet', creatorAddress)

    if (tokensError) throw error

    const tokenAddresses = (creatorTokens || []).map(t => t.contract)
    if (tokenAddresses.length < 2) {
      return [] // Need at least 2 tokens to detect insiders
    }

    // Get all holders of these tokens
    const { data: allHoldings, error: holdingsError } = await supabase
      .from('bonding_holdings')
      .select('holder_address, token_address')
      .in('token_address', tokenAddresses)
      .gt('balance', 0)

    if (holdingsError) throw holdingsError

    // Count tokens held per wallet
    const walletTokenCounts = {}
    for (const holding of allHoldings || []) {
      const wallet = holding.holder_address.toLowerCase()
      if (!walletTokenCounts[wallet]) {
        walletTokenCounts[wallet] = new Set()
      }
      walletTokenCounts[wallet].add(holding.token_address)
    }

    // Flag wallets holding 2+ tokens from same creator as insiders
    const insiders = []
    for (const [wallet, tokens] of Object.entries(walletTokenCounts)) {
      if (tokens.size >= 2 && wallet !== creatorAddress.toLowerCase()) {
        insiders.push(wallet)
      }
    }

    return insiders
  } catch (error) {
    console.error('Failed to detect insiders:', error)
    return []
  }
}

/**
 * Flag a wallet in the database
 */
export async function flagWallet(walletAddress, flags) {
  try {
    const { data, error } = await supabase
      .from('wallet_flags')
      .upsert({
        wallet_address: walletAddress.toLowerCase(),
        is_phishing: flags.isPhishing || false,
        is_sniper: flags.isSniper || false,
        is_insider: flags.isInsider || false,
        sniper_score: flags.sniperScore || flags.snipeCount || 0,
        insider_connections: flags.insiderConnections || 0,
        phishing_reports: flags.phishingReports || 0,
        notes: flags.notes || flags.insiderReason || '',
        last_updated_at: new Date().toISOString()
      }, {
        onConflict: 'wallet_address'
      })
      .select()
      .single()

    if (error) throw error

    // Update cache
    const addr = walletAddress.toLowerCase()
    if (flags.isPhishing) KNOWN_PHISHING.add(addr)
    if (flags.isSniper) KNOWN_SNIPERS.add(addr)
    if (flags.isInsider) KNOWN_INSIDERS.add(addr)

    return data
  } catch (error) {
    console.error('Failed to flag wallet:', error)
    throw error
  }
}

/**
 * Run wallet detection for a token
 * This should be called after each trade or periodically
 */
export async function runWalletDetection(tokenAddress, creatorAddress, createdAt) {
  try {
    // Reload flags if needed
    await reloadWalletFlags()

    // Detect phishing wallets
    const phishing = await detectPhishing(tokenAddress)
    for (const phisher of phishing) {
      await flagWallet(phisher, {
        isPhishing: true,
        phishingReports: 1,
        notes: 'Holds tokens without buy transaction (received via transfer)'
      })
    }

    // Detect snipers
    const snipers = await detectSnipers(tokenAddress, createdAt)
    for (const sniper of snipers) {
      await flagWallet(sniper, {
        isSniper: true,
        sniperScore: 1
      })
    }

    // Detect insiders
    const insiders = await detectInsiders(tokenAddress, creatorAddress)
    for (const insider of insiders) {
      await flagWallet(insider, {
        isInsider: true,
        notes: 'Holds multiple tokens from same creator'
      })
    }

    return {
      phishingFound: phishing.length,
      snipersFound: snipers.length,
      insidersFound: insiders.length
    }
  } catch (error) {
    console.error('Failed to run wallet detection:', error)
    return {
      phishingFound: 0,
      snipersFound: 0,
      insidersFound: 0
    }
  }
}

/**
 * Get wallet flags from cache
 */
export function getWalletFlags() {
  return {
    phishing: Array.from(KNOWN_PHISHING),
    snipers: Array.from(KNOWN_SNIPERS),
    insiders: Array.from(KNOWN_INSIDERS)
  }
}

// Initialize by loading flags
reloadWalletFlags()
