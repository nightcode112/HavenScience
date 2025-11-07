/**
 * Blockchain Transfer Event Listener
 * Automatically detects and records token transfers to detect phishing wallets
 */

import { ethers } from 'ethers'
import { supabase } from './supabase.js'

// ERC20 Transfer event signature
const TRANSFER_EVENT_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)'
]

/**
 * Record a transfer in the database
 */
async function recordTransfer({ tokenAddress, fromAddress, toAddress, amount, txHash, blockNumber, timestamp }) {
  try {
    const { error } = await supabase
      .from('transfers')
      .insert({
        token_address: tokenAddress.toLowerCase(),
        from_address: fromAddress.toLowerCase(),
        to_address: toAddress.toLowerCase(),
        amount: amount.toString(),
        tx_hash: txHash,
        block_number: blockNumber,
        timestamp: timestamp || Date.now() / 1000
      })

    if (error) {
      console.error('Failed to record transfer:', error)
      return false
    }

    console.log(`✅ Recorded transfer: ${fromAddress} -> ${toAddress}: ${amount}`)
    return true
  } catch (error) {
    console.error('Error recording transfer:', error)
    return false
  }
}

/**
 * Start listening for Transfer events on a token contract
 */
export function listenForTransfers(provider, tokenAddress) {
  const contract = new ethers.Contract(
    tokenAddress,
    TRANSFER_EVENT_ABI,
    provider
  )

  console.log(`🎧 Listening for Transfer events on ${tokenAddress}...`)

  // Listen for Transfer events
  contract.on('Transfer', async (from, to, amount, event) => {
    console.log(`\n📦 Transfer detected:`)
    console.log(`   From: ${from}`)
    console.log(`   To: ${to}`)
    console.log(`   Amount: ${amount.toString()}`)

    // Get transaction details
    const block = await event.getBlock()

    // Record the transfer
    await recordTransfer({
      tokenAddress,
      fromAddress: from,
      toAddress: to,
      amount: amount.toString(),
      txHash: event.transactionHash,
      blockNumber: event.blockNumber,
      timestamp: block.timestamp
    })

    // Run phishing detection for this token
    try {
      const { runWalletDetection } = await import('./walletDetection.js')

      // Get token info
      const { data: token } = await supabase
        .from('robots')
        .select('wallet, created_at')
        .or(`contract.eq.${tokenAddress},bonding_contract.eq.${tokenAddress}`)
        .single()

      if (token) {
        console.log(`   🔍 Running wallet detection...`)
        await runWalletDetection(tokenAddress, token.wallet, token.created_at)
      }
    } catch (error) {
      console.warn('Failed to run wallet detection:', error)
    }
  })

  return contract
}

/**
 * Start listening for Transfer events on ALL token contracts
 */
export async function listenForAllTransfers(provider) {
  try {
    // Get all token contracts
    const { data: robots, error } = await supabase
      .from('robots')
      .select('bonding_contract, contract, name')

    if (error) throw error

    const listeners = []

    for (const robot of robots) {
      const tokenAddress = robot.bonding_contract || robot.contract

      if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
        continue
      }

      console.log(`\n🎧 Setting up listener for ${robot.name} (${tokenAddress})`)

      try {
        const contract = listenForTransfers(provider, tokenAddress)
        listeners.push({ token: robot.name, address: tokenAddress, contract })
      } catch (error) {
        console.error(`   ❌ Failed to set up listener: ${error.message}`)
      }
    }

    console.log(`\n✅ Listening for transfers on ${listeners.length} tokens`)

    return listeners
  } catch (error) {
    console.error('Failed to start transfer listeners:', error)
    return []
  }
}

/**
 * Stop all transfer listeners
 */
export function stopAllListeners(listeners) {
  for (const listener of listeners) {
    try {
      listener.contract.removeAllListeners('Transfer')
      console.log(`🛑 Stopped listener for ${listener.token}`)
    } catch (error) {
      console.error(`Failed to stop listener for ${listener.token}:`, error)
    }
  }
}

export default {
  recordTransfer,
  listenForTransfers,
  listenForAllTransfers,
  stopAllListeners
}
