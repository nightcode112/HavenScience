/* eslint-env node */
import { createClient } from '@supabase/supabase-js'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '*'
  const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://haven-base.vercel.app',
    'https://pro.haven.science',
  ])
  const allow = allowedOrigins.has(origin) ? origin : '*'

  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', allow)
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '86400')
    res.setHeader('Vary', 'Origin')
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).end('Method Not Allowed')
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  // Use service role key first to bypass RLS policies, fallback to anon key
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_KEY

  console.log('[Image Upload] Checking credentials...', {
    hasUrl: !!SUPABASE_URL,
    hasKey: !!SUPABASE_KEY,
    urlPrefix: SUPABASE_URL?.substring(0, 30),
    usingServiceRole: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY)
  })

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[Image Upload] Missing Supabase credentials', {
      SUPABASE_URL: !!SUPABASE_URL,
      SUPABASE_KEY: !!SUPABASE_KEY
    })
    return res.status(500).json({
      error: 'Missing Supabase credentials',
      detail: 'VITE_SUPABASE_URL and VITE_SUPABASE_KEY environment variables are required'
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  try {
    const { dataUrl, name } = req.body || {}
    if (!dataUrl || typeof dataUrl !== 'string') {
      console.error('[Image Upload] Missing or invalid dataUrl')
      return res.status(400).json({ error: 'Missing dataUrl' })
    }

    // Parse base64 from data URL
    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/)
    if (!match) {
      console.error('[Image Upload] Invalid dataUrl format')
      return res.status(400).json({ error: 'Invalid dataUrl format' })
    }

    const mime = match[1] || 'image/webp'
    const base64 = match[2]

    // Check size before processing
    const sizeInBytes = (base64.length * 3) / 4
    const sizeInMB = sizeInBytes / (1024 * 1024)
    console.log(`[Image Upload] Image size: ${sizeInMB.toFixed(2)} MB`)

    if (sizeInMB > 20) {
      console.error('[Image Upload] Image too large:', sizeInMB.toFixed(2), 'MB')
      return res.status(413).json({ error: 'Image too large. Max 20MB allowed.', sizeInMB: sizeInMB.toFixed(2) })
    }

    const buffer = Buffer.from(base64, 'base64')
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    const extension = mime.split('/')[1] || 'webp'
    const filename = name ? name.replace(/\.[^.]+$/, `.${extension}`) : `token_${timestamp}_${randomStr}.${extension}`
    const filepath = `token-images/${filename}`

    console.log('[Image Upload] Uploading to Supabase Storage:', filepath, mime, `${sizeInMB.toFixed(2)} MB`)

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('token-images')
      .upload(filepath, buffer, {
        contentType: mime,
        upsert: true, // Allow overwriting if file exists
        cacheControl: '31536000' // 1 year cache
      })

    if (error) {
      console.error('[Image Upload] Supabase Storage error:', error)

      // If bucket doesn't exist, provide helpful error message
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        return res.status(500).json({
          error: 'Storage bucket not found',
          detail: 'Please create a "token-images" bucket in Supabase Storage',
          supabaseError: error.message
        })
      }

      // If RLS policy violation, provide helpful error message
      if (error.message?.includes('row-level security') || error.message?.includes('policy')) {
        return res.status(500).json({
          error: 'Upload failed',
          detail: 'Row Level Security policy violation. Please add SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_SERVICE_KEY to your Vercel environment variables, or disable RLS on the token-images bucket.',
          supabaseError: error.message
        })
      }

      return res.status(500).json({ error: 'Upload failed', detail: error.message, supabaseError: error })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('token-images')
      .getPublicUrl(filepath)

    const publicUrl = urlData?.publicUrl

    if (!publicUrl) {
      console.error('[Image Upload] Failed to get public URL')
      return res.status(500).json({ error: 'Failed to get public URL' })
    }

    console.log('[Image Upload] Success! URL:', publicUrl)

    res.setHeader('Access-Control-Allow-Origin', allow)
    res.setHeader('Vary', 'Origin')
    return res.status(200).json({
      url: publicUrl,
      path: filepath,
      protocolUrl: publicUrl // Keep same response format for compatibility
    })
  } catch (err) {
    console.error('[Image Upload] Unexpected error:', err)
    res.setHeader('Access-Control-Allow-Origin', allow)
    res.setHeader('Vary', 'Origin')
    return res.status(500).json({ error: 'Upload failed', detail: String(err), stack: err.stack })
  }
}


