import { useState } from 'react'
import { Button } from '../components/ui/button'

export default function TestSwap() {
  const [testStatus, setTestStatus] = useState('')
  const [testResp, setTestResp] = useState(null)
  const [testErr, setTestErr] = useState('')

  const testDirectCall = async () => {
    try {
      setTestErr('')
      setTestResp(null)
      setTestStatus('Calling https://havenserver.com/blockchain/get_main_price ...')
      const res = await fetch('https://havenserver.com/blockchain/get_main_price', {
        method: 'GET',
        mode: 'cors',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        referrer: 'https://app.haven.science/',
        referrerPolicy: 'strict-origin-when-cross-origin',
      })
      const text = await res.text().catch(() => '')
      const headers = {}
      try { for (const [k, v] of res.headers.entries()) headers[k] = v } catch {}
      const payload = { ok: res.ok, status: res.status, headers, body: text }
      console.log('[Test /test] direct fetch result', payload)
      setTestResp(payload)
      setTestStatus('')
    } catch (e) {
      const msg = e?.message || String(e)
      console.error('[Test /test] direct fetch error', e)
      setTestErr(msg)
      setTestStatus('')
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Test API</h1>
      <div style={{ marginTop: 8 }}>
        <p>Probar llamada directa desde el navegador a https://havenserver.com/blockchain/get_main_price</p>
        <div style={{ marginTop: 8 }}>
          <Button onClick={testDirectCall}>Probar fetch directo</Button>
        </div>
        {testStatus ? (
          <div style={{ marginTop: 8, fontFamily: 'monospace' }}>{testStatus}</div>
        ) : null}
        {testErr ? (
          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', background:'#111827', color:'#e5e7eb', padding:12, borderRadius:8 }}>
            {testErr}
          </pre>
        ) : null}
        {testResp ? (
          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', background:'#111827', color:'#e5e7eb', padding:12, borderRadius:8 }}>
            {JSON.stringify(testResp, null, 2)}
          </pre>
        ) : null}
      </div>
    </div>
  )
}


