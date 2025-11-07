import React from 'react'

export const TrendingUpIcon = ({ className, size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={`transition-all ${className || ''}`}
  >
    <path
      d="M2 12L7 7L11 11L22 2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-draw"
    />
    <path
      d="M16 2H22V8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-draw-delayed"
    />
    <circle
      cx="7"
      cy="7"
      r="2"
      fill="currentColor"
      className="animate-pulse"
      opacity="0.5"
    />
    <circle
      cx="11"
      cy="11"
      r="2"
      fill="currentColor"
      className="animate-pulse animation-delay-200"
      opacity="0.5"
    />
  </svg>
)

export const SparkleIcon = ({ className, size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={`animate-sparkle ${className || ''}`}
  >
    <path
      d="M12 2L14.09 8.26L21 9L16 14L17.82 21L12 17.27L6.18 21L8 14L3 9L9.91 8.26L12 2Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="currentColor"
      fillOpacity="0.2"
    />
    <circle cx="5" cy="5" r="1" fill="currentColor" className="animate-twinkle" />
    <circle cx="19" cy="5" r="1" fill="currentColor" className="animate-twinkle animation-delay-200" />
    <circle cx="19" cy="19" r="1" fill="currentColor" className="animate-twinkle animation-delay-400" />
    <circle cx="5" cy="19" r="1" fill="currentColor" className="animate-twinkle animation-delay-600" />
  </svg>
)

export const LightningIcon = ({ className, size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={`animate-zap ${className || ''}`}
  >
    <path
      d="M13 2L3 14H12L11 22L21 10H12L13 2Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="currentColor"
      fillOpacity="0.2"
      className="animate-electric"
    />
  </svg>
)
