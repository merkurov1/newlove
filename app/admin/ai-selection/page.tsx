'use client'
import { useState } from 'react'

export default function CuratorTool() {
  const [input, setInput] = useState({ 
    artist: '', 
    title: '', 
    link: '', 
    raw: '', 
    image_url: '', 
    specs: {
      medium: '',
      dimensions: '',
      estimate: '',
      date: '',
      provenance: ''
    }
  })
  const [output, setOutput] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoProcessing, setAutoProcessing] = useState(false)
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

      if (data.extracted) {
        setOutput(data.extracted)
      }

      const bestImage = data.image_url || data.extracted?.ogData?.image || ''
      const bestTitle = data.title || data.extracted?.ogData?.title || data.extracted?.h1 || ''
      const bestArtist = data.artist || ''

      const parsedSpecs = {
        medium: data.medium || data.extracted?.medium || '',
        dimensions: data.dimensions || data.extracted?.dimensions || '',
        estimate: data.estimate || data.extracted?.estimate || '',
        date: data.date || data.extracted?.date || '',
        provenance: data.provenance || data.extracted?.provenance || ''
      }

      setInput(prev => ({
        ...prev,
        artist: bestArtist || prev.artist,
        title: bestTitle || prev.title,
        image_url: bestImage || prev.image_url,
        specs: parsedSpecs,
        raw: JSON.stringify(data.extracted || data, null, 2)
      }))

      addLog(`Parse complete. Extracted image: ${bestImage ? 'YES' : 'NO'}`)
      return { bestArtist, bestTitle, bestImage, parsedSpecs, rawData: JSON.stringify(data.extracted || data) }

    } catch (e: any) { 
      console.error(e)
      addLog(`PARSE ERROR: ${e.message}`)
      alert(`Parse failed: ${e.message}`) 
      return null
    } finally { 
      setParsing(false) 
    }
  }

  // 2. ГЕНЕРАЦИЯ ОПИСАНИЯ ЧЕРЕЗ OPENROUTER AI
  const generate = async (customInput?: typeof input) => {
    const currentInput = customInput || input
    setLoading(true)
    addLog('Synthesizing lot assets via OpenRouter AI...')
    try {
      const res = await fetch('/api/admin/generate_lot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist: currentInput.artist,
          title: currentInput.title,
          link: currentInput.link,
          rawData: currentInput.raw,
          specs: currentInput.specs
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.details || data.error || 'Generation failed')

      setOutput(data)
      addLog('AI Synthesis completed successfully.')
      return data
    } catch (e: any) { 
      addLog(`GEN ERROR: ${e.message}`)
      alert(`Generation failed: ${e.message}`) 
      return null
    } finally { 
      setLoading(false) 
    }
  }

  // 3. СОХРАНЕНИЕ В БАЗУ ДАННЫХ (VAULT / SUPABASE)
  const saveToVault = async (aiContentData?: any) => {
    const contentToSave = aiContentData || output
    if (!contentToSave) return alert('Generate or parse content first')
    setSaving(true)
    addLog('Saving lot to vault (Supabase)...')
    try {
      const res = await fetch('/api/admin/save-lot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist: input.artist,
          title: input.title,
          link: input.link,
          image_url: input.image_url,
          raw: input.raw,
          ...input.specs,
          ai_content: contentToSave
        })
      })

      const data = await res.json()
      if (data.success || data.id) {
        addLog(`Vault saved successfully. Lot ID: ${data.id || data.data?.id}`)
        alert(`Lot Saved! ID: ${data.id || data.data?.id}`)
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

  // 4. ОБЪЕДИНЕННАЯ КОМАНДА: ПАРСИНГ -> AI -> СОХРАНЕНИЕ В 1 КЛИК
  const handleOneClickPipeline = async () => {
    if (!input.link) return alert('Paste auction link first')
    setAutoProcessing(true)
    addLog('--- STARTING AUTOMATED ONE-CLICK PIPELINE ---')
    
    // Step 1: Parse
    const parseResult = await handleAutoParse()
    if (!parseResult) {
      setAutoProcessing(false)
      return
    }

    // Step 2: AI Synthesis
    const aiResult = await generate()
    if (!aiResult) {
      setAutoProcessing(false)
      return
    }

    // Step 3: Save to Vault
    await saveToVault(aiResult)
    addLog('--- AUTOMATED PIPELINE FINISHED ---')
    setAutoProcessing(false)
  }

  return (
    <div className="min-h-screen bg-black text-white font-mono p-8 grid md:grid-cols-2 gap-8">
      {/* ЛЕВАЯ КОЛОНКА: ВВОД ДАННЫХ И УПРАВЛЕНИЕ */}
      <div className="space-y-6 border-r border-gray-800 pr-8">
        <div className="flex justify-between items-center">
          <h1 className="text-xl tracking-widest text-gray-500">THE CURATOR ENGINE</h1>
          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-1 rounded">NEXT.JS + SUPABASE</span>
        </div>
        
        {/* URL Input & Quick Actions */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <input 
              placeholder="Auction URL (Christie's, Sotheby's...)" 
              className="w-full bg-zinc-900 p-3 border border-gray-700 text-sm focus:border-white outline-none"
              value={input.link}
              onChange={e => setInput({...input, link: e.target.value})}
            />
            <button 
              onClick={handleAutoParse} 
              disabled={parsing || autoProcessing} 
              className="bg-blue-900 px-5 text-xs font-bold hover:bg-blue-800 transition disabled:opacity-50 shrink-0"
            >
              {parsing ? '...' : 'PARSE'}
            </button>
          </div>

          {/* Кнопка Полного Автомата */}
          <button
            onClick={handleOneClickPipeline}
            disabled={parsing || loading || saving || autoProcessing}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 text-xs tracking-wider transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {autoProcessing ? '⚡ RUNNING PIPELINE...' : '⚡ AUTO-PARSE, GENERATE & SAVE TO VAULT'}
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

        {/* ИЗОБРАЖЕНИЕ URL (ручное редактирование если понадобится) */}
        <input 
          placeholder="Image URL" 
          className="w-full bg-zinc-900 p-2 border border-gray-800 text-xs text-zinc-400 focus:text-white" 
          value={input.image_url} 
          onChange={e => {
            setImgError(false)
            setInput({...input, image_url: e.target.value})
          }} 
        />

        {/* ОСНОВНЫЕ ПОЛЯ */}
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

        {/* СПЕЦИФИКАЦИИ ЛОТА */}
        <div className="grid grid-cols-3 gap-2">
          <input 
            placeholder="Medium" 
            className="bg-zinc-900 p-2 border border-gray-800 text-xs" 
            value={input.specs.medium} 
            onChange={e => setInput({...input, specs: {...input.specs, medium: e.target.value}})} 
          />
          <input 
            placeholder="Dimensions" 
            className="bg-zinc-900 p-2 border border-gray-800 text-xs" 
            value={input.specs.dimensions} 
            onChange={e => setInput({...input, specs: {...input.specs, dimensions: e.target.value}})} 
          />
          <input 
            placeholder="Estimate" 
            className="bg-zinc-900 p-2 border border-gray-800 text-xs" 
            value={input.specs.estimate} 
            onChange={e => setInput({...input, specs: {...input.specs, estimate: e.target.value}})} 
          />
        </div>
        
        <textarea 
          placeholder="Raw HTML / Extracted JSON Dump..." 
          className="w-full h-32 bg-zinc-900 p-3 border border-gray-700 text-xs font-mono" 
          value={input.raw} 
          onChange={e => setInput({...input, raw: e.target.value})} 
        />
        
        <button 
          onClick={() => generate()} 
          disabled={loading || autoProcessing} 
          className="w-full bg-white text-black py-3 hover:bg-gray-200 font-bold transition disabled:opacity-50"
        >
          {loading ? 'SYNTHESIZING WITH AI...' : 'GENERATE ASSETS (AI)'}
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
            <div className="border border-green-900/50 p-4 bg-green-900/10 sticky top-0 backdrop-blur z-10">
              <button 
                onClick={() => saveToVault()} 
                disabled={saving || autoProcessing}
                className="w-full bg-green-700 text-white py-3 tracking-widest hover:bg-green-600 transition flex justify-center items-center gap-2 font-bold disabled:opacity-50"
              >
                {saving ? 'ENCRYPTING & SAVING...' : '💾 SAVE TO VAULT (SUPABASE)'}
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
            Insert URL and press PARSE or AUTO-PARSE to process lot
          </div>
        )}
      </div>
    </div>
  )
}
