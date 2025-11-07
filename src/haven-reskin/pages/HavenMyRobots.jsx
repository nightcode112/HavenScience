import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { readContract, simulateContract, writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { config as wagmiConfig } from '../../wagmi'
import TokenAbi from '../../contracts/abis/FullBondingCurveERC20XToken.json'
import { formatUnits, parseUnits } from 'viem'
import { CONTRACTS } from '../../utils/contracts'
import { getSimulation, getSimulationId, primeSimulations, clearWalletSimulations, setSimulation } from '../../utils/simulationCache'
import { mapSimulationsByDevice } from '../../utils/robotUtils'
import {
  Search,
  Sparkles,
  TrendingUp,
  Activity,
  Zap,
  Heart,
  DollarSign,
  ChevronDown,
  X as XIcon,
  Loader2,
  Bot,
  Wallet,
  Target
} from 'lucide-react'

// Haven color theme
const HAVEN_COLORS = {
  primary: '#5854f4',
  primaryHover: '#4c46e8',
  primaryLight: '#7c7cf6',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  background: '#0f1419',
  surface: '#1a1f2e',
  elevated: '#252d3f',
  border: '#374151',
  textPrimary: '#ffffff',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280'
}

// Convert IPFS URLs to HTTP gateway URLs
const convertIpfsUrl = (url) => {
  if (!url) return url
  if (url.startsWith('ipfs://')) {
    const hash = url.replace('ipfs://', '')
    return `https://gateway.pinata.cloud/ipfs/${hash}`
  }
  return url
}

// Compact Robot Card Component
function RobotCard({ robot, onClick, buyAmount, onBuy }) {
  const [stats, setStats] = useState({ progress: 0, marketCap: 0n, isGraduated: false })
  const [isExpanded, setIsExpanded] = useState(false)
  const [buying, setBuying] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadStats = async () => {
      const address = robot?.bonding_contract || robot?.contractAddress || robot?.contract || robot?.address
      if (!address || address === 'pending' || address === 'undefined') return
      try {
        const data = await readContract(wagmiConfig, {
          abi: TokenAbi,
          address: address,
          functionName: 'getTokenStats'
        })
        if (!cancelled) {
          setStats({
            progress: Number(data?.progressPercent || 0),
            marketCap: data?.marketCapXToken || 0n,
            isGraduated: data?.isGraduated || false
          })
        }
      } catch {}
    }
    loadStats()
    return () => { cancelled = true }
  }, [robot?.bonding_contract, robot?.contractAddress, robot?.contract, robot?.address])

  const formatCompact = (val) => {
    const n = Number(formatUnits(val || 0n, 18))
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`
    return `$${n.toFixed(0)}`
  }

  const handleBuyClick = async (e) => {
    e.stopPropagation()
    if (buying || !onBuy) return
    setBuying(true)
    try {
      await onBuy(robot)
    } finally {
      setBuying(false)
    }
  }

  const toggleExpand = (e) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  return (
    <div
      className="group rounded-2xl transition-all duration-300 hover:scale-[1.02] cursor-pointer overflow-hidden"
      style={{
        backgroundColor: HAVEN_COLORS.surface,
        border: `2px solid ${HAVEN_COLORS.border}`,
        boxShadow: isExpanded ? `0 0 30px ${HAVEN_COLORS.primary}40` : 'none'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = HAVEN_COLORS.primary
        e.currentTarget.style.boxShadow = `0 0 20px ${HAVEN_COLORS.primary}30`
      }}
      onMouseLeave={(e) => {
        if (!isExpanded) {
          e.currentTarget.style.borderColor = HAVEN_COLORS.border
          e.currentTarget.style.boxShadow = 'none'
        }
      }}
    >
      {/* Compact Header - Always visible */}
      <div
        className="p-4 flex items-center gap-4"
        onClick={toggleExpand}
      >
        {/* Robot Image */}
        <div className="relative flex-shrink-0">
          <img
            src={convertIpfsUrl(robot.image)}
            alt={robot.name}
            className="w-16 h-16 rounded-xl object-cover transition-transform duration-300 group-hover:scale-110"
            style={{
              border: `2px solid ${HAVEN_COLORS.primary}`,
              boxShadow: `0 0 15px ${HAVEN_COLORS.primary}50`,
              backgroundColor: HAVEN_COLORS.elevated
            }}
            onError={(e) => {
              console.log('[RobotCard] Image failed to load:', robot.image)
              e.target.style.display = 'none'
            }}
          />
          {stats.isGraduated && (
            <div className="absolute -top-1 -right-1 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full p-1 animate-pulse">
              <Sparkles size={12} className="text-white" />
            </div>
          )}
        </div>

        {/* Robot Info */}
        <div className="flex-1 min-w-0 max-w-full">
          <div className="flex items-start gap-2 mb-1 flex-wrap">
            <h3 className="font-bold text-base text-white break-words" style={{ maxWidth: '100%' }}>
              {robot.name}
            </h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{
                    backgroundColor: `${HAVEN_COLORS.primary}20`,
                    color: HAVEN_COLORS.primary
                  }}>
              {robot.symbol || robot.ticker || 'TKN'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {/* Status */}
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full animate-pulse`}
                   style={{backgroundColor: robot.status === 'running' ? HAVEN_COLORS.success : HAVEN_COLORS.warning}}
              />
              <span style={{color: HAVEN_COLORS.textSecondary}}>
                {robot.status === 'running' ? 'Active' : 'Idle'}
              </span>
            </div>

            {/* Market Cap */}
            <div className="flex items-center gap-1">
              <TrendingUp size={12} style={{color: HAVEN_COLORS.success}} />
              <span style={{color: HAVEN_COLORS.textSecondary}} className="font-semibold">
                {formatCompact(stats.marketCap)}
              </span>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-1">
              <Target size={12} style={{color: HAVEN_COLORS.primary}} />
              <span style={{color: HAVEN_COLORS.textSecondary}} className="font-semibold">
                {stats.progress.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Buy Button */}
          <button
            onClick={handleBuyClick}
            disabled={buying}
            className="px-3 py-2 rounded-xl font-bold text-xs transition-all duration-200 hover:scale-110 flex items-center gap-1.5"
            style={{
              background: `linear-gradient(135deg, ${HAVEN_COLORS.success}, ${HAVEN_COLORS.success}dd)`,
              color: 'white',
              boxShadow: `0 4px 15px ${HAVEN_COLORS.success}40`
            }}
          >
            {buying ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <>
                <DollarSign size={14} />
                <span>{buyAmount}</span>
              </>
            )}
          </button>

          {/* Expand Arrow */}
          <button
            onClick={toggleExpand}
            className="p-2 rounded-xl transition-all duration-300 hover:scale-110"
            style={{
              backgroundColor: `${HAVEN_COLORS.primary}15`,
              color: HAVEN_COLORS.primary
            }}
          >
            <ChevronDown
              size={16}
              className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Expanded Details - Slides down */}
      {isExpanded && (
        <div
          className="px-3 pb-3 space-y-2 animate-in slide-in-from-top duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span style={{color: HAVEN_COLORS.textSecondary}}>Bonding Curve</span>
              <span style={{color: HAVEN_COLORS.primary}} className="font-bold">
                {stats.isGraduated ? '🎓 Graduated' : `${stats.progress.toFixed(2)}%`}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden"
                 style={{backgroundColor: HAVEN_COLORS.elevated}}>
              <div
                className="h-full transition-all duration-500 rounded-full"
                style={{
                  width: `${Math.min(100, stats.progress)}%`,
                  background: `linear-gradient(90deg, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`,
                  boxShadow: `0 0 10px ${HAVEN_COLORS.primary}60`
                }}
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg" style={{backgroundColor: HAVEN_COLORS.elevated}}>
              <div className="flex items-center gap-1 mb-1">
                <Activity size={12} style={{color: HAVEN_COLORS.warning}} />
                <span style={{color: HAVEN_COLORS.textSecondary}}>Battery</span>
              </div>
              <span className="font-bold" style={{color: HAVEN_COLORS.textPrimary}}>
                {robot.battery || 0}%
              </span>
            </div>

            <div className="p-2 rounded-lg" style={{backgroundColor: HAVEN_COLORS.elevated}}>
              <div className="flex items-center gap-1 mb-1">
                <Zap size={12} style={{color: HAVEN_COLORS.primary}} />
                <span style={{color: HAVEN_COLORS.textSecondary}}>Position</span>
              </div>
              <span className="font-bold" style={{color: HAVEN_COLORS.textPrimary}}>
                X:{robot.position?.x || 0} Y:{robot.position?.y || 0}
              </span>
            </div>
          </div>

          {/* View Details Button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClick?.(robot)
            }}
            className="w-full py-2 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: `linear-gradient(135deg, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`,
              color: 'white',
              boxShadow: `0 4px 15px ${HAVEN_COLORS.primary}40`
            }}
          >
            View Full Details
          </button>
        </div>
      )}
    </div>
  )
}

export default function HavenMyRobots() {
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [buyAmount, setBuyAmount] = useState(100)
  const [showBuyConfig, setShowBuyConfig] = useState(false)
  const [sortBy, setSortBy] = useState('recent')
  const [robots, setRobots] = useState([])
  const [loading, setLoading] = useState(true)
  const previousWalletRef = useRef(null)

  // Clear simulation cache when wallet changes
  useEffect(() => {
    if (previousWalletRef.current && previousWalletRef.current !== address) {
      clearWalletSimulations(previousWalletRef.current)
    }
    previousWalletRef.current = address
  }, [address])

  // Load user's robots from API
  useEffect(() => {
    let cancelled = false
    const loadUserRobots = async () => {
      if (!isConnected || !address) {
        setRobots([])
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        // Import RobotApi
        const { RobotApi } = await import('../../utils/api')
        const response = await RobotApi.getUserRobots(address)

        if (!cancelled) {
          // Normalize the response to match our expected format
          const robotsList = Array.isArray(response) ? response : (response?.robots || [])
          setRobots(robotsList)
        }
      } catch (err) {
        console.error('Failed to load user robots:', err)
        if (!cancelled) setRobots([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadUserRobots()
    return () => { cancelled = true }
  }, [address, isConnected])

  // Polling for user simulations every 20 seconds
  useEffect(() => {
    if (!isConnected || !address) return

    let mounted = true
    let intervalId = null

    const fetchUserSimulations = async () => {
      try {
        const { RobotApi } = await import('../../utils/api')
        const response = await RobotApi.getUserSimulations(address)
        const list = Array.isArray(response?.simulations) ? response.simulations : []
        if (!mounted) return
        primeSimulations(address, list)
        applyUserSimulations(list)
      } catch (error) {
        // Silently fail - simulations are optional
      }
    }

    // Initial fetch
    fetchUserSimulations()

    // Poll every 20 seconds
    intervalId = setInterval(fetchUserSimulations, 20000)

    return () => {
      mounted = false
      if (intervalId) clearInterval(intervalId)
    }
  }, [isConnected, address])

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

  const filteredRobots = useMemo(() => {
    let filtered = robots.filter(r => {
      const term = search.toLowerCase()
      const name = (r.name || '').toLowerCase()
      const symbol = (r.symbol || r.ticker || '').toLowerCase()
      return name.includes(term) || symbol.includes(term)
    })

    // Sort
    if (sortBy === 'recent') filtered.reverse()
    else if (sortBy === 'value') filtered.sort((a, b) => (b.token?.price || 0) - (a.token?.price || 0))

    return filtered
  }, [robots, search, sortBy])

  const handleBuy = async (robot) => {
    // Implement buy logic here
    console.log('Buy', robot, buyAmount)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{backgroundColor: HAVEN_COLORS.background}}>
        <div className="text-center space-y-4 animate-in fade-in duration-500">
          <Loader2 size={64} style={{color: HAVEN_COLORS.primary}} className="mx-auto animate-spin" />
          <h2 className="text-2xl font-bold text-white">Loading Your Robots</h2>
          <p style={{color: HAVEN_COLORS.textSecondary}}>
            Fetching your collection from the blockchain...
          </p>
        </div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{backgroundColor: HAVEN_COLORS.background}}>
        <div className="text-center space-y-4 animate-in fade-in duration-500">
          <Wallet size={64} style={{color: HAVEN_COLORS.primary}} className="mx-auto animate-bounce" />
          <h2 className="text-2xl font-bold text-white">Connect Your Wallet</h2>
          <p style={{color: HAVEN_COLORS.textSecondary}}>
            Connect your wallet to view your robot collection
          </p>
        </div>
      </div>
    )
  }

  if (robots.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{backgroundColor: HAVEN_COLORS.background}}>
        <div className="text-center space-y-4 animate-in fade-in duration-500">
          <Bot size={64} style={{color: HAVEN_COLORS.primary}} className="mx-auto" />
          <h2 className="text-2xl font-bold text-white">No Robots Yet</h2>
          <p style={{color: HAVEN_COLORS.textSecondary}}>
            Start building your collection from the Factory marketplace
          </p>
          <button
            onClick={() => navigate('/factory')}
            className="px-6 py-3 rounded-xl font-bold transition-all duration-200 hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`,
              color: 'white',
              boxShadow: `0 4px 20px ${HAVEN_COLORS.primary}50`
            }}
          >
            Explore Robots
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-white" style={{backgroundColor: HAVEN_COLORS.background}}>
      <div className="pt-1 pb-4">
        <div className="max-w-7xl mx-auto px-4">
          {/* Header */}
          <div className="mb-6 space-y-4">
            {/* Title & Actions Row */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl animate-pulse"
                     style={{
                       background: `linear-gradient(135deg, ${HAVEN_COLORS.primary}20, ${HAVEN_COLORS.primaryLight}20)`,
                       border: `2px solid ${HAVEN_COLORS.primary}40`
                     }}>
                  <Bot size={28} style={{color: HAVEN_COLORS.primary}} />
                </div>
                <div>
                  <h1 className="text-3xl font-black">My Robots</h1>
                  <p style={{color: HAVEN_COLORS.textSecondary}} className="text-sm">
                    {filteredRobots.length} robot{filteredRobots.length !== 1 ? 's' : ''} in your collection
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Search Toggle */}
                {!showSearch ? (
                  <button
                    onClick={() => {
                      setShowSearch(true)
                      setTimeout(() => document.getElementById('robots-search')?.focus(), 100)
                    }}
                    className="p-3 rounded-xl transition-all duration-300 hover:scale-110 animate-pulse hover:animate-none"
                    style={{
                      backgroundColor: `${HAVEN_COLORS.primary}15`,
                      border: `2px solid ${HAVEN_COLORS.primary}30`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.primary}25`
                      e.currentTarget.style.borderColor = HAVEN_COLORS.primary
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.primary}15`
                      e.currentTarget.style.borderColor = `${HAVEN_COLORS.primary}30`
                    }}
                  >
                    <Search size={18} style={{color: HAVEN_COLORS.primary}} />
                  </button>
                ) : (
                  <div className="relative animate-in slide-in-from-right duration-300">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                            style={{color: HAVEN_COLORS.primary}} />
                    <input
                      id="robots-search"
                      type="text"
                      placeholder="Search your robots..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10 pr-10 py-3 rounded-xl text-sm text-white focus:outline-none transition-all w-64"
                      style={{
                        backgroundColor: HAVEN_COLORS.elevated,
                        border: `2px solid ${HAVEN_COLORS.primary}`,
                        boxShadow: `0 0 20px ${HAVEN_COLORS.primary}40`
                      }}
                    />
                    <button
                      onClick={() => {
                        setShowSearch(false)
                        setSearch('')
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded-lg hover:bg-white/10"
                    >
                      <XIcon size={14} style={{color: HAVEN_COLORS.textSecondary}} />
                    </button>
                  </div>
                )}

                {/* Buy Config Toggle */}
                {!showBuyConfig ? (
                  <button
                    onClick={() => setShowBuyConfig(true)}
                    className="p-3 rounded-xl transition-all duration-300 hover:scale-110 animate-pulse hover:animate-none"
                    style={{
                      backgroundColor: `${HAVEN_COLORS.success}15`,
                      border: `2px solid ${HAVEN_COLORS.success}30`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.success}25`
                      e.currentTarget.style.borderColor = HAVEN_COLORS.success
                      e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = `${HAVEN_COLORS.success}15`
                      e.currentTarget.style.borderColor = `${HAVEN_COLORS.success}30`
                      e.currentTarget.style.transform = 'scale(1)'
                    }}
                  >
                    <DollarSign size={18} style={{color: HAVEN_COLORS.success}} />
                  </button>
                ) : (
                  <button
                    onClick={() => setShowBuyConfig(false)}
                    className="p-3 rounded-xl transition-all duration-300 hover:scale-110"
                    style={{
                      backgroundColor: `${HAVEN_COLORS.danger}15`,
                      border: `2px solid ${HAVEN_COLORS.danger}30`
                    }}
                  >
                    <XIcon size={18} style={{color: HAVEN_COLORS.danger}} />
                  </button>
                )}

                {/* Sort Dropdown */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-4 py-3 rounded-xl text-sm font-semibold focus:outline-none cursor-pointer transition-all"
                  style={{
                    backgroundColor: HAVEN_COLORS.surface,
                    border: `2px solid ${HAVEN_COLORS.border}`,
                    color: HAVEN_COLORS.textPrimary
                  }}
                >
                  <option value="recent">Recent</option>
                  <option value="value">By Value</option>
                  <option value="name">By Name</option>
                </select>
              </div>
            </div>

            {/* Buy Config Panel */}
            {showBuyConfig && (
              <div className="animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-3 p-4 rounded-2xl"
                     style={{
                       backgroundColor: `${HAVEN_COLORS.success}10`,
                       border: `2px solid ${HAVEN_COLORS.success}30`
                     }}>
                  <span className="text-sm font-semibold" style={{color: HAVEN_COLORS.success}}>
                    Quick Buy Amount:
                  </span>
                  <input
                    type="number"
                    step="10"
                    min="0"
                    value={buyAmount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val) && val >= 0) setBuyAmount(val)
                    }}
                    className="w-24 px-3 py-2 rounded-lg text-sm font-bold text-white text-center focus:outline-none"
                    style={{
                      backgroundColor: HAVEN_COLORS.elevated,
                      border: `2px solid ${HAVEN_COLORS.success}`,
                      boxShadow: `0 0 15px ${HAVEN_COLORS.success}30`
                    }}
                  />
                  <span className="text-sm font-semibold" style={{color: HAVEN_COLORS.success}}>HAVEN</span>
                  <div className="flex gap-2 flex-1">
                    {[10, 50, 100, 500].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setBuyAmount(amt)}
                        className="px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 hover:scale-105"
                        style={{
                          backgroundColor: buyAmount === amt ? HAVEN_COLORS.success : HAVEN_COLORS.elevated,
                          border: `2px solid ${buyAmount === amt ? HAVEN_COLORS.success : 'transparent'}`,
                          color: buyAmount === amt ? 'white' : HAVEN_COLORS.textSecondary
                        }}
                      >
                        {amt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Robots Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredRobots.map((robot) => (
              <RobotCard
                key={robot.id}
                robot={robot}
                onClick={() => {
                  const address = robot.bonding_contract || robot.contractAddress || robot.contract || robot.address
                  if (address && address !== 'pending' && address !== 'undefined') {
                    navigate(`/market/${address}`)
                  } else {
                    console.error('[MyRobots] Invalid robot address:', robot)
                  }
                }}
                buyAmount={buyAmount}
                onBuy={handleBuy}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
