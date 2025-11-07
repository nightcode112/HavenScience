import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { readContracts } from '@wagmi/core'
import { config as wagmiConfig } from '../wagmi'
import { CONTRACTS } from '../utils/contracts'
import { useEffect, useState } from 'react'
import { formatUnits } from 'viem'
import { Bot, Sun, Moon, Menu, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useRobotStats } from '../context/RobotStatsContext'

export function Navbar() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const { robotStats } = useRobotStats()
  const { address, isConnected } = useAccount()
  const [xTokenBal, setXTokenBal] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const formatCompact = (txt) => {
    const n = Number(txt)
    if (!Number.isFinite(n)) return ''
    if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `${(n/1_000).toFixed(2)}k`
    return n.toFixed(2)
  }
  useEffect(() => {
    let cancelled = false
    const erc20Abi = [
      { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
      { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
    ]

    const loadBalance = async () => {
      try {
        if (!isConnected || !address) { if (!cancelled) setXTokenBal(''); return }
        const res = await readContracts(wagmiConfig, {
          contracts: [
            { abi: erc20Abi, address: CONTRACTS.xtoken.address, functionName: 'decimals' },
            { abi: erc20Abi, address: CONTRACTS.xtoken.address, functionName: 'balanceOf', args: [address] },
          ]
        }).catch(() => null)
        const dec = Number(res?.[0]?.result ?? 18)
        const bal = BigInt(res?.[1]?.result ?? 0n)
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
      document.addEventListener('visibilitychange', onRefresh)
    }
    return () => {
      cancelled = true
      if (typeof window !== 'undefined') {
        window.removeEventListener('haven:refresh-balance', onRefresh)
        window.removeEventListener('focus', onRefresh)
        document.removeEventListener('visibilitychange', onRefresh)
      }
    }
  }, [isConnected, address])

  return (
    <nav
      className={`sticky top-0 z-50 w-full backdrop-blur-sm shadow-sm border-b ${
        isDark ? 'bg-transparent border-gray-700' : 'bg-transparent border-gray-200'
      }`}
    >
      <div className="flex h-16 items-center justify-between px-4 md:px-6 max-w-none w-full">
        <div className="flex items-center space-x-2 flex-shrink-0">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <img
              src="/assets/havenTextLogo-Vibrant-Blue.png"
              alt="HAVEN"
              className="h-6 md:h-8 w-auto cursor-pointer"
            />
          </Link>
        </div>

        <div className="flex items-center space-x-3 md:space-x-4">
          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className={`rounded-full border px-2.5 py-2 transition-colors ${
              isDark
                ? 'border-slate-600 text-slate-300 hover:bg-slate-800/60'
                : 'border-gray-200 hover:bg-gray-100 text-gray-700'
            }`}
            title={isDark ? 'Switch to Day Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Stats */}
          <div className="hidden md:flex items-center space-x-6 text-sm">
            <div className={`flex items-center space-x-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              <Bot className={`h-4 w-4 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
              <span className="font-medium">{robotStats.total || 0} Robots</span>
            </div>

            <div className={`flex items-center space-x-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${isDark ? 'bg-green-400' : 'bg-green-500'}`}></div>
              <span className="font-medium">{robotStats.active || 0} Active</span>
            </div>
          </div>

          {/* Social Links - Desktop */}
          <div className="hidden md:flex items-center space-x-3">
            <a
              href="https://x.com/HavenLabs_"
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2 rounded-lg transition-colors ${
                isDark ? 'hover:bg-slate-800/60 text-slate-300' : 'hover:bg-gray-100 text-gray-700'
              }`}
              title="X (Twitter)"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <a
              href="https://docs.haven.science/"
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2 rounded-lg transition-colors ${
                isDark ? 'hover:bg-slate-800/60 text-slate-300' : 'hover:bg-gray-100 text-gray-700'
              }`}
              title="Documentation"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </a>
            <a
              href="https://discord.com/invite/3bMDdEqf"
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2 rounded-lg transition-colors ${
                isDark ? 'hover:bg-slate-800/60 text-slate-300' : 'hover:bg-gray-100 text-gray-700'
              }`}
              title="Discord"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </a>
            <a
              href="https://t.me/haven_labs"
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2 rounded-lg transition-colors ${
                isDark ? 'hover:bg-slate-800/60 text-slate-300' : 'hover:bg-gray-100 text-gray-700'
              }`}
              title="Telegram"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`md:hidden rounded-lg border px-2 py-1.5 transition-colors ${
              isDark
                ? 'border-slate-600 text-slate-300 hover:bg-slate-800/60'
                : 'border-gray-200 hover:bg-gray-100 text-gray-700'
            }`}
          >
            {mobileMenuOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
          </button>

          {/* RainbowKit Connect Button */}
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
                          className="bg-gradient-to-r from-[#5854f4] to-[#7c3aed] hover:from-[#4c46e8] hover:to-[#6d28d9] text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 rounded-full px-3 md:px-6 py-2 text-sm font-medium flex items-center space-x-2"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="hidden sm:inline">Connect Wallet</span>
                          <span className="sm:hidden">Connect</span>
                        </button>
                      )
                    }

                    if (chain.unsupported) {
                      return (
                        <button
                          onClick={openChainModal}
                          type="button"
                          className="bg-red-600 hover:bg-red-700 text-white rounded-full px-3 md:px-6 py-2 text-sm font-medium transition-all duration-300"
                        >
                          Wrong network
                        </button>
                      )
                    }

                    let displayBalance = (xTokenBal && Number.isFinite(Number(xTokenBal))) ? `${formatCompact(xTokenBal)} HAVEN` : ''

                    return (
                      <button
                        onClick={openAccountModal}
                        type="button"
                        className="bg-gradient-to-r from-[#5854f4] to-[#7c3aed] hover:from-[#4c46e8] hover:to-[#6d28d9] text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 rounded-full px-3 md:px-6 py-2 text-sm font-medium"
                      >
                        {account.displayName}
                        {displayBalance ? ` (${displayBalance})` : ''}
                      </button>
                    )
                  })()}
                </div>
              )
            }}
          </ConnectButton.Custom>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className={`md:hidden border-t ${isDark ? 'border-gray-700 bg-slate-900/95' : 'border-gray-200 bg-white/95'} backdrop-blur-sm`}>
          <div className="px-4 py-4 space-y-4">
            {/* Stats - Mobile */}
            <div className="flex items-center justify-around text-sm pb-4 border-b border-gray-700">
              <div className={`flex items-center space-x-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                <Bot className={`h-4 w-4 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
                <span className="font-medium">{robotStats.total || 0} Robots</span>
              </div>
              <div className={`flex items-center space-x-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                <div className={`w-2 h-2 rounded-full animate-pulse ${isDark ? 'bg-green-400' : 'bg-green-500'}`}></div>
                <span className="font-medium">{robotStats.active || 0} Active</span>
              </div>
            </div>

            {/* Social Links - Mobile */}
            <div className="grid grid-cols-2 gap-3">
              <a
                href="https://x.com/HavenLabs_"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-slate-800/60 text-slate-300' : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span className="text-sm font-medium">X (Twitter)</span>
              </a>
              <a
                href="https://docs.haven.science/"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-slate-800/60 text-slate-300' : 'hover:bg-gray-100 text-gray-700'
                }`}
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
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-slate-800/60 text-slate-300' : 'hover:bg-gray-100 text-gray-700'
                }`}
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
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-slate-800/60 text-slate-300' : 'hover:bg-gray-100 text-gray-700'
                }`}
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
  )
}
