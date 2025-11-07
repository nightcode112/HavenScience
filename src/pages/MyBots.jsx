import { useEffect, useMemo, useRef, useState } from 'react'
import { RobotGrid } from '../components/RobotGrid'
import { RobotTable } from '../components/RobotTable'
import { RobotModal } from '../components/RobotModal'
import { useToast } from '../components/Toast'
import { Search, Loader2 } from 'lucide-react'
import { RobotApi } from '../utils/api'
import { useAccount } from 'wagmi'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { normalizeRobots, mapSimulationsByDevice } from '../utils/robotUtils'
import { getSimulation, getSimulationId, primeSimulations, clearWalletSimulations, setSimulation } from '../utils/simulationCache'
import { readContract, simulateContract, writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { config as wagmiConfig } from '../wagmi'
import TokenAbi from '../contracts/abis/FullBondingCurveERC20XToken.json'
import { formatEther, formatUnits, parseUnits } from 'viem'
import { PageMeta } from '../components/PageMeta'
import { CONTRACTS } from '../utils/contracts'

const SLIPPAGE_BPS = 100n

const applySlippage = (value) => {
  if (typeof value !== 'bigint' || value <= 0n) return 0n
  const reduction = (value * SLIPPAGE_BPS) / 10000n
  const result = value - reduction
  return result > 0n ? result : 0n
}

const toBigIntSafe = (value) => {
  if (typeof value === 'bigint') return value
  try { return BigInt(value || 0) } catch { return 0n }
}

const formatUsdDisplay = (value) => {
  try {
    const amount = Number(formatUnits(value || 0n, 18))
    if (!Number.isFinite(amount)) return '$0.00'
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(2)}K`
    if (amount >= 1) return `$${amount.toFixed(2)}`
    if (amount === 0) return '$0.00'
    if (amount >= 0.01) return `$${amount.toFixed(2)}`
    return `$${amount.toFixed(4)}`
  } catch {
    return '$0.00'
  }
}

const formatTokenAmount = (value, decimals = 18) => {
  try {
    const amount = Number(formatUnits(value || 0n, decimals))
    if (!Number.isFinite(amount)) return '0'
    if (amount >= 1_000) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (amount >= 1) return amount.toFixed(2)
    if (amount >= 0.01) return amount.toFixed(4)
    return amount.toPrecision(3)
  } catch {
    return '0'
  }
}

export function MyBots() {
  const { addToast } = useToast()
  const [selectedRobotId, setSelectedRobotId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [view, setView] = useState(() => {
    if (typeof window === 'undefined') return 'grid'
    return localStorage.getItem('viewMode') || 'grid'
  })
  const [sortBy, setSortBy] = useState(() => {
    if (typeof window === 'undefined') return 'new'
    return localStorage.getItem('sortBy') || 'new'
  })
  const [quickBuyAmount, setQuickBuyAmount] = useState(100)
  const [quickBuyMode, setQuickBuyMode] = useState('xtoken')
  const [robots, setRobots] = useState(null)
  const { address, isConnected } = useAccount()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const [loading, setLoading] = useState(false)
  const simulationRequests = useRef(new Map())
  const onTradeCompleteRef = useRef(null)
  const previousWalletRef = useRef(null)

  const walletConnected = Boolean(isConnected && address)

  const selectedRobot = useMemo(() => {
    if (!robots || !selectedRobotId) return null
    return robots.find((robot) => robot.id === selectedRobotId) || null
  }, [robots, selectedRobotId])

  useEffect(() => {
    try { localStorage.setItem('viewMode', view) } catch (error) { void error }
  }, [view])

  useEffect(() => {
    try { localStorage.setItem('sortBy', sortBy) } catch (error) { void error }
  }, [sortBy])

  // Clear simulation cache when wallet changes
  useEffect(() => {
    if (previousWalletRef.current && previousWalletRef.current !== address) {
      clearWalletSimulations(previousWalletRef.current)
    }
    previousWalletRef.current = address
  }, [address])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!walletConnected) {
        setRobots([])
        return
      }

      try {
        setLoading(true)
        const [robotsResponse, simulationsResponse] = await Promise.all([
          RobotApi.getUserRobots(address),
          RobotApi.getUserSimulations(address),
        ])
        if (!mounted) return
        const simulationsList = Array.isArray(simulationsResponse?.simulations)
          ? simulationsResponse.simulations
          : []
        primeSimulations(address, simulationsList)
        const simulationMap = mapSimulationsByDevice(simulationsList)
        const normalized = normalizeRobots(robotsResponse, { wallet: address, userSimulationMap: simulationMap })
          .map(r => ({
            ...r,
            // If backend embeds simulations, prefer its active id
            activeSimulationId: r.activeSimulationId || (r.simulations?.[0]?.simulation_id ?? null),
          }))
        setRobots(normalized)
      } catch {
        if (!mounted) return
        setRobots([])
        addToast('Failed to load your robots', 'error')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [address, walletConnected])

  // Polling for user simulations every 20 seconds
  useEffect(() => {
    if (!walletConnected) return
    
    let mounted = true
    let intervalId = null

    const fetchUserSimulations = async () => {
      try {
        const response = await RobotApi.getUserSimulations(address)
        const list = Array.isArray(response?.simulations) ? response.simulations : []
        if (!mounted) return
        primeSimulations(address, list)
        applyUserSimulations(list)
      } catch (error) {
        // Silently fail - simulations are loaded on initial mount
      }
    }

    // Don't fetch immediately on mount (already done above), wait for first interval
    intervalId = setInterval(fetchUserSimulations, 20000)

    return () => {
      mounted = false
      if (intervalId) clearInterval(intervalId)
    }
  }, [walletConnected, address])

  const applyUserSimulations = (simulationsList) => {
    if (!Array.isArray(simulationsList) || simulationsList.length === 0) return
    const simulationMap = mapSimulationsByDevice(simulationsList)
    setRobots((prev) => {
      if (!prev) return prev
      return prev.map((robot) => {
        const deviceNode = robot.device_node || robot.id
        const match = simulationMap.get(deviceNode)
        if (!match) return robot
        return {
          ...robot,
          ownedSimulation: match,
          activeSimulationId: match.simulation_id || robot.activeSimulationId || null,
          status: match.status || robot.status,
        }
      })
    })
  }

  const updateRobotData = (deviceNode, updater) => {
    setRobots((prev) => {
      if (!prev) return prev
      return prev.map((robot) => {
        const targetId = robot.device_node || robot.id
        if (targetId !== deviceNode) return robot
        const updated = typeof updater === 'function' ? updater(robot) : { ...robot, ...updater }
        return updated
      })
    })
  }

  const syncUserSimulations = async () => {
    if (!walletConnected) return []
    const response = await RobotApi.getUserSimulations(address)
    const list = Array.isArray(response?.simulations) ? response.simulations : []
    primeSimulations(address, list)
    applyUserSimulations(list)
    return list
  }

  const ensureSimulation = async (robot) => {
    if (!walletConnected) throw new Error('Wallet not connected')
    const deviceNode = robot?.device_node || robot?.id
    if (!deviceNode) throw new Error('Robot identifier not found')

    const cached = getSimulationId(address, deviceNode)
    if (cached) {
      const cachedSimulation = getSimulation(address, deviceNode)
      if (cachedSimulation) {
        updateRobotData(deviceNode, (prev) => ({
          ...prev,
          ownedSimulation: cachedSimulation,
          activeSimulationId: cachedSimulation.simulation_id || prev.activeSimulationId || null,
          status: cachedSimulation.status || prev.status,
        }))
      }
      return cached
    }

    const key = `${address.toLowerCase()}:${deviceNode}`
    if (simulationRequests.current.has(key)) {
      return simulationRequests.current.get(key)
    }

    const request = (async () => {
      let simulations = []
      try {
        simulations = await syncUserSimulations()
      } catch {
        simulations = []
      }
      let match = simulations.find((sim) => sim.device_node === deviceNode)
      if (match?.simulation_id) return match.simulation_id

      const loadResult = await RobotApi.loadSimulation('sim', { device_node: deviceNode, wallet: address })
      
      // Use loadSimulation response directly if it has simulation_id
      if (loadResult?.simulation_id) {
        const merged = { 
          device_node: deviceNode, 
          simulation_id: loadResult.simulation_id,
          status: loadResult.status || {},
          ...loadResult
        }
        setSimulation(address, deviceNode, merged)
        updateRobotData(deviceNode, (prev) => ({
          ...prev,
          ownedSimulation: merged,
          activeSimulationId: merged.simulation_id,
        }))
        return loadResult.simulation_id
      }
      
      // Fallback: sync and search
      simulations = await syncUserSimulations()
      match = simulations.find((sim) => sim.device_node === deviceNode)
      if (match?.simulation_id) return match.simulation_id
      throw new Error('Unable to create a simulation for this robot')
    })()
      .finally(() => {
        simulationRequests.current.delete(key)
      })

    simulationRequests.current.set(key, request)
    return request
  }

  const executeTrade = async (robot, amount, type) => {
    // eslint-disable-next-line no-console
    console.log('[MyBots.executeTrade] received', { amount, type })
    const numericAmount = (typeof amount === 'string') ? parseFloat(String(amount).replace(',', '.')) : Number(amount)
    // eslint-disable-next-line no-console
    console.log('[MyBots.executeTrade] parsed', { numericAmount })
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      addToast('Please enter a valid amount', 'warning')
      throw new Error('Invalid amount')
    }
    if (!walletConnected) {
      addToast('Connect your wallet to continue', 'warning')
      throw new Error('Wallet not connected')
    }

    const tokenLabel = robot?.ticker || robot?.token?.symbol || 'TKN'
    const tokenAddress = robot?.contractAddress
    if (!tokenAddress) {
      addToast('Missing token address for this robot', 'error')
      throw new Error('Missing token address')
    }

    try {
      let tokenDecimals = 18
      try {
        const decimals = await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddress, functionName: 'decimals' })
        const parsed = Number(decimals)
        if (Number.isFinite(parsed) && parsed > 0) tokenDecimals = parsed
      } catch {
        tokenDecimals = 18
      }

      if (type === 'buy') {
        const xTokenAmount = parseUnits(String(numericAmount), 18)
        if (xTokenAmount <= 0n) {
          addToast('Amount too small to buy', 'warning')
          throw new Error('Buy amount too small')
        }
        const preview = await readContract(wagmiConfig, {
          abi: TokenAbi,
          address: tokenAddress,
          functionName: 'previewBuy',
          args: [xTokenAmount],
        })
        // previewBuy returns a struct/object, not an array
        const tokensOut = toBigIntSafe(preview?.tokensOut ?? (Array.isArray(preview) ? preview[0] : 0n))
        if (tokensOut <= 0n) {
          addToast('Quote unavailable for this amount', 'error')
          throw new Error('Invalid preview response')
        }
        const minTokensOut = applySlippage(tokensOut)
        if (minTokensOut <= 0n) {
          addToast('Amount too small after slippage', 'warning')
          throw new Error('Amount too small after slippage')
        }
        // Ensure XTOKEN allowance for the token contract
        const currentAllowance = await readContract(wagmiConfig, {
          abi: [
            { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
            { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
          ],
          address: CONTRACTS.xtoken.address,
          functionName: 'allowance',
          args: [address, tokenAddress],
        }).catch(() => 0n)
        if (currentAllowance < xTokenAmount) {
          addToast('Approve XTOKEN in your wallet…', 'info')
          const simApprove = await simulateContract(wagmiConfig, {
            abi: [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
            address: CONTRACTS.xtoken.address,
            functionName: 'approve',
            args: [tokenAddress, (2n ** 256n) - 1n],
          })
        const approveHash = await writeContract(wagmiConfig, simApprove.request)
        addToast('Approval sent. Waiting for confirmation…', 'info', 15000)
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash })
        addToast('XTOKEN approved.', 'success')
        }
        addToast('Confirm buy in your wallet…', 'info')
        const sim = await simulateContract(wagmiConfig, {
          abi: TokenAbi,
          address: tokenAddress,
          functionName: 'buy',
          args: [xTokenAmount, minTokensOut],
        })
        const hash = await writeContract(wagmiConfig, sim.request)
        addToast('Transaction sent. Waiting for confirmation…', 'info', 15000)
        await waitForTransactionReceipt(wagmiConfig, { hash })
      try { window.dispatchEvent(new Event('haven:refresh-balance')) } catch {}
        // Notify parent to refresh stats
        if (onTradeCompleteRef.current && tokenAddress) {
          onTradeCompleteRef.current(tokenAddress)
        }
        const tokenAmountLabel = formatTokenAmount(tokensOut, tokenDecimals)
        addToast(`Bought ~${tokenAmountLabel} ${tokenLabel}`, 'success')
        return null
      }

      // SELL: amount is token amount (human units). Convert and sell directly.
      addToast('Preparing sell…', 'info', 3000)
      const owner = address
      const tokenAmount = parseUnits(String(amount), tokenDecimals)
      if (tokenAmount <= 0n) {
        addToast('Amount too small for sell', 'warning')
        throw new Error('Sell amount too small')
      }

      const preview = await readContract(wagmiConfig, {
        abi: TokenAbi,
        address: tokenAddress,
        functionName: 'previewSell',
        args: [tokenAmount],
      })
      // previewSell returns a struct/object, not an array
      const xTokenOut = toBigIntSafe(preview?.xTokenOut ?? (Array.isArray(preview) ? preview[0] : 0n))
      const minXTokenOut = applySlippage(xTokenOut)

      // Ensure allowance for token contract to pull tokens
      const currentAllowance = await readContract(wagmiConfig, { abi: TokenAbi, address: tokenAddress, functionName: 'allowance', args: [owner, tokenAddress] })
      if (currentAllowance < tokenAmount) {
        addToast('Approve tokens in your wallet…', 'info')
        const maxUint = (2n ** 256n) - 1n
        const simApprove = await simulateContract(wagmiConfig, {
          abi: TokenAbi,
          address: tokenAddress,
          functionName: 'approve',
          args: [tokenAddress, maxUint],
        })
        const approveHash = await writeContract(wagmiConfig, simApprove.request)
        addToast('Approval sent. Waiting for confirmation…', 'info', 15000)
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash })
        addToast('Token approved.', 'success')
      }

      if (xTokenOut > 0n) {
        addToast(`You will receive ~${Number(formatUnits(xTokenOut, 18)).toFixed(4)} HAVEN`, 'info', 4000)
      }

      addToast('Confirm sell in your wallet…', 'info')
      const simSell = await simulateContract(wagmiConfig, {
        abi: TokenAbi,
        address: tokenAddress,
        functionName: 'sell',
        args: [tokenAmount, minXTokenOut],
      })
      const sellHash = await writeContract(wagmiConfig, simSell.request)
      addToast('Transaction sent. Waiting for confirmation…', 'info', 15000)
      await waitForTransactionReceipt(wagmiConfig, { hash: sellHash })
      try { window.dispatchEvent(new Event('haven:refresh-balance')) } catch {}
      addToast(`Sold ${amount} ${tokenLabel} for ~${Number(formatUnits(xTokenOut, 18)).toFixed(4)} HAVEN`, 'success')
      // Notify parent to refresh stats
      if (onTradeCompleteRef.current && tokenAddress) {
        onTradeCompleteRef.current(tokenAddress)
      }
      return null
    } catch (err) {
      const msg = String(err?.shortMessage || err?.message || '')
      if (msg.includes('Not enough ETH in reserve')) {
        addToast('Not enough ETH in reserve for this sell amount', 'error')
      } else {
        addToast(msg || 'Transaction failed', 'error')
      }
      throw err
    }
  }

  const handleQuickBuy = async (robot, amount) => {
    try {
      // Convert string to number
      const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        addToast('Please enter a valid amount', 'warning')
        return
      }

      // Convert amount based on mode
      let finalAmount = numericAmount
      if (quickBuyMode === 'eth') {
        // Convert ETH to USD using Factory.ethToUSD
        const ethAmount = parseUnits(String(numericAmount), 18)
        try {
          const usdAmount = await readContract(wagmiConfig, {
            abi: CONTRACTS.factory.abi,
            address: CONTRACTS.factory.address,
            functionName: 'ethToUSD',
            args: [ethAmount],
          })
          finalAmount = Number(formatUnits(usdAmount, 18))
        } catch {
          addToast('Failed to convert ETH to USD', 'error')
          return
        }
      }
      await executeTrade(robot, finalAmount, 'buy')
    } catch (err) {
      // Error already handled in executeTrade
    }
  }

  const handleRobotSelect = (robot) => {
    setSelectedRobotId(robot?.id || null)
    setIsModalOpen(true)
    const addr = robot?.contractAddress
    if (addr) navigate(`/robots/${addr}${location.search}`, { replace: false, state: { background: location } })
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedRobotId(null)
    if (params?.address) {
      if (location.state && location.state.background) {
        navigate(-1)
      } else {
        navigate(`/robots${location.search}`, { replace: true })
      }
    }
  }

  // Deep-link: open modal if /robots/:address
  useEffect(() => {
    const target = params?.address?.toLowerCase()
    if (!target || !Array.isArray(robots)) return
    const match = robots.find(r => String(r.contractAddress||'').toLowerCase() === target)
    if (match) {
      setSelectedRobotId(match.id)
      setIsModalOpen(true)
    }
  }, [params?.address, robots])

  if (loading) {
    return (
      <>
        <PageMeta 
          title="My Robots - HAVEN"
          description="Manage your digital twin robot collection on HAVEN. View, trade, and control your robots in real-time simulations."
          url="https://haven-base.vercel.app/robots"
        />
        <div className="space-y-6 md:space-y-8 pb-24 md:pb-0">
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        </div>
      </>
    )
  }

  if (Array.isArray(robots) && robots.length === 0) {
    return (
      <>
        <PageMeta 
          title="My Robots - HAVEN"
          description="Manage your digital twin robot collection on HAVEN. View, trade, and control your robots in real-time simulations."
          url="https://haven-base.vercel.app/robots"
        />
        <div className="space-y-6 md:space-y-8 pb-24 md:pb-0">
          <div className="text-center py-12">
            <div className="text-slate-500 mb-4">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            </div>
            <h3 className="text-lg font-medium text-slate-400 mb-2">No robots in your collection</h3>
            <p className="text-sm text-slate-500">Start by creating or buying robots from the marketplace</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageMeta 
        title="My Robots - HAVEN"
        description="Manage your digital twin robot collection on HAVEN. View, trade, and control your robots in real-time simulations."
        url="https://haven-base.vercel.app/robots"
      />
      <div className="space-y-6 md:space-y-8 pb-24 md:pb-0">
      <div>
        {view === 'grid' ? (
          <RobotGrid
            selectedRobot={selectedRobot}
            onRobotSelect={handleRobotSelect}
            quickBuyAmount={quickBuyAmount}
            onQuickBuyAmountChange={setQuickBuyAmount}
            view={view}
            onViewChange={setView}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            robots={robots}
            onQuickBuy={handleQuickBuy}
            isWalletConnected={walletConnected}
            onTradeComplete={(callback) => {
              onTradeCompleteRef.current = callback
            }}
            quickBuyMode={quickBuyMode}
            onQuickBuyModeChange={setQuickBuyMode}
          />
        ) : (
          <RobotTable
            selectedRobot={selectedRobot}
            onRobotSelect={handleRobotSelect}
            quickBuyAmount={quickBuyAmount}
            onQuickBuyAmountChange={setQuickBuyAmount}
            view={view}
            onViewChange={setView}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            robots={robots}
            onQuickBuy={handleQuickBuy}
            isWalletConnected={walletConnected}
            onTradeComplete={(callback) => {
              onTradeCompleteRef.current = callback
            }}
            quickBuyMode={quickBuyMode}
            onQuickBuyModeChange={setQuickBuyMode}
          />
        )}
      </div>

      <RobotModal
        selectedRobot={selectedRobot}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        walletAddress={address || ''}
        isWalletConnected={walletConnected}
        onBuy={(robot, amount) => executeTrade(robot, amount, 'buy')}
        onSell={(robot, amount) => executeTrade(robot, amount, 'sell')}
        quickBuyAmount={quickBuyAmount}
        isOwnRobot={true}
        onRobotUpdate={(deviceNode, updater) => updateRobotData(deviceNode, updater)}
        onSyncSimulations={syncUserSimulations}
      />
    </div>
    </>
  )
}