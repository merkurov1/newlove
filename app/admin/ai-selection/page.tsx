'use client'
import { useState } from 'react'

export default function CuratorTool() {
  const [input, setInput] = useState({ artist: '', title: '', link: '', raw: '' })
  const [output, setOutput] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [parsing, setParsing] = useState(false) // Состояние парсинга

  // ФУНКЦИЯ ПАРСИНГА URL
  const handleAutoParse = async () => {
    if (!input.link) {
        alert('Paste a link first')
        return
    }
    setParsing(true)
    try {
        const res = await fetch('/api/admin/parse-url', {
            method: 'POST',
            body: JSON.stringify({ url: input.link })
        })
        
        if (!res.ok) throw new Error('Failed to parse')

        const data = await res.json()
        
        // Автозаполнение полей
        setInput(prev => ({
            ...prev,
            artist: data.artist || prev.artist,
            title: data.title || prev.title,
            raw: `Medium: ${data.medium}\nDimensions: ${data.dimensions}\nEstimate: ${data.estimate}\n\nProvenance:\n${data.provenance}\n\nEssay:\n${data.raw_description}`
        }))
    } catch (e) {
        alert('Auto-parse failed. Cloudflare might be blocking. Fill manually.')
    } finally {
        setParsing(false)
    }
  }

  const generate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/generate-lot', {
        method: 'POST',
        body: JSON.stringify({
            artist: input.artist,
            title: input.title,
            link: input.link,
            rawText: input.raw
        })
      })
      const data = await res.json()
      setOutput(data)
    } catch (e) {
      alert('Generation Error')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Copied!')
  }

  return (
    <div className="min-h-screen bg-black text-white font-mono p-8 grid md:grid-cols-2 gap-8">
      
      {/* INPUT COLUMN */}
      <div className="space-y-6 border-r border-gray-800 pr-8">
        <div className="flex justify-between items-center">
             <h1 className="text-xl tracking-widest text-gray-500">THE CURATOR ENGINE</h1>
             <div className="text-xs text-gray-600">v.2.0 + Parser</div>
        </div>
        
        {/* LINK + PARSER */}
        <div className="flex gap-2">
            <input 
              placeholder="Paste Auction URL..." 
              className="w-full bg-zinc-900 p-3 border border-gray-700 outline-none focus:border-white transition-colors"
              value={input.link}
              onChange={e => setInput({...input, link: e.target.value})}
            />
            <button 
                onClick={handleAutoParse}
                disabled={parsing || !input.link}
                className="bg-blue-900 text-white px-4 text-xs uppercase tracking-widest hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
            >
                {parsing ? 'Hacking...' : '✨ Parse URL'}
            </button>
        </div>

        <input 
          placeholder="Artist Name" 
          className="w-full bg-zinc-900 p-3 border border-gray-700 outline-none"
          value={input.artist}
          onChange={e => setInput({...input, artist: e.target.value})}
        />
        <input 
          placeholder="Artwork Title" 
          className="w-full bg-zinc-900 p-3 border border-gray-700 outline-none"
          value={input.title}
          onChange={e => setInput({...input, title: e.target.value})}
        />
        
        <textarea 
          placeholder="Raw Data (Auto-filled or Paste manually)..." 
          className="w-full h-96 bg-zinc-900 p-3 border border-gray-700 outline-none text-xs leading-relaxed"
          value={input.raw}
          onChange={e => setInput({...input, raw: e.target.value})}
        />
        
        <button 
            onClick={generate}
            disabled={loading}
            className="w-full bg-white text-black py-4 hover:bg-gray-200 uppercase tracking-widest font-bold"
        >
            {loading ? 'Synthesizing...' : 'GENERATE ASSETS'}
        </button>
      </div>

      {/* OUTPUT COLUMN */}
      <div className="space-y-8 overflow-y-auto h-screen pb-20">
        {output && (
            <>
                {/* WEBSITE BLOCK */}
                <div className="border border-gray-800 p-6 bg-zinc-900/30">
                    <div className="flex justify-between mb-4 items-center">
                        <h3 className="text-green-500 text-xs uppercase tracking-widest">Website Content</h3>
                        <button onClick={() => copyToClipboard(output.website.curator_note + '\n\n' + output.website.specs)} className="text-xs border border-gray-600 px-2 py-1 hover:bg-white hover:text-black">COPY ALL</button>
                    </div>
                    <div className="space-y-4 text-sm text-gray-300 font-serif">
                        <p className="whitespace-pre-wrap">{output.website.curator_note}</p>
                        <div className="h-px bg-gray-700 my-4"></div>
                        <pre className="whitespace-pre-wrap font-mono text-xs text-gray-400">{output.website.specs}</pre>
                    </div>
                </div>

                {/* TELEGRAM BLOCK */}
                <div className="border border-gray-800 p-6 bg-zinc-900/30">
                    <div className="flex justify-between mb-4 items-center">
                        <h3 className="text-blue-400 text-xs uppercase tracking-widest">Telegram (Controller Bot)</h3>
                        <button onClick={() => copyToClipboard(output.telegram)} className="text-xs border border-gray-600 px-2 py-1 hover:bg-white hover:text-black">COPY MD</button>
                    </div>
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-black p-4 border border-gray-800 overflow-x-auto">
                        {output.telegram}
                    </pre>
                </div>

                {/* SOCIALS BLOCK */}
                <div className="border border-gray-800 p-6 bg-zinc-900/30">
                    <div className="flex justify-between mb-4 items-center">
                        <h3 className="text-pink-500 text-xs uppercase tracking-widest">Socials</h3>
                        <button onClick={() => copyToClipboard(output.socials)} className="text-xs border border-gray-600 px-2 py-1 hover:bg-white hover:text-black">COPY</button>
                    </div>
                    <p className="text-sm text-gray-300">{output.socials}</p>
                </div>
            </>
        )}
      </div>
    </div>
  )
}