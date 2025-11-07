import { supabase } from '../lib/supabase'

const BASE = '/api/robot'

// Convert IPFS URLs to HTTP gateway URLs
function convertIpfsUrl(url) {
  if (!url) return url
  if (url.startsWith('ipfs://')) {
    const hash = url.replace('ipfs://', '')
    return `https://gateway.pinata.cloud/ipfs/${hash}`
  }
  return url
}

function withHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra }
  return headers
}

async function handle(res) {
  const text = await res.text()
  try {
    const json = text ? JSON.parse(text) : null
    if (!res.ok) throw new Error(json?.error || res.statusText)
    return json
  } catch {
    if (!res.ok) throw new Error(text || res.statusText)
    return text
  }
}

export const RobotApi = {
  // POST /robot/add
  addRobot: (payload) => (
    fetch(`${BASE}/add`, {
      method: 'POST',
      headers: withHeaders(),
      body: JSON.stringify(payload),
    }).then(handle)
  ),

  // GET /robot/robots - now reading directly from Supabase
  getAllRobots: async (wallet) => {
    try {

      // Fetch both robots and agents in parallel
      const [robotsResult, agentsResult] = await Promise.all([
        supabase
          .from('robots')
          .select('*')
          .order('timestamp', { ascending: false }),
        supabase
          .from('agents')
          .select('*')
          .order('created_at', { ascending: false })
      ])

      if (robotsResult.error) {
      }

      if (agentsResult.error) {
      }

      const robots = robotsResult.data || []
      const agents = agentsResult.data || []


      // Merge robots and agents
      // Agents need to be transformed to match robot structure
      const transformedAgents = agents.map(agent => ({
        ...agent,
        isAgent: true, // Flag to identify agents
        // Map agent fields to robot fields if needed
        address: agent.bonding_contract || agent.contract,
        contractAddress: agent.bonding_contract || agent.contract,
        symbol: agent.ticker,
        image: convertIpfsUrl(agent.image), // Convert IPFS URLs to HTTP gateway
      }))

      const combined = [...robots, ...transformedAgents]


      return combined
    } catch (err) {
      return []
    }
  },

  // GET /robot/user/robots (requires wallet header) + user agents
  getUserRobots: async (wallet) => {
    try {
      // Fetch user robots from backend
      let robots = []
      try {
        const robotsResponse = await fetch(`${BASE}/user/robots`, {
          method: 'GET',
          headers: withHeaders({ wallet })
        }).then(handle)

        // Ensure robots is an array
        robots = Array.isArray(robotsResponse) ? robotsResponse : (robotsResponse?.robots || [])
      } catch (err) {
        console.error('Failed to fetch user robots:', err)
        robots = []
      }

      // Fetch user agents directly from Supabase (backend only returns mapping data)
      let agents = []
      try {
        const { data, error } = await supabase
          .from('agents')
          .select('*')
          .eq('wallet', wallet)
          .order('created_at', { ascending: false })

        if (!error && data) {
          agents = data
        }
      } catch (err) {
        console.error('Failed to fetch user agents:', err)
      }

      // Transform agents to match robot structure
      const transformedAgents = agents.map(agent => ({
        ...agent,
        isAgent: true,
        address: agent.bonding_contract || agent.contract,
        contractAddress: agent.bonding_contract || agent.contract,
        symbol: agent.ticker, // Map ticker to symbol for consistency
        image: convertIpfsUrl(agent.image), // Convert IPFS URLs to HTTP gateway
      }))

      return [...robots, ...transformedAgents]
    } catch (err) {
      console.error('getUserRobots error:', err)
      return []
    }
  },

  // GET /robot/simulations
  getAllSimulations: () => (
    fetch(`${BASE}/simulations`, { method: 'GET' }).then(handle)
  ),

  // GET /robot/user/simulations (requires wallet header)
  getUserSimulations: (wallet) => (
    fetch(`${BASE}/user/simulations`, { method: 'GET', headers: withHeaders({ wallet }) }).then(handle)
  ),

  // POST /robot/sim/load-simulation
  loadSimulation: (_isUsb, payload) => (
    fetch(`${BASE}/sim/load-simulation`, {
      method: 'POST',
      // If payload contains wallet, also forward it as header for upstream
      headers: withHeaders(payload?.wallet ? { wallet: payload.wallet } : undefined),
      body: JSON.stringify(payload),
    }).then(handle)
  ),

  // POST /robot/command/add-command (requires wallet header)
  addCommand: (command, wallet, payload) => (
    fetch(`${BASE}/command/add-command`, {
      method: 'POST',
      headers: withHeaders({ wallet }),
      body: JSON.stringify({ command, ...payload }),
    }).then(handle)
  ),

  // POST /robot/<simulation_id>/command
  sendCommand: (simulationId, payload) => (
    fetch(`${BASE}/command/${encodeURIComponent(simulationId)}`, {
      method: 'POST',
      headers: withHeaders(),
      body: JSON.stringify(payload),
    }).then(handle)
  ),

  // POST /robot/agents/agent-llm-command - Send command to agent LLM
  sendAgentCommand: (payload) => (
    fetch(`${BASE}/agents/agent-llm-command`, {
      method: 'POST',
      headers: withHeaders(),
      body: JSON.stringify(payload),
    }).then(handle)
  ),

  // GET /robot/<simulation_id>/<device_node>/status
  getStatus: (simulationId, deviceNode) => (
    fetch(`${BASE}/status/${encodeURIComponent(simulationId)}/${encodeURIComponent(deviceNode)}`, {
      method: 'GET',
    }).then(handle)
  ),
}

/**
 * DexScreener API - Get token stats for graduated/bonded tokens
 * @param {string} tokenAddress - The bonding contract address
 * @returns {Promise<{marketCap: number, volume24h: number} | null>}
 */
export async function getDexScreenerStats(tokenAddress) {
  if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
    return null
  }
  
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { method: 'GET' }
    )
    
    if (!response.ok) return null
    
    const data = await response.json()
    
    // DexScreener returns an array of pairs for the token
    // We want the first pair (usually the main one)
    const pairs = data?.pairs
    if (!Array.isArray(pairs) || pairs.length === 0) return null
    
    const pair = pairs[0] // Get first/main pair
    
    return {
      marketCap: pair?.marketCap ?? 0,
      volume24h: pair?.volume?.h24 ?? 0,
      fdv: pair?.fdv ?? 0,
      priceUsd: pair?.priceUsd ?? 0,
      liquidity: pair?.liquidity?.usd ?? 0,
      dexPaid: pair?.boosts?.active > 0 || false, // DexScreener boosts indicate paid listing
      pairAddress: pair?.pairAddress,
    }
  } catch (error) {
    return null
  }
}

/**
 * Get sim type configuration by ID
 * @param {string} simType - The sim type ID
 * @returns {Promise<object | null>}
 */
export async function getSimTypeConfig(simType) {
  if (!simType) return null
  
  try {
    const response = await fetch('/api/robot/robots/getsimtype', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sim_type: simType })
    })
    
    if (!response.ok) return null
    
    const data = await response.json()
    return data?.sim_data ?? null
  } catch (error) {
    return null
  }
}

/**
 * Get game sim configuration by ID
 * @param {string} gameSimId - The game sim ID
 * @returns {Promise<object | null>}
 */
export async function getGameSimConfig(gameSimId) {
  if (!gameSimId) return null
  
  try {
    const response = await fetch('/api/robot/robots/getgamesim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_sim_id: gameSimId })
    })
    
    if (!response.ok) return null
    
    const data = await response.json()
    return data?.game_sim_data ?? null
  } catch (error) {
    return null
  }
}