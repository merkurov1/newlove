'use client'
import { useState } from 'react'

export default function CuratorTool() {
  const [input, setInput] = useState({ artist: '', title: '', link: '', raw: '', image_url: '', specs: {} as any })
  const [output, setOutput] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString()
    setLogs(prev => [`[${time}] ${msg}`, ...prev])
  }

  // 1. ПАРСИНГ
  const handleAutoParse = async () => {
    if (!input.link) return alert('Paste link')
    setParsing(true)
    setImgError(false)
    addLog(`Initiating parse for: ${input.link}`)

    try {
      const res = await fetch('/api/admin/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input.link })
      })
      
      const data = await res.json()
      console.log('[Parser Response]:', data)
      addLog(`Server responded with status ${res.status}`)

      if (!res.ok) {
        throw new Error(data.details || data.error || 'Parse failed on server')
      }

      addLog(`HTML Parsed. Length: ${data.rawLength || 0} chars. Image: ${data.image_url ? 'FOUND' : 'NOT FOUND'}`)

      setInput(prev => ({
        ...prev,
        artist: data.artist || prev.artist,
        title: data.title || prev.title,
        image_url: data.image_url || data.imageUrl || '',
        specs: {
          medium: data.medium || '',
          dimensions: data.dimensions || '',
          estimate: data.estimate || '',
          date: data.date || '',
          provenance: data.provenance || ''
        },
        raw: `Medium: ${data.medium || 'N/A'}\nDimensions: ${data.dimensions || 'N/A'}\nEstimate: ${data.estimate || 'N/A'}\nDate: ${data.date || 'N/A'}\n\nProvenance:\n${data.provenance || 'N/A'}\n\nOriginal Description:\n${data.raw_description || 'N/A'}`
      }))
    } catch (e: any) { 
      console.error(e)
      addLog(`ERROR: ${e.message}`)
      alert(`Parse failed: ${e.message}`) 
    } finally { 
      setParsing(false) 
    }
  }

  // 2. ГЕНЕРАЦИЯ
  const generate = async () => {
    setLoading(true)
    addLog('Synthesizing lot assets via AI...')
    try {
      const res = await fetch('/api/admin/generate_lot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist: input.artist,
          title: input.title,
          link: input.link,
          rawData: input.raw
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.details || data.error || 'Gen failed')
      setOutput(data)
      addLog('Assets synthesized successfully')
    } catch (e: any) { 
      addLog(`GEN ERROR: ${e.message}`)
      alert(`Gen failed: ${e.message}`) 
    } finally { 
      setLoading(false) 
    }
  }

  // 3. СОХРАНЕНИЕ
  const saveToVault = async () => {
    if (!output) return alert('Generate content first')
    setSaving(true)
    addLog('Saving lot to vault...')
    try {
      const res = await fetch('/api/admin/save-lot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          ...input.specs,
          ai_content: output
        })
      })
      const data = await res.json()
      if (data.success) {
        addLog(`Vault confirmation received. ID: ${data.id}`)
        alert(`Lot Saved! ID: ${data.id}`)
      } else {
        throw new Error(data.error || 'API Error')
      }
    } catch (e: any) {
      addLog(`SAVE ERROR: ${e.message}`)
      alert('Save Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white font-mono p-8 grid md:grid-cols-2 gap-8">
      {/* ЛЕВАЯ КОЛОНКА */}
      <div className="space-y-6 border-r border-gray-800 pr-8">
        <h1 className="text-xl tracking-widest text-gray-500">THE CURATOR ENGINE</h1>
        
        <div className="flex gap-2">
          <input 
            placeholder="Auction URL" 
            className="w-full bg-zinc-900 p-3 border border-gray-700 text-sm focus:border-white outline-none"
            value={input.link}
            onChange={e => setInput({...input, link: e.target.value})}
          />
          <button 
            onClick={handleAutoParse} 
            disabled={parsing} 
            className="bg-blue-900 px-6 text-xs font-bold hover:bg-blue-800 transition disabled:opacity-50"
          >
            {parsing ? '...' : 'PARSE'}
          </button>
        </div>

        {/* ПРЕДПРОСМОТР КАРТИНКИ */}
        {input.image_url && !imgError && (
          <div className="relative h-48 w-full bg-zinc-900 border border-gray-800 overflow-hidden flex items-center justify-center">
            <img 
              src={input.image_url} 
              className="object-contain max-h-full max-w-full opacity-90" 
              alt="Preview" 
              onError={() => {
                setImgError(true)
                addLog('Image failed to load in browser due to CORS or broken URL')
              }}
            />
            <div className="absolute bottom-0 right-0 bg-black/80 text-xs px-2 py-1 text-green-500 border-t border-l border-gray-800">IMAGE LOADED</div>
          </div>
        )}

        {imgError && (
          <div className="h-20 w-full bg-zinc-900 border border-red-900/50 flex items-center justify-center text-red-400 text-xs">
            ⚠️ IMAGE FAILED TO LOAD (CORS OR BROKEN URL)
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <input placeholder="Artist" className="bg-zinc-900 p-3 border border-gray-700 text-sm" value={input.artist} onChange={e => setInput({...input, artist: e.target.value})} />
          <input placeholder="Title" className="bg-zinc-900 p-3 border border-gray-700 text-sm" value={input.title} onChange={e => setInput({...input, title: e.target.value})} />
        </div>
        
        <textarea placeholder="Raw Data..." className="w-full h-40 bg-zinc-900 p-3 border border-gray-700 text-xs" value={input.raw} onChange={e => setInput({...input, raw: e.target.value})} />
        
        <button onClick={generate} disabled={loading} className="w-full bg-white text-black py-3 hover:bg-gray-200 font-bold transition">
          {loading ? 'SYNTHESIZING...' : 'GENERATE ASSETS'}
        </button>

        {/* ЛОГ-КОНСОЛЬ */}
        <div className="bg-zinc-950 border border-zinc-800 p-3 text-[10px] space-y-1 h-32 overflow-y-auto">
          <div className="text-zinc-500 font-bold mb-1 border-b border-zinc-900 pb-1">CONSOLE LOGS:</div>
          {logs.length === 0 ? <div className="text-zinc-700">System ready...</div> : logs.map((l, i) => (
            <div key={i} className="text-zinc-400 font-mono leading-tight">{l}</div>
          ))}
        </div>
      </div>

      {/* ПРАВАЯ КОЛОНКА */}
      <div className="space-y-8 overflow-y-auto h-screen pb-20">
        {output && (
          <>
            <div className="border border-green-900/50 p-4 bg-green-900/10">
              <button 
                onClick={saveToVault} 
                disabled={saving}
                className="w-full bg-green-700 text-white py-3 tracking-widest hover:bg-green-600 transition flex justify-center items-center gap-2 font-bold"
              >
                {saving ? 'ENCRYPTING...' : '💾 SAVE TO VAULT'}
              </button>
            </div>

            <div className="border border-gray-800 p-6 bg-zinc-900/30">
              <h3 className="text-green-500 text-xs mb-4">AI SYNTHESIS OUTPUT</h3>
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap border border-zinc-800 p-4 bg-black">
                {JSON.stringify(output, null, 2)}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
