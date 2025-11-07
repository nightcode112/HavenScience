import { Store, Bot, FileText, Plus } from "lucide-react"
import { Button } from "./ui/button"
import { Link, useLocation } from "react-router-dom"
import { useTheme } from "../context/ThemeContext"

const menuItems = [
  {
    name: "Marketplace",
    icon: Store,
    href: "/",
    path: "/"
  },
  {
    name: "My Robots",
    icon: Bot,
    href: "/robots",
    path: "/robots"
  },
  {
    name: "Docs",
    icon: FileText,
    href: "/docs",
    path: "/docs"
  }
]

export function Sidebar() {
  const location = useLocation()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const desktopContainerClasses = isDark
    ? 'bg-transparent border-gray-700'
    : 'bg-transparent border-gray-200'

  const mobileContainerClasses = isDark
    ? 'bg-slate-900/80 border-slate-700/60 shadow-2xl backdrop-blur-md'
    : 'bg-white/95 backdrop-blur-md border-gray-200 shadow-lg'

  const desktopInactiveClasses = isDark
    ? 'text-gray-300 hover:text-white hover:bg-gray-700/50'
    : 'text-gray-700 hover:text-[#5854f4] hover:bg-gray-100'

  const mobileInactiveClasses = isDark
    ? 'text-slate-400 hover:text-white hover:bg-slate-700/50'
    : 'text-gray-600 hover:text-[#5854f4] hover:bg-gray-100'

  return (
    <>
      {/* Desktop Sidebar */}
      <div
        className={`hidden md:block fixed left-0 top-16 h-[calc(100vh-4rem)] w-16 lg:w-64 backdrop-blur-sm border-r shadow-sm transition-all duration-300 ${desktopContainerClasses}`}
      >
        <div className="flex flex-col h-full p-2 lg:p-4">
          {/* Menu Items */}
          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <a
                  key={item.name}
                  href={item.name === 'Docs' ? 'https://docs.haven.science/' : item.href}
                  {...(item.name === 'Docs' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className={`group flex items-center space-x-3 lg:space-x-3 px-2 lg:px-4 py-3 rounded-lg text-sm font-medium transition-all duration-300 relative justify-center lg:justify-start ${
                    isActive && item.name !== 'Docs'
                      ? 'bg-gradient-to-r from-[#5854f4] to-[#7c3aed] text-white shadow-md'
                      : desktopInactiveClasses
                  }`}
                  title={item.name}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="hidden lg:block transition-opacity duration-300">{item.name}</span>

                  {/* Tooltip para modo colapsado */}
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none lg:hidden whitespace-nowrap z-50">
                    {item.name}
                  </div>
                </a>
              )
            })}
          </nav>

          {/* Create Button */}
          <div className={`mt-4 pt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <Link to="/create">
              <Button className="w-full bg-gradient-to-r from-[#5854f4] to-[#7c3aed] hover:from-[#4c46e8] hover:to-[#6d28d9] text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 group relative flex items-center justify-center lg:justify-start">
                <Plus className="h-4 w-4 flex-shrink-0 lg:mr-2" />
                <span className="hidden lg:block">Create New Robot</span>

                {/* Tooltip para Create Button en modo colapsado */}
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none lg:hidden whitespace-nowrap z-50">
                  Create New Robot
                </div>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
        <div className={mobileContainerClasses}>
          <div className="flex items-center justify-around py-3 px-2">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              const isExternal = item.name === 'Docs'
              
              if (isExternal) {
                return (
                  <a
                    key={item.name}
                    href="https://docs.haven.science/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-300 ${mobileInactiveClasses}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </a>
                )
              }
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-300 ${
                    isActive
                      ? 'text-[#5854f4] bg-[#5854f4]/10'
                      : mobileInactiveClasses
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              )
            })}

            {/* Create Button for Mobile */}
            <Link to="/create">
              <div className="flex flex-col items-center space-y-1 px-3 py-2">
                <div className="bg-gradient-to-r from-[#5854f4] to-[#7c3aed] p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110">
                  <Plus className="h-5 w-5 text-white" />
                </div>
                <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Create</span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
