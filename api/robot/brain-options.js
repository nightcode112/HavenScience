// API endpoint to return available AI model options for robot/agent creation
// This returns the model mapping that maps numeric IDs to model names

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Model mapping: ID -> Model name
    // This matches the backend's model_mapping configuration
    const modelMapping = {
      "0": null,  // No AI model
      "1": "openai/o3-mini",
      "2": "anthropic/claude-haiku-4.5",
      "3": "deepseek/deepseek-v3.1-terminus",
      "4": "google/gemini-2.0-flash-lite-001",
      "5": "x-ai/grok-3-mini"
    }

    return res.status(200).json(modelMapping)
  } catch (error) {
    console.error('[brain-options] Unexpected error:', error)
    return res.status(500).json({ error: 'Internal server error', details: error.message })
  }
}
