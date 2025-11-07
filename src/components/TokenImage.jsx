import React, { useState } from 'react'

const sizeMap = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg'
}

// Convert IPFS URLs to HTTP gateway URLs
function convertIpfsUrl(url) {
  if (!url) return null

  // If it's an IPFS URL, convert to HTTP gateway
  if (url.startsWith('ipfs://')) {
    const hash = url.replace('ipfs://', '')
    return `https://ipfs.io/ipfs/${hash}`
  }

  return url
}

export default function TokenImage({ token, size = 'md', className = '', showHalo = false }) {
  const [imageError, setImageError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Get token image URL with fallbacks
  const getImageUrl = () => {
    if (token.imageUrl && !imageError) {
      return convertIpfsUrl(token.imageUrl)
    }

    if (token.image && !imageError) {
      return convertIpfsUrl(token.image)
    }

    // Fallback to DexScreener API for token images
    if (token.address && !imageError) {
      return `https://dd.dexscreener.com/ds-data/tokens/ethereum/${token.address.toLowerCase()}.png`
    }

    return null
  }

  const imageUrl = getImageUrl()

  // Generate unique gradient based on token address or symbol
  const getGradientColors = () => {
    const seed = token.address || token.symbol
    const hash = seed.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc)
    }, 0)

    const hue1 = Math.abs(hash) % 360
    const hue2 = (hue1 + 60) % 360

    return {
      from: `hsl(${hue1}, 70%, 50%)`,
      to: `hsl(${hue2}, 70%, 60%)`
    }
  }

  const colors = getGradientColors()

  return (
    <div className={`relative ${className}`}>
      {showHalo && (
        <div
          className={`absolute inset-0 rounded-full blur-xl opacity-20 ${sizeMap[size]}`}
          style={{
            background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`
          }}
        />
      )}
      <div
        className={`rounded-full flex items-center justify-center relative overflow-hidden shadow-lg ring-1 ring-white/10 ${sizeMap[size]}`}
        style={{
          background: imageUrl ? 'transparent' : `linear-gradient(135deg, ${colors.from}, ${colors.to})`
        }}
      >
        {imageUrl ? (
          <>
            {isLoading && (
              <div
                className="absolute inset-0 animate-pulse"
                style={{
                  background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`
                }}
              />
            )}
            <img
              src={imageUrl}
              alt={token.symbol}
              className={`w-full h-full object-cover ${isLoading ? 'opacity-0' : ''}`}
              loading="lazy"
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setImageError(true)
                setIsLoading(false)
              }}
            />
          </>
        ) : (
          <span className="text-white font-bold uppercase">
            {token.symbol.substring(0, size === 'xs' ? 1 : 2)}
          </span>
        )}
      </div>
    </div>
  )
}
