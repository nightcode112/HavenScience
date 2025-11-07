import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { readContract } from '@wagmi/core'
import { config as wagmiConfig } from '../../wagmi'
import { CONTRACTS } from '../../utils/contracts'
import { formatUnits } from 'viem'
import {
  Search,
  Bell,
  Menu,
  X,
  TrendingUp,
  Zap,
  Wallet as WalletIcon,
  Bot,
  PlusCircle
} from 'lucide-react'
import SearchDropdown from './SearchDropdown'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
)

// Haven color theme
const HAVEN_COLORS = {
  primary: '#5854f4',
  primaryHover: '#4c46e8',
  primaryLight: '#7c7cf6',
  background: '#0f1419',
  surface: '#1a1f2e',
  elevated: '#252d3f',
  border: '#374151',
  textPrimary: '#ffffff',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280'
}

export default function HavenHeader() {
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { isConnected, address } = useAccount()
  const location = useLocation()
  const searchRef = useRef(null)
  const [xTokenBal, setXTokenBal] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const formatCompact = (txt) => {
    const n = Number(txt)
    if (!Number.isFinite(n)) return ''
    if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `${(n/1_000).toFixed(2)}k`
    return n.toFixed(2)
  }

  // Search tokens when user types - use same API as Factory/TokenDetail pages
  useEffect(() => {
    const searchTokens = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([])
        setIsSearching(false)
        return
      }

      setIsSearching(true)

      try {
        // Use RobotApi to get all robots (same as Factory page)
        const { RobotApi } = await import('../../utils/api')
        const { normalizeRobots } = await import('../../utils/robotUtils')

        const data = await RobotApi.getAllRobots(undefined)
        const normalized = normalizeRobots(data, {})

        // Filter by search query (case insensitive)
        const query = searchQuery.toLowerCase()
        const filtered = normalized.filter(robot => {
          const name = (robot.name || '').toLowerCase()
          const symbol = (robot.ticker || '').toLowerCase()
          const address = (robot.contractAddress || '').toLowerCase()
          return name.includes(query) || symbol.includes(query) || address.includes(query)
        }).slice(0, 50) // Limit to 50 results

        // Convert IPFS URLs
        const convertIpfsUrl = (url) => {
          if (!url) return url
          if (url.startsWith('ipfs://')) {
            return `https://ipfs.io/ipfs/${url.replace('ipfs://', '')}`
          }
          return url
        }

        // Transform to SearchDropdown format (SAME AS APP.JSX transformRobotToHavenFormat)
        const transformedData = filtered.map(robot => {
          // For graduated tokens: calculate market cap as price * total_supply (like Factory does)
          const isGraduated = robot.is_graduated || robot.isGraduated || robot.graduated
          const marketCap = isGraduated && robot.total_supply
            ? (robot.price || 0) * robot.total_supply
            : (robot.market_cap || robot.fdv || 0)

          return {
            address: robot.contractAddress,
            name: robot.name,
            symbol: robot.ticker,
            imageUrl: convertIpfsUrl(robot.image),
            price: robot.price || robot.token?.price || 0,
            marketCap: marketCap,
            volume24h: robot.volume_24h || robot.volume24h || 0,
            priceChange24h: robot.price_change_24h || robot.change24h || 0,
            holders: robot.holders_count || 0,
            liquidity: robot.liquidity || 0,
            timestamp: robot.timestamp || robot.created_at,
            twitter: robot.twitter,
            telegram: robot.telegram,
            website: robot.website,
          }
        })

        setSearchResults(transformedData)
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setIsSearching(false)
      }
    }

    const timer = setTimeout(searchTokens, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch HAVEN balance
  useEffect(() => {
    let cancelled = false
    const erc20Abi = [
      { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
      { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
    ]

    const loadBalance = async () => {
      try {
        if (!isConnected || !address) {
          if (!cancelled) setXTokenBal('')
          return
        }

        const decimals = await readContract(wagmiConfig, {
          abi: erc20Abi,
          address: CONTRACTS.xtoken.address,
          functionName: 'decimals'
        }).catch(() => 18)

        const balance = await readContract(wagmiConfig, {
          abi: erc20Abi,
          address: CONTRACTS.xtoken.address,
          functionName: 'balanceOf',
          args: [address]
        }).catch(() => 0n)

        const dec = Number(decimals)
        const bal = BigInt(balance)
        const txt = formatUnits(bal, Number.isFinite(dec) ? dec : 18)
        if (!cancelled) setXTokenBal(txt)
      } catch {
        if (!cancelled) setXTokenBal('')
      }
    }

    loadBalance()

    const onRefresh = () => { loadBalance() }
    if (typeof window !== 'undefined') {
      window.addEventListener('haven:refresh-balance', onRefresh)
      window.addEventListener('focus', onRefresh)
    }
    return () => {
      cancelled = true
      if (typeof window !== 'undefined') {
        window.removeEventListener('haven:refresh-balance', onRefresh)
        window.removeEventListener('focus', onRefresh)
      }
    }
  }, [isConnected, address])

  const handleSearch = (e) => {
    e.preventDefault()
    const query = searchQuery.trim()
    if (!query) return

    // Check if it's an address (0x followed by 40 hex characters)
    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(query)

    if (isAddress) {
      window.location.href = `/market/${query}`
    } else {
      window.location.href = `/?search=${encodeURIComponent(query)}`
    }
    setSearchQuery('')
  }

  const navItems = [
    { href: '/', label: 'Discover', icon: TrendingUp },
    { href: '/factory', label: 'Factory', icon: Zap },
  ]

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm overflow-visible"
      style={{
        backgroundColor: `${HAVEN_COLORS.background}e6`,
        borderBottom: `1px solid ${HAVEN_COLORS.border}`
      }}
    >
      <nav className="w-full px-1 sm:px-2 lg:px-3 xl:px-4 2xl:px-6">
        <div className="flex items-center justify-between h-14 gap-2 lg:gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center group flex-shrink-0">
            <img
              src="/assets/havenTextLogo-Vibrant-Blue.png"
              alt="HAVEN"
              className="h-6 md:h-8 w-auto cursor-pointer hover:opacity-80 transition-opacity"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.href
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`relative group flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 border`}
                  style={{
                    color: isActive ? HAVEN_COLORS.textPrimary : HAVEN_COLORS.textSecondary,
                    backgroundColor: isActive ? HAVEN_COLORS.elevated : HAVEN_COLORS.surface,
                    borderColor: isActive ? `${HAVEN_COLORS.primary}33` : 'transparent'
                  }}
                >
                  <Icon
                    size={18}
                    className="group-hover:scale-110 transition-transform duration-300"
                    style={{color: isActive ? HAVEN_COLORS.primary : undefined}}
                  />
                  <span className="text-sm font-bold">{item.label}</span>
                </a>
              )
            })}
          </div>

          {/* Center Search Bar - Always Visible */}
          <div className="flex flex-1 max-w-3xl mx-1 sm:mx-2 lg:mx-4 xl:mx-6 relative z-[60]" ref={searchRef}>
            <form onSubmit={handleSearch} className="relative w-full">
              <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 z-10" />
              <input
                placeholder="Search robots, addresses, or paste contract address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 sm:h-9 text-xs sm:text-sm pl-8 sm:pl-10 pr-2 sm:pr-4 w-full font-medium shadow-lg hover:shadow-xl focus:shadow-2xl transition-all duration-300 rounded-lg focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: HAVEN_COLORS.surface,
                  border: `2px solid ${HAVEN_COLORS.border}`,
                  color: HAVEN_COLORS.textPrimary,
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = HAVEN_COLORS.primary
                  setShowDropdown(true)
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = HAVEN_COLORS.border
                }}
              />
              {showDropdown && (
                <SearchDropdown
                  tokens={searchResults}
                  loading={isSearching}
                  onSelectToken={(address) => {
                    navigate(`/market/${address}`)
                    setSearchQuery('')
                    setShowDropdown(false)
                  }}
                  searchQuery={searchQuery}
                  showHistory={searchQuery.length === 0}
                />
              )}
            </form>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-1 lg:gap-2 flex-shrink min-w-0 overflow-hidden max-w-[40vw] sm:max-w-none">
            {/* Social Links - Desktop Only */}
            <div className="hidden lg:flex items-center gap-2">
              <a
                href="https://x.com/HavenLabs_"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg transition-colors hover:bg-gray-800"
                title="X (Twitter)"
                style={{ color: HAVEN_COLORS.textSecondary }}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              <a
                href="https://docs.haven.science/"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg transition-colors hover:bg-gray-800"
                title="Documentation"
                style={{ color: HAVEN_COLORS.textSecondary }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </a>
              <a
                href="https://discord.com/invite/3bMDdEqf"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg transition-colors hover:bg-gray-800"
                title="Discord"
                style={{ color: HAVEN_COLORS.textSecondary }}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </a>
              <a
                href="https://t.me/haven_labs"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg transition-colors hover:bg-gray-800"
                title="Telegram"
                style={{ color: HAVEN_COLORS.textSecondary }}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </a>
            </div>

            {/* My Projects Button */}
            <button
              onClick={() => navigate('/portfolio')}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all duration-300"
              style={{
                backgroundColor: HAVEN_COLORS.surface,
                border: `1px solid ${HAVEN_COLORS.border}`,
                color: HAVEN_COLORS.textPrimary
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = HAVEN_COLORS.elevated
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = HAVEN_COLORS.surface
              }}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>My Projects</span>
            </button>

            {/* Create Intelligent Agent Button */}
            <button
              onClick={() => navigate('/create')}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all duration-300"
              style={{
                background: `linear-gradient(to right, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`,
                color: 'white'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `linear-gradient(to right, ${HAVEN_COLORS.primaryHover}, ${HAVEN_COLORS.primary})`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `linear-gradient(to right, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`
              }}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Create Intelligent Agent</span>
            </button>

            {/* Wallet Connect with Balance */}
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                authenticationStatus,
                mounted,
              }) => {
                const ready = mounted && authenticationStatus !== 'loading'
                const connected =
                  ready &&
                  account &&
                  chain &&
                  (!authenticationStatus || authenticationStatus === 'authenticated')

                return (
                  <div
                    {...(!ready && {
                      'aria-hidden': true,
                      style: {
                        opacity: 0,
                        pointerEvents: 'none',
                        userSelect: 'none',
                      },
                    })}
                  >
                    {(() => {
                      if (!connected) {
                        return (
                          <button
                            onClick={openConnectModal}
                            type="button"
                            className="px-4 py-2 text-sm font-bold rounded-xl transition-all duration-300"
                            style={{
                              background: `linear-gradient(to right, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`,
                              color: 'white'
                            }}
                          >
                            Connect Wallet
                          </button>
                        )
                      }

                      if (chain.unsupported) {
                        return (
                          <button
                            onClick={openChainModal}
                            type="button"
                            className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300"
                          >
                            Wrong network
                          </button>
                        )
                      }

                      const displayBalance = (xTokenBal && Number.isFinite(Number(xTokenBal)))
                        ? `${formatCompact(xTokenBal)}`
                        : ''

                      return (
                        <button
                          onClick={openAccountModal}
                          type="button"
                          className="px-2 py-1 lg:px-4 lg:py-2 text-[10px] lg:text-sm font-medium rounded-lg lg:rounded-xl transition-all duration-300 flex items-center gap-1 lg:gap-2"
                          style={{
                            background: `linear-gradient(to right, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryLight})`,
                            color: 'white'
                          }}
                        >
                          {displayBalance && <span className="text-[8px] lg:text-xs opacity-60">{displayBalance}</span>}
                          {displayBalance && <span className="opacity-20 text-[8px] lg:text-xs">|</span>}
                          <span className="text-[10px] lg:text-sm">{account.displayName}</span>
                        </button>
                      )
                    })()}
                  </div>
                )
              }}
            </ConnectButton.Custom>

            {/* Mobile Menu Toggle */}
            <button
              className="lg:hidden p-2 rounded-xl transition-all duration-300 flex-shrink-0"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              style={{
                backgroundColor: HAVEN_COLORS.surface,
                color: HAVEN_COLORS.textSecondary
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = HAVEN_COLORS.elevated
                e.currentTarget.style.color = HAVEN_COLORS.textPrimary
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = HAVEN_COLORS.surface
                e.currentTarget.style.color = HAVEN_COLORS.textSecondary
              }}
            >
              {isMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div
            className="lg:hidden py-4"
            style={{borderTop: `1px solid ${HAVEN_COLORS.border}`}}
          >
            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.href
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 transition-all duration-300 rounded-2xl mx-2`}
                    style={{
                      color: isActive ? HAVEN_COLORS.textPrimary : HAVEN_COLORS.textSecondary,
                      backgroundColor: isActive ? HAVEN_COLORS.elevated : 'transparent'
                    }}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Icon
                      size={16}
                      style={{color: isActive ? HAVEN_COLORS.primary : undefined}}
                    />
                    <span className="text-sm font-medium">{item.label}</span>
                  </a>
                )
              })}

              {/* My Projects Mobile */}
              <button
                onClick={() => {
                  navigate('/portfolio')
                  setIsMenuOpen(false)
                }}
                className="flex items-center gap-3 px-4 py-3 transition-all duration-300 rounded-2xl mx-2"
                style={{
                  color: location.pathname === '/portfolio' ? HAVEN_COLORS.textPrimary : HAVEN_COLORS.textSecondary,
                  backgroundColor: location.pathname === '/portfolio' ? HAVEN_COLORS.elevated : 'transparent'
                }}
              >
                <Bot size={16} style={{color: location.pathname === '/portfolio' ? HAVEN_COLORS.primary : undefined}} />
                <span className="text-sm font-medium">My Projects</span>
              </button>

              {/* Create Intelligent Agent Mobile */}
              <button
                onClick={() => {
                  navigate('/create')
                  setIsMenuOpen(false)
                }}
                className="flex items-center gap-3 px-4 py-3 transition-all duration-300 rounded-2xl mx-2"
                style={{
                  color: location.pathname === '/create' ? HAVEN_COLORS.textPrimary : HAVEN_COLORS.textSecondary,
                  backgroundColor: location.pathname === '/create' ? HAVEN_COLORS.elevated : 'transparent'
                }}
              >
                <PlusCircle size={16} style={{color: location.pathname === '/create' ? HAVEN_COLORS.primary : undefined}} />
                <span className="text-sm font-medium">Create Intelligent Agent</span>
              </button>

              {/* Social Links - Mobile */}
              <div className="grid grid-cols-2 gap-3 px-2 pt-4 mt-4" style={{borderTop: `1px solid ${HAVEN_COLORS.border}`}}>
                <a
                  href="https://x.com/HavenLabs_"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors"
                  style={{
                    backgroundColor: HAVEN_COLORS.surface,
                    color: HAVEN_COLORS.textSecondary
                  }}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  <span className="text-sm font-medium">X</span>
                </a>
                <a
                  href="https://docs.haven.science/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors"
                  style={{
                    backgroundColor: HAVEN_COLORS.surface,
                    color: HAVEN_COLORS.textSecondary
                  }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span className="text-sm font-medium">Docs</span>
                </a>
                <a
                  href="https://discord.com/invite/3bMDdEqf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors"
                  style={{
                    backgroundColor: HAVEN_COLORS.surface,
                    color: HAVEN_COLORS.textSecondary
                  }}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  <span className="text-sm font-medium">Discord</span>
                </a>
                <a
                  href="https://t.me/haven_labs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors"
                  style={{
                    backgroundColor: HAVEN_COLORS.surface,
                    color: HAVEN_COLORS.textSecondary
                  }}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                  </svg>
                  <span className="text-sm font-medium">Telegram</span>
                </a>
              </div>

            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
