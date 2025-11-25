'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Инициализация Supabase клиента на фронте (убедись, что переменные среды есть)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function MonitorPage() {
  const [artist, setArtist] = useState('Sergey Merkurov');
  const [logs, setLogs] = useState<string[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  // 1. ПОИСК ССЫЛОК
  const scanMarket = async () => {
    setLoading(true);
    addLog(`Starting scan for: ${artist}...`);
    setLinks([]);

    try {
      const res = await fetch('/api/monitor/search', {
        method: 'POST',
        body: JSON.stringify({ artist }),
      });
      const data = await res.json();

      if (data.links && data.links.length > 0) {
        setLinks(data.links);
        addLog(`Found ${data.links.length} potential lots.`);
      } else {
        addLog('No lots found via Jina/Gemini.');
      }
    } catch (e) {
      addLog('Error during scan.');
    }
    setLoading(false);
  };

  // 2. ПАРСИНГ И СОХРАНЕНИЕ (Цикл)
  const importAll = async () => {
    setLoading(true);
    addLog(`Starting batch import of ${links.length} items...`);

    for (const link of links) {
      addLog(`Processing: ${link}...`);
      
      try {
        // А. Парсим данные через твой AI Parser
        const parseRes = await fetch('/api/parse', {
          method: 'POST',
          body: JSON.stringify({ url: link }),
        });
        
        if (!parseRes.ok) {
            addLog(`❌ Failed to parse: ${link}`);
            continue;
        }

        const lotData = await parseRes.json();
        
        // Б. Сохраняем в Supabase
        // Проверка на дубликат по source_url уже есть в базе (UNIQUE), но обработаем ошибку
        const { error } = await supabase
          .from('lots')
          .insert([{
            artist: lotData.artist,
            title: lotData.title,
            description: lotData.provenance_summary, // Используем summary как описание
            source_url: lotData.source_url,
            image_url: lotData.image_url,
            medium: lotData.medium,
            estimate_low: lotData.estimate_low,
            estimate_high: lotData.estimate_high,
            currency: lotData.currency,
            auction_date: lotData.auction_date,
            auction_house: lotData.auction_house,
            ai_analysis: JSON.stringify(lotData) // Сохраняем сырой JSON про запас
          }]);

        if (error) {
            if (error.code === '23505') { // Код уникальности Postgres
                addLog(`⚠️ Already exists: ${lotData.title}`);
            } else {
                addLog(`❌ DB Error: ${error.message}`);
            }
        } else {
            addLog(`✅ SAVED: ${lotData.title} (${lotData.estimate_low || '?'} ${lotData.currency})`);
        }

      } catch (e) {
        addLog(`❌ System Error on ${link}`);
      }
      
      // Пауза 1 сек, чтобы не убить API
      await new Promise(r => setTimeout(r, 1000));
    }
    
    setLoading(false);
    addLog('Batch import finished.');
  };

  return (
    <div className="p-10 bg-black min-h-screen text-gray-200 font-mono">
      <h1 className="text-2xl mb-6 text-white border-b border-gray-800 pb-2">THE WATCHTOWER // MONITOR</h1>
      
      <div className="flex gap-4 mb-8">
        <input 
          type="text" 
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          className="bg-gray-900 border border-gray-700 p-2 w-64 text-white focus:outline-none focus:border-red-500"
        />
        <button 
          onClick={scanMarket} 
          disabled={loading}
          className="bg-white text-black px-6 py-2 hover:bg-gray-200 disabled:opacity-50 font-bold uppercase"
        >
          {loading ? 'Scanning...' : '1. Scan Market'}
        </button>

        {links.length > 0 && (
             <button 
             onClick={importAll} 
             disabled={loading}
             className="bg-red-600 text-white px-6 py-2 hover:bg-red-700 disabled:opacity-50 font-bold uppercase"
           >
             2. Import to Granite ({links.length})
           </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-10">
        {/* FOUND LINKS */}
        <div>
            <h3 className="text-gray-500 mb-2 uppercase text-xs">Targets Detected</h3>
            <div className="bg-gray-900 p-4 h-96 overflow-y-auto text-xs border border-gray-800">
                {links.map((l, i) => (
                    <div key={i} className="mb-1 truncate hover:text-white cursor-pointer" title={l}>
                        {l}
                    </div>
                ))}
                {links.length === 0 && <span className="text-gray-600">Void. Waiting for scan.</span>}
            </div>
        </div>

        {/* LOGS */}
        <div>
            <h3 className="text-gray-500 mb-2 uppercase text-xs">System Logs</h3>
            <div className="bg-gray-900 p-4 h-96 overflow-y-auto text-xs border border-gray-800 font-mono">
                {logs.map((log, i) => (
                    <div key={i} className={`mb-1 ${log.includes('✅') ? 'text-green-400' : log.includes('❌') ? 'text-red-400' : log.includes('⚠️') ? 'text-yellow-500' : 'text-gray-400'}`}>
                        {log}
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
}