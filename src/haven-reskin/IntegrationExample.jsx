import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useParams } from 'react-router-dom'
import HavenHeader from './components/HavenHeader'
import HavenFactory from './pages/HavenFactory'
import HavenTokenDetail from './pages/HavenTokenDetail'

/**
 * Example integration of Haven reskinned components into HavenScience
 *
 * This file shows how to integrate the new Haven-themed components
 * with your existing robot/token data from HavenScience
 */

// Example: Transform HavenScience robot data to Haven format
function transformRobotToHavenFormat(robot) {
  return {
    id: robot.id,
    address: robot.contractAddress,
    contractAddress: robot.contractAddress,
    symbol: robot.ticker || robot.symbol,
    name: robot.name,
    description: robot.description || `${robot.name} Robot`,
    timestamp: Math.floor(Date.now() / 1000), // Current timestamp

    // Market data
    marketCap: robot.marketCap || 0,
    volume24h: robot.volume24h || 0,
    price: robot.price || 0,
    liquidity: robot.liquidity || 0,
    totalSupply: robot.totalSupply || 1000000,
    holdersCount: robot.holders || 0,

    // Social links (if available)
    twitter: robot.twitter || robot.social?.twitter,
    telegram: robot.telegram || robot.social?.telegram,
    website: robot.website || robot.social?.website,

    // Bonding curve / progress data
    progress: robot.bondingProgress || 0,
    isGraduated: robot.isGraduated || robot.graduated || false,

    // Wallet analysis metadata
    devCreated: robot.metadata?.devCreated || 0,
    devGraduated: robot.metadata?.devGraduated || 0,
    devHolds: robot.metadata?.devHolds || 0,
    top10Holds: robot.metadata?.top10Holds || 0,
    phishingHolds: robot.metadata?.phishingHolds || 0,
    snipersHold: robot.metadata?.snipersHold || 0,
    insidersHold: robot.metadata?.insidersHold || 0,
    netBuy1m: robot.metadata?.netBuy1m || 0,

    // Price changes
    priceChange5m: robot.priceChanges?.m5 || 0,
    priceChange1h: robot.priceChanges?.h1 || 0,
    priceChange6h: robot.priceChanges?.h6 || 0,
    priceChange24h: robot.priceChanges?.h24 || 0,

    // Transaction data
    txns24h: robot.txCount || 0,

    // Additional metadata
    creator: robot.creator,
    creatorAddress: robot.creatorAddress,
    timeAgo: robot.timeAgo || 'New'
  }
}

// Wrapper component for token detail page
function TokenDetailWrapper({ robots }) {
  const { address } = useParams()
  const robot = robots.find(r =>
    r.contractAddress?.toLowerCase() === address?.toLowerCase()
  )

  if (!robot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1419] text-white">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Robot Not Found</h2>
          <p className="text-gray-400">The requested robot does not exist.</p>
        </div>
      </div>
    )
  }

  const transformedRobot = transformRobotToHavenFormat(robot)

  return <HavenTokenDetail robot={transformedRobot} />
}

// Main App Integration Example
export default function IntegrationExample() {
  const [robots, setRobots] = useState([])
  const [loading, setLoading] = useState(true)

  // Example: Fetch robots from your existing API
  useEffect(() => {
    async function fetchRobots() {
      try {
        // Replace with your actual robot fetching logic
        // const response = await fetch('/api/robot/robots')
        // const data = await response.json()

        // For demo, use empty array
        const data = []

        setRobots(data)
      } catch (error) {
        console.error('Failed to fetch robots:', error)
        setRobots([])
      } finally {
        setLoading(false)
      }
    }

    fetchRobots()
  }, [])

  // Transform robots to Haven format
  const transformedRobots = robots.map(transformRobotToHavenFormat)

  return (
    <Router>
      {/* Use Haven Header */}
      <HavenHeader />

      {/* Routes */}
      <Routes>
        {/* Factory page - shows all robots in 3-column layout */}
        <Route
          path="/factory"
          element={
            loading ? (
              <div className="min-h-screen flex items-center justify-center bg-[#0f1419]">
                <div className="text-white">Loading robots...</div>
              </div>
            ) : (
              <HavenFactory robots={transformedRobots} />
            )
          }
        />

        {/* Token/Robot detail page */}
        <Route
          path="/market/:address"
          element={<TokenDetailWrapper robots={robots} />}
        />

        {/* Redirect root to factory */}
        <Route path="/" element={<HavenFactory robots={transformedRobots} />} />
      </Routes>
    </Router>
  )
}

/**
 * INTEGRATION GUIDE:
 *
 * 1. BASIC INTEGRATION (Replace existing views):
 *
 *    In your main App.jsx:
 *    ```
 *    import IntegrationExample from './haven-reskin/IntegrationExample'
 *
 *    function App() {
 *      return <IntegrationExample />
 *    }
 *    ```
 *
 * 2. PARTIAL INTEGRATION (Keep existing views, add new routes):
 *
 *    In your App.jsx:
 *    ```
 *    import HavenHeader from './haven-reskin/components/HavenHeader'
 *    import HavenFactory from './haven-reskin/pages/HavenFactory'
 *
 *    function App() {
 *      return (
 *        <Router>
 *          <HavenHeader />
 *          <Routes>
 *            <Route path="/factory" element={<HavenFactory robots={transformedRobots} />} />
 *            // ... keep your existing routes
 *          </Routes>
 *        </Router>
 *      )
 *    }
 *    ```
 *
 * 3. CUSTOM INTEGRATION:
 *
 *    Import individual components and customize:
 *    ```
 *    import HavenFactory from './haven-reskin/pages/HavenFactory'
 *
 *    function MyCustomPage() {
 *      const [robots, setRobots] = useState([])
 *
 *      // Fetch and transform your data
 *      useEffect(() => {
 *        fetchMyRobots().then(data => {
 *          const transformed = data.map(transformRobotToHavenFormat)
 *          setRobots(transformed)
 *        })
 *      }, [])
 *
 *      return (
 *        <div>
 *          <MyCustomHeader />
 *          <HavenFactory robots={robots} />
 *        </div>
 *      )
 *    }
 *    ```
 *
 * IMPORTANT NOTES:
 * - Update the transformRobotToHavenFormat function to match your actual robot data structure
 * - Implement actual trading functions in the components (currently placeholders)
 * - Add your chart library integration for the chart areas
 * - Customize HAVEN_COLORS in each component if needed
 */
