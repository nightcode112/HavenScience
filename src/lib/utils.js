import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function toHttpIpfs(url) {
  if (typeof url !== 'string' || url.length === 0) return ''
  if (url.startsWith('ipfs://')) {
    const path = url.replace('ipfs://', '')
    return `https://ipfs.io/ipfs/${path}`
  }
  return url
}

export function safeImageUrl(value) {
  if (typeof value === 'string' && value) return toHttpIpfs(value)
  if (value && typeof value === 'object') {
    const candidate = value.protocolUrl || value.url || value.src || value.href || ''
    if (typeof candidate === 'string' && candidate) return toHttpIpfs(candidate)
  }
  return '/assets/placeholder.png'
}

export function shortAddress(addr, start = 6, end = 4) {
  if (typeof addr !== 'string') return ''
  if (addr.length <= start + end) return addr
  return `${addr.slice(0, start)}…${addr.slice(-end)}`
}

export function formatNumber(num) {
  // Handle undefined, null, or invalid values
  if (num === undefined || num === null || isNaN(num)) {
    return '0.00'
  }

  // Convert to number if it's a string
  const value = typeof num === 'string' ? parseFloat(num) : num

  if (isNaN(value)) {
    return '0.00'
  }

  if (value >= 1e9) {
    return (value / 1e9).toFixed(2) + 'B'
  }
  if (value >= 1e6) {
    return (value / 1e6).toFixed(2) + 'M'
  }
  if (value >= 1e3) {
    return (value / 1e3).toFixed(2) + 'K'
  }
  return value.toFixed(2)
}
