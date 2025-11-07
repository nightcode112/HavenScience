import { useState, useEffect, createContext, useContext } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

const ToastContext = createContext()

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = (message, type = 'info', duration = 5000) => {
    const id = Date.now()
    const toast = { id, message, type, duration }

    // Only one toast visible at a time: replace any existing toasts
    setToasts([toast])

    // Auto remove after duration
    setTimeout(() => {
      removeToast(id)
    }, duration)
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="fixed top-20 right-4 z-[100]">
      {toasts[0] && <ToastItem key={toasts[0].id} toast={toasts[0]} onRemove={onRemove} />}
    </div>
  )
}

function ToastItem({ toast, onRemove }) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Animate in
    setTimeout(() => setIsVisible(true), 50)
  }, [])

  const handleRemove = () => {
    setIsVisible(false)
    setTimeout(() => onRemove(toast.id), 300)
  }

  const getIcon = () => {
    switch (toast.type) {
      case 'success': return <CheckCircle className="h-5 w-5 text-green-400" />
      case 'error': return <AlertCircle className="h-5 w-5 text-red-400" />
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-400" />
      default: return <Info className="h-5 w-5 text-blue-400" />
    }
  }

  const getBackgroundColor = () => {
    switch (toast.type) {
      case 'success': return 'bg-green-900/90 border-green-700'
      case 'error': return 'bg-red-900/90 border-red-700'
      case 'warning': return 'bg-yellow-900/90 border-yellow-700'
      default: return 'bg-slate-900/90 border-slate-700'
    }
  }

  return (
    <div
      className={`flex items-start space-x-3 p-4 rounded-lg border backdrop-blur-sm shadow-lg transition-all duration-300 max-w-sm ${
        getBackgroundColor()
      } ${
        isVisible ? 'transform translate-x-0 opacity-100' : 'transform translate-x-full opacity-0'
      }`}
    >
      {getIcon()}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">
          {toast.message}
        </p>
      </div>
      <button
        onClick={handleRemove}
        className="text-slate-400 hover:text-white transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
