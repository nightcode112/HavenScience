import { Button } from "./ui/button"
import { Grid3X3, List } from "lucide-react"
import { useTheme } from "../context/ThemeContext"

export function ViewToggle({ view, onViewChange }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const inactiveClasses = isDark
    ? 'text-slate-400 hover:text-white hover:bg-slate-700'
    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'

  return (
    <>
      <Button
        size="sm"
        variant={view === 'grid' ? 'default' : 'ghost'}
        onClick={() => onViewChange('grid')}
        className={`h-8 px-3 ${
          view === 'grid'
            ? 'bg-[#5854f4] hover:bg-[#4c46e8] text-white'
            : inactiveClasses
        }`}
      >
        <Grid3X3 className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant={view === 'table' ? 'default' : 'ghost'}
        onClick={() => onViewChange('table')}
        className={`h-8 px-3 ${
          view === 'table'
            ? 'bg-[#5854f4] hover:bg-[#4c46e8] text-white'
            : inactiveClasses
        }`}
      >
        <List className="h-4 w-4" />
      </Button>
    </>
  )
}
