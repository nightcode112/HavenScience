// Vite plugin to handle API endpoints locally
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

export default function apiPlugin() {
  return {
    name: 'vite-plugin-api',
    configureServer(server) {
      server.middlewares.use('/api/eth-price', async (req, res, next) => {
        if (req.method === 'GET') {
          try {
            // Fetch BNB price from CoinGecko
            const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd')
            const data = await response.json()

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              price: data?.binancecoin?.usd || 600, // BNB price with fallback
              currency: 'bnb'
            }))
          } catch (error) {
            console.error('Failed to fetch BNB price:', error)
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Failed to fetch BNB price', price: 600 }))
          }
        } else {
          next()
        }
      })

      server.middlewares.use('/api/users/favorites', async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`)

        if (req.method === 'GET') {
          // Get favorites - for now, return empty array (localStorage will be used)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            success: true,
            favorites: []
          }))
        } else if (req.method === 'POST') {
          // Add favorite
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({
                success: true,
                message: 'Favorite added (localStorage only)'
              }))
            } catch (error) {
              res.statusCode = 400
              res.end(JSON.stringify({ success: false, error: 'Invalid request' }))
            }
          })
        } else if (req.method === 'DELETE') {
          // Remove favorite
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({
                success: true,
                message: 'Favorite removed (localStorage only)'
              }))
            } catch (error) {
              res.statusCode = 400
              res.end(JSON.stringify({ success: false, error: 'Invalid request' }))
            }
          })
        } else {
          next()
        }
      })

      server.middlewares.use('/api/bonding-curve', async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        const action = url.searchParams.get('action')

        if (req.method === 'GET' && action === 'tokens') {
          // This will be proxied to the backend, but provide a fallback
          next()
        } else {
          next()
        }
      })

      // Mock endpoint for token stats (for development)
      server.middlewares.use('/api/blockchain/token_stats', async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        const address = url.searchParams.get('address')

        if (req.method === 'GET' && address) {
          // Generate CONSISTENT mock data for development
          // In production, this would fetch from your backend database
          const seed = parseInt(address.slice(2, 10), 16) || 1

          // Consistent random function that always returns same value for same seed and index
          const seededRandom = (index) => {
            const x = Math.sin(seed * 9999 + index * 1234) * 10000
            return x - Math.floor(x)
          }

          const mockData = {
            success: true,
            data: {
              address: address,
              price: 0.001 + seededRandom(1) * 0.009,
              price_change_5m: -5 + seededRandom(2) * 20,
              price_change_1h: -10 + seededRandom(3) * 30,
              price_change_6h: -20 + seededRandom(4) * 50,
              price_change_24h: -30 + seededRandom(5) * 80,
              priceChange5m: -5 + seededRandom(2) * 20,
              priceChange1h: -10 + seededRandom(3) * 30,
              priceChange6h: -20 + seededRandom(4) * 50,
              priceChange24h: -30 + seededRandom(5) * 80,
              volume24h: 1000 + seededRandom(6) * 49000,
              liquidity: 5000 + seededRandom(7) * 95000,
              holders: Math.floor(10 + seededRandom(8) * 490)
            }
          }

          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(mockData))
        } else {
          next()
        }
      })

      // Creator fees endpoint
      server.middlewares.use('/api/creator-fees', async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`)

        // Add query parameters to req object
        req.query = Object.fromEntries(url.searchParams)

        if (req.method === 'GET') {
          try {
            // Import and call the API handler
            const handler = await import('./api/creator-fees/index.js')
            await handler.default(req, res)
          } catch (error) {
            console.error('Creator fees API error:', error)
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: error.message }))
          }
        } else {
          next()
        }
      })

      // Hardhat verification endpoint
      server.middlewares.use('/api/verify-hardhat', async (req, res, next) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', async () => {
            try {
              const data = JSON.parse(body)
              const handler = await import('./api/verify-hardhat.js')
              await handler.default({ method: 'POST', body: data }, res)
            } catch (error) {
              console.error('Hardhat verify error:', error)
              res.statusCode = 500
              res.end(JSON.stringify({ success: false, error: error.message }))
            }
          })
        } else {
          next()
        }
      })

      // Contract verification endpoint
      server.middlewares.use('/api/verify', async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`)

        if (req.method === 'GET') {
          // Status check
          try {
            const handler = await import('./api/verify.js')
            await handler.default({
              method: 'GET',
              query: Object.fromEntries(url.searchParams)
            }, res)
          } catch (error) {
            console.error('Verify status check error:', error)
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: error.message }))
          }
        } else if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', async () => {
            try {
              const data = JSON.parse(body)
              // Import and call the verification handler
              const handler = await import('./api/verify.js')
              await handler.default({ method: 'POST', body: data }, res)
            } catch (error) {
              console.error('Verify API error:', error)
              res.statusCode = 500
              res.end(JSON.stringify({ success: false, error: error.message }))
            }
          })
        } else {
          next()
        }
      })
    }
  }
}
