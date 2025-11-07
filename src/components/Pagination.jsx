import { Button } from "./ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useTheme } from "../context/ThemeContext"

export function Pagination({ currentPage, totalPages, onPageChange }) {
  const pages = []
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Generar números de página
  for (let i = 1; i <= totalPages; i++) {
    pages.push(i)
  }

  const inactiveClasses = isDark
    ? 'border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
    : 'border-gray-300 text-gray-600 hover:bg-gray-100 hover:text-gray-900'

  return (
    <div className="flex items-center justify-center space-x-2 mt-8">
      {/* Previous button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={`${inactiveClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Page numbers */}
      {pages.map((page) => (
        <Button
          key={page}
          variant={currentPage === page ? "default" : "outline"}
          size="sm"
          onClick={() => onPageChange(page)}
          className={
            currentPage === page
              ? 'bg-[#5854f4] hover:bg-[#4c46e8] text-white'
              : inactiveClasses
          }
        >
          {page}
        </Button>
      ))}

      {/* Next button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={`${inactiveClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
