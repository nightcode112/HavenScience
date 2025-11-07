import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAccount } from 'wagmi'

const FAVORITES_KEY = 'favorites'

export function useFavorites() {
  const { address: userAddress } = useAccount()
  const [favorites, setFavorites] = useState(new Set())
  const [loading, setLoading] = useState(false)

  // Use ref to track current favorites for toggleFavorite
  const favoritesRef = useRef(new Set())

  // Sync ref with state
  useEffect(() => {
    favoritesRef.current = favorites
  }, [favorites])

  // Load favorites from localStorage initially
  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const stored = localStorage.getItem(FAVORITES_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        const favSet = new Set(parsed.map((addr) => addr.toLowerCase()))
        setFavorites(favSet)
        favoritesRef.current = favSet
      }
    } catch (e) {
      console.error('Failed to load favorites from localStorage:', e)
    }
  }, [])

  // Load favorites from DB when user connects
  useEffect(() => {
    const loadFavoritesFromDB = async () => {
      if (!userAddress) {
        // User disconnected, use localStorage only
        return
      }

      setLoading(true)
      try {
        const response = await fetch(`/api/users/favorites?userAddress=${encodeURIComponent(userAddress)}`)
        const data = await response.json()

        if (data.success && data.favorites && data.favorites.length > 0) {
          const tokenAddresses = data.favorites.map((fav) => fav.token_address.toLowerCase())
          setFavorites(new Set(tokenAddresses))

          // Update localStorage with DB data
          localStorage.setItem(FAVORITES_KEY, JSON.stringify(tokenAddresses))
        }
      } catch (error) {
        console.error('Failed to load favorites from DB:', error)
      } finally {
        setLoading(false)
      }
    }

    loadFavoritesFromDB()
  }, [userAddress])

  const addFavorite = useCallback(async (tokenAddress) => {
    const normalizedAddress = tokenAddress.toLowerCase()

    // Optimistic update
    setFavorites(prev => {
      const newSet = new Set(prev)
      newSet.add(normalizedAddress)

      // Update localStorage
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(newSet)))

      return newSet
    })

    // Sync to DB if user is connected
    if (userAddress) {
      try {
        await fetch('/api/users/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            tokenAddress: normalizedAddress,
          }),
        })
      } catch (error) {
        console.error('Failed to add favorite to DB:', error)
      }
    }
  }, [userAddress])

  const removeFavorite = useCallback(async (tokenAddress) => {
    const normalizedAddress = tokenAddress.toLowerCase()

    console.log('[useFavorites] Removing favorite:', normalizedAddress)

    // Optimistic update
    setFavorites(prev => {
      const newSet = new Set(prev)
      const hadItem = newSet.has(normalizedAddress)
      newSet.delete(normalizedAddress)

      console.log('[useFavorites] Had item?', hadItem)
      console.log('[useFavorites] New favorites after remove:', Array.from(newSet))

      // Update localStorage
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(newSet)))

      return newSet
    })

    // Sync to DB if user is connected
    if (userAddress) {
      try {
        await fetch('/api/users/favorites', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            tokenAddress: normalizedAddress,
          }),
        })
      } catch (error) {
        console.error('Failed to remove favorite from DB:', error)
      }
    }
  }, [userAddress])

  const toggleFavorite = useCallback(async (tokenAddress) => {
    const normalizedAddress = tokenAddress.toLowerCase()

    console.log('[useFavorites] Toggle favorite:', normalizedAddress)

    // Use ref to get current state
    const isFavorite = favoritesRef.current.has(normalizedAddress)
    console.log('[useFavorites] Is currently favorite?', isFavorite)

    if (isFavorite) {
      console.log('[useFavorites] Calling removeFavorite')
      await removeFavorite(normalizedAddress)
    } else {
      console.log('[useFavorites] Calling addFavorite')
      await addFavorite(normalizedAddress)
    }
  }, [addFavorite, removeFavorite])

  const isFavorite = useCallback((tokenAddress) => {
    return favorites.has(tokenAddress.toLowerCase())
  }, [favorites])

  // Memoize the favorites array to prevent infinite re-renders
  const favoritesArray = useMemo(() => Array.from(favorites), [favorites])

  // Memoize the return object to maintain stable reference
  return useMemo(() => ({
    favorites: favoritesArray,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    loading,
  }), [favoritesArray, isFavorite, addFavorite, removeFavorite, toggleFavorite, loading])
}
