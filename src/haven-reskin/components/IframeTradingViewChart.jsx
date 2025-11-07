import { useRef } from 'react'

export default function IframeTradingViewChart({
  symbol,
  tokenAddress,
  totalSupply = 1000000,
  width = '100%',
  height = 500,
}) {
  const iframeRef = useRef(null)

  // Create the working chart URL with parameters
  const chartUrl = `/test-working-chart.html?symbol=${encodeURIComponent(symbol)}&address=${encodeURIComponent(tokenAddress)}&supply=${totalSupply}`

  return (
    <div className="trading-chart-container w-full h-full">
      <iframe
        ref={iframeRef}
        src={chartUrl}
        className="trading-chart overflow-hidden bg-black w-full h-full"
        style={{
          border: 'none'
        }}
        title={`${symbol} Trading Chart`}
      />
    </div>
  )
}
