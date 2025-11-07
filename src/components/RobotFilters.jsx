import { Search, ChevronDown } from "lucide-react"
import { ViewToggle } from "./ViewToggle"
import { useTheme } from "../context/ThemeContext"

export function RobotFilters({
  searchTerm,
  setSearchTerm,
  sortBy,
  setSortBy,
  quickBuyAmount,
  onQuickBuyAmountChange,
  view,
  onViewChange,
  quickBuyMode,
  onQuickBuyModeChange,
}) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const handleQuickBuyChange = (e) => {
    const value = e.target.value
    // Allow empty, numbers, and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      onQuickBuyAmountChange(value)
    }
  }

  const toggleMode = () => {
    onQuickBuyModeChange?.('xtoken')
  }

  return (
    <div className="space-y-4 mb-6">
      {/* Primera línea: Search + Sort */}
      <div className="flex gap-4 items-center">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search
            className={`absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 ${
              isDark ? 'text-gray-400' : 'text-gray-500'
            }`}
          />
          <input
            type="text"
            placeholder="Search by name:"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-7 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] shadow-sm ${
              isDark
                ? 'bg-transparent border-gray-600 text-white placeholder-white backdrop-blur-sm'
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
            }`}
          />
        </div>

        {/* Sort Filter */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className={`appearance-none border rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] cursor-pointer min-w-[140px] shadow-sm ${
              isDark
                ? 'bg-transparent border-gray-600 text-white backdrop-blur-sm'
                : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <option value="new" className={isDark ? 'bg-slate-800' : 'bg-white'}>Sort by New</option>
            <option value="progress" className={isDark ? 'bg-slate-800' : 'bg-white'}>Sort by Progress</option>
            <option value="marketcap" className={isDark ? 'bg-slate-800' : 'bg-white'}>Sort by Market Cap</option>
          </select>
          <ChevronDown
            className={`absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 pointer-events-none ${
              isDark ? 'text-gray-400' : 'text-gray-500'
            }`}
          />
        </div>
      </div>

      {/* Segunda línea: Quick Buy + View Toggle */}
      <div className="flex gap-4 items-center justify-between">
        {/* Quick Buy */}
        <div
          className={`flex items-center space-x-2 border rounded-lg px-3 py-2 shadow-sm backdrop-blur-sm ${
            isDark
              ? 'bg-transparent border-gray-600'
              : 'bg-white border-gray-300'
          }`}
        >
          <img src="/assets/IconHaven.svg" alt="HAVEN" className="h-6 w-6" />
          <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Buy</span>
          <input
            type="text"
            value={quickBuyAmount || ''}
            onChange={handleQuickBuyChange}
            placeholder={'10'}
            className={`w-16 px-1 py-1 bg-transparent text-sm text-center focus:outline-none border-b ${
              isDark
                ? 'text-white border-gray-600 focus:border-[#5854f4]'
                : 'text-gray-900 border-gray-300 focus:border-[#5854f4]'
            }`}
          />
          <button
            onClick={toggleMode}
            className={`text-sm font-medium px-2 py-1 rounded transition-colors ${
              isDark
                ? 'text-white hover:bg-slate-700'
                : 'text-gray-900 hover:bg-gray-100'
            }`}
          >
            HAVEN
          </button>
        </div>

        {/* View Toggle */}
        <div
          className={`flex items-center space-x-1 border rounded-lg p-1 shadow-sm ${
            isDark
              ? 'bg-transparent border-gray-600 backdrop-blur-sm'
              : 'bg-white border-gray-300'
          }`}
        >
          <ViewToggle view={view} onViewChange={onViewChange} />
        </div>
      </div>
    </div>
  )
}
