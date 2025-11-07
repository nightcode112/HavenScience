import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTokenTabsStore } from '../../stores/token-tabs-store'
import { supabase } from '../../lib/supabase'

const HAVEN_COLORS = {
  primary: '#5854f4',
  primaryHover: '#4c46e8',
  surface: '#1a1f2e',
  elevated: '#252d3f',
  border: '#374151',
  textPrimary: '#ffffff',
  textSecondary: '#9ca3af',
  background: '#0f1419',
}

export const TokenTabBar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { tabs, activeTab, setActiveTab, closeTab } = useTokenTabsStore()
  const [priceChangesFromDB, setPriceChangesFromDB] = useState({})

  // Fetch token data from database for all open tabs
  useEffect(() => {
    const fetchTokenData = async () => {
      if (tabs.length === 0) return

      const addresses = tabs.map(t => t.address).filter(Boolean)
      if (addresses.length === 0) return

      try {
        // Fetch both robots and agents
        const [robotsResult, agentsResult] = await Promise.all([
          supabase
            .from('robots')
            .select('bonding_contract, price_change_24h, image, name, ticker')
            .not('bonding_contract', 'is', null),
          supabase
            .from('agents')
            .select('bonding_contract, image, name, ticker')
            .not('bonding_contract', 'is', null)
        ])

        const robotsData = robotsResult.data || []
        const agentsData = agentsResult.data || []
        const allData = [...robotsData, ...agentsData]

        // Create a map of lowercase addresses to their data
        const priceChangesMap = {}
        if (allData.length > 0) {
          // Create lookup set of lowercase addresses we're looking for
          const addressLookup = new Set(addresses.map(addr => addr.toLowerCase()))

          allData.forEach(row => {
            if (row.bonding_contract) {
              const lowerAddress = row.bonding_contract.toLowerCase()
              if (addressLookup.has(lowerAddress)) {
                priceChangesMap[lowerAddress] = row.price_change_24h || 0

                // Update tab image if it's an IPFS URL (only if different to avoid infinite loop)
                const currentTab = tabs.find(t => t.address.toLowerCase() === lowerAddress)
                if (currentTab && row.image && row.image.startsWith('ipfs://') && currentTab.image !== row.image.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')) {
                  const httpUrl = row.image.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')
                  useTokenTabsStore.getState().updateTab(lowerAddress, { image: httpUrl })
                }
              }
            }
          })
        }

        setPriceChangesFromDB(priceChangesMap)
      } catch (err) {
      }
    }

    fetchTokenData()
    const interval = setInterval(fetchTokenData, 5000) // Fetch every 5 seconds

    return () => clearInterval(interval)
  }, [tabs])

  // Don't show tab bar if no tabs are open
  if (tabs.length === 0) {
    return null
  }

  const handleTabClick = (address) => {
    setActiveTab(address)
    navigate(`/market/${address}`)
  }

  const handleCloseTab = (e, address) => {
    e.stopPropagation()
    closeTab(address)

    // If we're on the page of the tab we just closed, go back to factory
    const currentTokenAddress = location.pathname.split('/market/')[1]
    if (currentTokenAddress?.toLowerCase() === address.toLowerCase()) {
      navigate('/factory')
    }
  }

  return (
    <div
      className="sticky top-0 left-0 right-0 z-40"
      style={{
        backgroundColor: HAVEN_COLORS.background,
        borderBottom: `1px solid ${HAVEN_COLORS.border}`,
      }}
    >
      <div className="flex items-end px-2 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
        {tabs.map((tab, index) => {
          const isActive = activeTab?.toLowerCase() === tab.address.toLowerCase()

          return (
            <div
              key={tab.address}
              className="relative flex-shrink-0"
              style={{ marginLeft: index > 0 ? '-8px' : '0' }}
            >
              <button
                onClick={() => handleTabClick(tab.address)}
                className="group relative flex items-center gap-2 px-4 py-2 transition-all duration-200"
                style={{
                  backgroundColor: isActive ? HAVEN_COLORS.surface : HAVEN_COLORS.background,
                  color: isActive ? HAVEN_COLORS.textPrimary : HAVEN_COLORS.textSecondary,
                  borderTopLeftRadius: '8px',
                  borderTopRightRadius: '8px',
                  borderTop: isActive ? `2px solid ${HAVEN_COLORS.primary}` : `1px solid ${HAVEN_COLORS.border}`,
                  borderLeft: `1px solid ${HAVEN_COLORS.border}`,
                  borderRight: `1px solid ${HAVEN_COLORS.border}`,
                  borderBottom: isActive ? 'none' : `1px solid ${HAVEN_COLORS.border}`,
                  minWidth: '140px',
                  maxWidth: '200px',
                  height: '36px',
                  marginBottom: isActive ? '-1px' : '0',
                  clipPath: 'polygon(8px 0%, calc(100% - 8px) 0%, 100% 100%, 0% 100%)',
                  position: 'relative',
                  zIndex: isActive ? 10 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = HAVEN_COLORS.elevated
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = HAVEN_COLORS.background
                  }
                }}
              >
                {/* Token Image */}
                {tab.image && (
                  <img
                    src={tab.image}
                    alt={tab.name}
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                )}

                {/* Token Symbol */}
                <span className="text-[11px] font-medium flex-shrink-0">
                  {tab.ticker || tab.name}
                </span>

                {/* Price */}
                {tab.price !== undefined && (
                  <span className="text-[11px] text-gray-300 flex-shrink-0">
                    ${typeof tab.price === 'number' ? tab.price.toFixed(6) : '0.000000'}
                  </span>
                )}

                {/* 24h Change - ONLY from database */}
                {(() => {
                  const dbPriceChange = priceChangesFromDB[tab.address?.toLowerCase()]

                  // Only show if we have DB value
                  if (dbPriceChange === undefined) return null

                  return (
                    <span
                      className={`text-[11px] font-extrabold flex-shrink-0 ${
                        dbPriceChange >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {dbPriceChange >= 0 ? '+' : ''}{typeof dbPriceChange === 'number' ? dbPriceChange.toFixed(2) : '0.00'}%
                    </span>
                  )
                })()}

                {/* Close Button */}
                <div
                  onClick={(e) => handleCloseTab(e, tab.address)}
                  className="ml-1 p-0.5 rounded-full hover:bg-red-500/20 transition-colors flex-shrink-0 cursor-pointer"
                  style={{
                    color: HAVEN_COLORS.textSecondary,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ef4444'
                    e.currentTarget.style.backgroundColor = '#ef444420'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = HAVEN_COLORS.textSecondary
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <X size={14} />
                </div>
              </button>
            </div>
          )
        })}

        {/* Close All Button (appears when 2+ tabs) */}
        {tabs.length >= 2 && (
          <button
            onClick={() => {
              useTokenTabsStore.getState().closeAllTabs()
              navigate('/factory')
            }}
            className="ml-3 px-3 py-1.5 text-xs rounded-t-lg transition-all duration-200 flex-shrink-0 mb-0.5"
            style={{
              backgroundColor: HAVEN_COLORS.surface,
              border: `1px solid ${HAVEN_COLORS.border}`,
              borderBottom: 'none',
              color: HAVEN_COLORS.textSecondary,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#ef444420'
              e.currentTarget.style.borderColor = '#ef4444'
              e.currentTarget.style.color = '#ef4444'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = HAVEN_COLORS.surface
              e.currentTarget.style.borderColor = HAVEN_COLORS.border
              e.currentTarget.style.color = HAVEN_COLORS.textSecondary
            }}
          >
            Close All
          </button>
        )}
      </div>
    </div>
  )
}