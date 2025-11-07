import { useState, useEffect } from 'react'

export function useBnbPrice() {
  const [bnbPrice, setBnbPrice] = useState(600) // Default BNB price
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBnbPrice = async () => {
      try {
        const response = await fetch('/api/eth-price') // This now returns BNB price
        const data = await response.json()
        // Ensure we always have a valid number
        const price = typeof data.price === 'number' && !isNaN(data.price) ? data.price : 600
        setBnbPrice(price)
      } catch (error) {
        console.error('Failed to fetch BNB price:', error)
        // Keep default price of 600 if API fails
        setBnbPrice(600)
      } finally {
        setLoading(false)
      }
    }

    fetchBnbPrice()
    const interval = setInterval(fetchBnbPrice, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

  return { bnbPrice, ethPrice: bnbPrice, loading } // Export both for compatibility
}

// Keep the old export for compatibility
export function useEthPrice() {
  return useBnbPrice()
}
