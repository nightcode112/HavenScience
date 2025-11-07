import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Convert IPFS URLs to HTTP gateway URLs
 */
const convertIpfsUrl = (url) => {
  if (!url) return url
  if (url.startsWith('ipfs://')) {
    const hash = url.replace('ipfs://', '')
    return `https://gateway.pinata.cloud/ipfs/${hash}`
  }
  return url
}

/**
 * Token Tabs Store
 * Manages open token tabs across the application
 */
export const useTokenTabsStore = create(
  persist(
    (set, get) => ({
      // Array of open token tabs
      tabs: [],
      // Currently active tab address
      activeTab: null,

      /**
       * Hydrate stored tabs and fix any IPFS URLs
       */
      _hasHydrated: false,

      /**
       * Open a new token tab or switch to existing one
       */
      openTab: (tokenAddress, tokenData = null) => {
        const { tabs, activeTab } = get()

        // Normalize address to lowercase
        const normalizedAddress = tokenAddress.toLowerCase()

        // Check if tab already exists
        const existingTab = tabs.find(tab => tab.address.toLowerCase() === normalizedAddress)

        if (existingTab) {
          // Just activate the existing tab and update its data
          const updatedTabs = tabs.map(tab =>
            tab.address.toLowerCase() === normalizedAddress
              ? {
                  ...tab,
                  price: tokenData?.price ?? tab.price,
                  priceChange24h: tokenData?.priceChange24h ?? tokenData?.price_change_24h ?? tab.priceChange24h
                }
              : tab
          )
          set({ tabs: updatedTabs, activeTab: normalizedAddress })
        } else {
          // Create new tab
          const newTab = {
            address: normalizedAddress,
            name: tokenData?.name || tokenData?.ticker || tokenData?.symbol || 'Token',
            ticker: tokenData?.ticker || tokenData?.symbol || '???',
            image: convertIpfsUrl(tokenData?.image || tokenData?.imageUrl) || null,
            price: tokenData?.price || 0,
            priceChange24h: tokenData?.priceChange24h || tokenData?.price_change_24h || 0,
            openedAt: Date.now()
          }

          set({
            tabs: [...tabs, newTab],
            activeTab: normalizedAddress
          })
        }
      },

      /**
       * Close a token tab
       */
      closeTab: (tokenAddress) => {
        const { tabs, activeTab } = get()
        const normalizedAddress = tokenAddress.toLowerCase()

        const newTabs = tabs.filter(tab => tab.address.toLowerCase() !== normalizedAddress)

        // If closing the active tab, switch to another tab
        let newActiveTab = activeTab
        if (activeTab?.toLowerCase() === normalizedAddress) {
          if (newTabs.length > 0) {
            // Switch to the last opened tab
            newActiveTab = newTabs[newTabs.length - 1].address
          } else {
            newActiveTab = null
          }
        }

        set({ tabs: newTabs, activeTab: newActiveTab })
      },

      /**
       * Set the active tab
       */
      setActiveTab: (tokenAddress) => {
        const normalizedAddress = tokenAddress?.toLowerCase() || null
        set({ activeTab: normalizedAddress })
      },

      /**
       * Close all tabs
       */
      closeAllTabs: () => {
        set({ tabs: [], activeTab: null })
      },

      /**
       * Get tab by address
       */
      getTab: (tokenAddress) => {
        const { tabs } = get()
        const normalizedAddress = tokenAddress.toLowerCase()
        return tabs.find(tab => tab.address.toLowerCase() === normalizedAddress)
      },

      /**
       * Update tab data (e.g., when token metadata loads)
       */
      updateTab: (tokenAddress, updates) => {
        const { tabs } = get()
        const normalizedAddress = tokenAddress.toLowerCase()

        // Convert IPFS URLs in updates if present
        if (updates.image) {
          updates.image = convertIpfsUrl(updates.image)
        }

        const newTabs = tabs.map(tab =>
          tab.address.toLowerCase() === normalizedAddress
            ? { ...tab, ...updates }
            : tab
        )

        set({ tabs: newTabs })
      }
    }),
    {
      name: 'haven-token-tabs',
      // Only persist tabs, not activeTab (fresh start on reload)
      partialize: (state) => ({ tabs: state.tabs }),
      // Fix IPFS URLs when hydrating from storage
      onRehydrateStorage: () => (state) => {
        if (state && state.tabs) {
          // Convert any IPFS URLs in existing tabs
          state.tabs = state.tabs.map(tab => ({
            ...tab,
            image: convertIpfsUrl(tab.image)
          }))
        }
      }
    }
  )
)
