import { useState, useMemo, useEffect, useRef } from "react"
import { RobotCard } from "./RobotCard"
import { RobotFilters } from "./RobotFilters"
import { Pagination } from "./Pagination"
import { Search } from "lucide-react"
import { useTheme } from "../context/ThemeContext"

const ROBOTS_PER_PAGE = 6

export function RobotGrid({
  selectedRobot,
  onRobotSelect,
  quickBuyAmount,
  onQuickBuyAmountChange,
  view,
  onViewChange,
  onQuickBuy,
  robots,
  isWalletConnected,
  onTradeComplete, // Callback to notify parent when a trade completes
  quickBuyMode,
  onQuickBuyModeChange,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('new')
  const [currentPage, setCurrentPage] = useState(1)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const refreshIntervalRef = useRef(null)
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const source = useMemo(() => (Array.isArray(robots) && robots.length > 0 ? robots : []), [robots])

  const filteredAndSortedRobots = useMemo(() => {
    let filtered = source.filter(robot => {
      const term = searchTerm.toLowerCase()
      const name = String(robot.name || '').toLowerCase()
      const type = String(robot.type || '').toLowerCase()
      const ticker = String(robot.ticker || robot.token?.symbol || '').toLowerCase()
      return name.includes(term) || type.includes(term) || ticker.includes(term)
    })

    // Ordenar según la opción seleccionada ("new" invierte el orden original)
    if (sortBy === 'new') {
      filtered.reverse()
    } else {
      filtered.sort((a, b) => {
        switch (sortBy) {
          case 'volume':
            // Simular volumen basado en precio
            return b.token.price - a.token.price
          case 'marketcap':
            return b.token.price - a.token.price
          case 'age':
          default:
            // Ordenar por ID (los más nuevos primero)
            return b.id.localeCompare(a.id)
        }
      })
    }

    return filtered
  }, [searchTerm, sortBy, source])

  // Calcular paginación
  const totalPages = Math.ceil(filteredAndSortedRobots.length / ROBOTS_PER_PAGE)
  const startIndex = (currentPage - 1) * ROBOTS_PER_PAGE
  const endIndex = startIndex + ROBOTS_PER_PAGE
  const currentRobots = filteredAndSortedRobots.slice(startIndex, endIndex)

  // Reset página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, sortBy])

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Register refresh callback with parent
  useEffect(() => {
    if (onTradeComplete) {
      onTradeComplete((contractAddress) => {
        setTimeout(() => setRefreshTrigger(prev => prev + 1), 2000)
      })
    }
  }, [onTradeComplete])

  // Periodic refresh: every 5s for current page, or only selected robot if modal is open
  useEffect(() => {
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
      refreshIntervalRef.current = null
    }

    // Set up 5-second refresh interval
    refreshIntervalRef.current = setInterval(() => {
      setRefreshTrigger(prev => prev + 1)
    }, 5000)

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
    }
  }, [currentRobots.length, selectedRobot?.contractAddress])

  // When modal closes, trigger immediate refresh
  useEffect(() => {
    if (!selectedRobot) {
      setRefreshTrigger(prev => prev + 1)
    }
  }, [selectedRobot])

  return (
    <div className="space-y-6">
      {/* Filters integrados */}
      <RobotFilters 
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        sortBy={sortBy}
        setSortBy={setSortBy}
        quickBuyAmount={quickBuyAmount}
        onQuickBuyAmountChange={onQuickBuyAmountChange}
        view={view}
        onViewChange={onViewChange}
        quickBuyMode={quickBuyMode}
        onQuickBuyModeChange={onQuickBuyModeChange}
      />
      
      {/* Robot Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
        {currentRobots.map((robot) => (
          <RobotCard
            key={robot.id}
            robot={robot}
            isSelected={selectedRobot?.id === robot.id}
            onSelect={() => onRobotSelect(robot)}
            quickBuyAmount={quickBuyAmount}
            onQuickBuy={onQuickBuy}
            isWalletConnected={isWalletConnected}
            refreshTrigger={refreshTrigger}
            quickBuyMode={quickBuyMode}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}

      {/* No results - unify with table style */}
      {filteredAndSortedRobots.length === 0 && (
        <div className="text-center py-12">
          <div className={`${isDark ? 'text-slate-500' : 'text-gray-400'} mb-4`}>
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          </div>
          <h3 className={`text-lg font-medium ${isDark ? 'text-slate-400' : 'text-gray-700'} mb-2`}>No robots found</h3>
          <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>Try adjusting your search</p>
        </div>
      )}
    </div>
  )
}