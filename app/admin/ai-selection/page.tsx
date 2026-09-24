'use client'
import { useState } from 'react'

export default function CuratorTool() {
  const [input, setInput] = useState({ 
    artist: '', 
    title: '', 
    link: '', 
    raw: '', 
    image_url: '', 
    specs: {} as any 
  })
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

  // 1. ПАРСИНГ И РАЗБОР HTML / JSON-LD
  const handleAutoParse = async () => {
    if (!input.link) return alert('Paste auction link first')
    setParsing(true)
    setImgError(false)
    addLog(`Initiating ScrapingAnt fetch for: ${input.link}`)

    try {
      const res = await fetch('/api/admin/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input.link })
      })

      const data = await res.json()
      addLog(`Server response code: ${res.status}`)

      if (!res.ok) {
        throw new Error(data.details || data.error || 'Parse failed on server')
      }

      addLog(`HTML received (${data.rawLength || 0} chars). Processing structured data...`)

      // Сохраняем извлечённые структурированные данные (OG Data + JSON-LD) в output для анализа
      if (data.extracted) {
        setOutput(data.extracted)
      }

      // Вытаскиваем наилучшие совпадения из ответа
      const bestImage = data.image_url || data.extracted?.ogData?.image || ''
      const bestTitle = data.title || data.extracted?.ogData?.title || data.extracted?.h1 || ''
      const bestArtist = data.artist || ''

      setInput(prev => ({
        ...prev,
        artist: bestArtist || prev.artist,
        title: bestTitle || prev.title,
        image_url: bestImage || prev.image_url,
        specs: {
          medium: data.medium || '',
          dimensions: data.dimensions || '',
          estimate: data.estimate || '',
          date: data.date || '',
          provenance: data.provenance || ''
        },
        raw: JSON.stringify(data.extracted || data, null, 2)
      }))

      addLog(`Parse complete. Extracted image: ${bestImage ? 'YES' : 'NO'}`)

    } catch (e: any) { 
      console.error(e)
      addLog(`PARSE ERROR: ${e.message}`)
      alert(`Parse failed: ${e.message}`) 
    } finally { 
      setParsing(false) 
    }
  }

  // 2. ГЕНЕРАЦИЯ ОПИСАНИЯ ЧЕРЕЗ OPENROUTER AI
  const generate = async () => {
    setLoading(true)
    addLog('Synthesizing lot assets via OpenRouter AI...')
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
      if (!res.ok) throw new Error(data.details || data.error || 'Generation failed')

      setOutput(data)
      addLog('AI Synthesis completed successfully.')
    } catch (e: any) { 
      addLog(`GEN ERROR: ${e.message}`)
      alert(`Generation failed: ${e.message}`) 
    } finally { 
      setLoading(false) 
    }
  }

  // 3. СОХРАНЕНИЕ В БАЗУ ДАННЫХ (VAULT)
  const saveToVault = async () => {
    if (!output) return alert('Generate or parse content first')
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
        addLog(`Vault saved successfully. Lot ID: ${data.id}`)
        alert(`Lot Saved! ID: ${data.id}`)
      } else {
        throw new Error(data.error || 'API Error during save')
      }
    } catch (e: any) {
      addLog(`SAVE ERROR: ${e.message}`)
      alert(`Save Failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white font-mono p-8 grid md:grid-cols-2 gap-8">
      {/* ЛЕВАЯ КОЛОНКА: ВВОД ДАННЫХ И УПРАВЛЕНИЕ */}
      <div className="space-y-6 border-r border-gray-800 pr-8">
        <h1 className="text-xl tracking-widest text-gray-500">THE CURATOR ENGINE</h1>
        
        <div className="flex gap-2">
          <input 
            placeholder="Auction URL (Christie's, Sotheby's...)" 
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
          <div className="relative h-56 w-full bg-zinc-900 border border-gray-800 overflow-hidden flex items-center justify-center">
            <img 
              src={input.image_url} 
              className="object-contain max-h-full max-w-full opacity-90" 
              alt="Lot Preview" 
              onError={() => {
                setImgError(true)
                addLog('Image load failed due to CORS or direct hotlink restriction')
              }}
            />
            <div className="absolute bottom-0 right-0 bg-black/80 text-xs px-2 py-1 text-green-500 border-t border-l border-gray-800">
              IMAGE LOADED
            </div>
          </div>
        )}

        {imgError && (
          <div className="h-20 w-full bg-zinc-900 border border-red-900/50 flex items-center justify-center text-red-400 text-xs p-4 text-center">
            ⚠️ IMAGE FAILED TO LOAD IN BROWSER (CORS / BROKEN URL)
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <input 
            placeholder="Artist" 
            className="bg-zinc-900 p-3 border border-gray-700 text-sm" 
            value={input.artist} 
            onChange={e => setInput({...input, artist: e.target.value})} 
          />
          <input 
            placeholder="Title" 
            className="bg-zinc-900 p-3 border border-gray-700 text-sm" 
            value={input.title} 
            onChange={e => setInput({...input, title: e.target.value})} 
          />
        </div>
        
        <textarea 
          placeholder="Raw HTML / Extracted JSON Dump..." 
          className="w-full h-44 bg-zinc-900 p-3 border border-gray-700 text-xs font-mono" 
          value={input.raw} 
          onChange={e => setInput({...input, raw: e.target.value})} 
        />
        
        <button 
          onClick={generate} 
          disabled={loading} 
          className="w-full bg-white text-black py-3 hover:bg-gray-200 font-bold transition disabled:opacity-50"
        >
          {loading ? 'SYNTHESIZING WITH AI...' : 'GENERATE ASSETS'}
        </button>

        {/* ТЕРМИНАЛЬНЫЕ ЛОГИ */}
        <div className="bg-zinc-950 border border-zinc-800 p-3 text-[10px] space-y-1 h-36 overflow-y-auto">
          <div className="text-zinc-500 font-bold mb-1 border-b border-zinc-900 pb-1">CONSOLE LOGS:</div>
          {logs.length === 0 ? (
            <div className="text-zinc-700">Ready to parse lot...</div>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="text-zinc-400 font-mono leading-tight">{l}</div>
            ))
          )}
        </div>
      </div>

      {/* ПРАВАЯ КОЛОНКА: ИНСПЕКЦИЯ ДАННЫХ И AI РЕЗУЛЬТАТ */}
      <div className="space-y-6 overflow-y-auto h-screen pb-20 pr-4">
        {output ? (
          <>
            <div className="border border-green-900/50 p-4 bg-green-900/10">
              <button 
                onClick={saveToVault} 
                disabled={saving}
                className="w-full bg-green-700 text-white py-3 tracking-widest hover:bg-green-600 transition flex justify-center items-center gap-2 font-bold disabled:opacity-50"
              >
                {saving ? 'ENCRYPTING...' : '💾 SAVE TO VAULT'}
              </button>
            </div>

            <div className="border border-gray-800 p-6 bg-zinc-900/30 space-y-4">
              <h3 className="text-green-500 text-xs font-bold tracking-wider">STRUCTURED DATA / AI OUTPUT</h3>
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap border border-zinc-800 p-4 bg-black overflow-x-auto max-h-[600px]">
                {JSON.stringify(output, null, 2)}
              </pre>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center border border-dashed border-zinc-800 text-zinc-600 text-xs">
            Insert URL and press PARSE to inspect raw page structure or AI synthesis
          </div>
        )}
      </div>
    </div>
  )
}
