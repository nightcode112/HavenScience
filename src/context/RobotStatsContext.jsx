import { createContext, useContext, useEffect, useRef, useState } from 'react'

const RobotStatsContext = createContext({ havenUsd: 0, setRobotStats: () => {}, robotStats: {}, tokenStatsByAddress: {}, setTokenStatsFor: () => {} })

export function RobotStatsProvider({ children }) {
  const [robotStats, setRobotStats] = useState({ total: 0, active: 0 })
  const [havenUsd, setHavenUsd] = useState(0)
  const [tokenStatsByAddress, setTokenStatsByAddress] = useState({})
  const intervalRef = useRef(null)

  const fetchPrice = async () => {
    try {
      const res = await fetch('/api/blockchain/get_main_price').catch(() => null)
      const txt = res ? await res.text() : null
      const num = txt ? Number(txt) : NaN
      if (Number.isFinite(num) && num > 0) {
        setHavenUsd(num)
      }
    } catch {}
  }

  useEffect(() => {
    fetchPrice()
    intervalRef.current = setInterval(fetchPrice, 60000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const setTokenStatsFor = (address, stats) => {
    if (!address) return
    setTokenStatsByAddress((prev) => ({ ...prev, [address]: stats }))
  }

  const value = { havenUsd, robotStats, setRobotStats, tokenStatsByAddress, setTokenStatsFor }
  return (
    <RobotStatsContext.Provider value={value}>
      {children}
    </RobotStatsContext.Provider>
  )
}

export function useRobotStats() {
  return useContext(RobotStatsContext)
}
