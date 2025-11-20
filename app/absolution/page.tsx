'use client';

import { useState, useEffect } from 'react';
import Script from 'next/script';

// Language translations
const TRANSLATIONS = {
  en: {
    title: "CONFESS YOUR DIGITAL SINS",
    namePlaceholder: "Enter your Name",
    button: "SEEK ABSOLUTION",
    loading: "Negotiating with Eternity...",
    sins: {
      doomscroll: "Doomscrolling past 3 AM",
      envy: "Envying a stranger's life on Instagram",
      crypto: "Checking crypto portfolio 50 times a day",
      ai: "Using AI to write personal messages",
      hoarding: "Hoarding digital trash (tabs & screenshots)",
      vanity: "Vanity: Googling my own name",
      wrath: "Wrath: Fighting in comment sections",
      other: "Other..."
    },
    receipt: {
      header: "DEPT. OF KARMA",
      sinner: "SINNER:",
      verdict: "VERDICT:",
      verdictValue: "FORGIVEN",
      footer: "Noise is temporary. Silence is forever.",
      signature: "Pierrot, AI Chaplain."
    },
    actions: {
      save: "SAVE",
      share: "SHARE",
      donate: "DONATE"
    }
  },
  ru: {
    title: "ИСПОВЕДАЙСЯ В ЦИФРОВЫХ ГРЕХАХ",
    namePlaceholder: "Введите ваше имя",
    button: "ПОЛУЧИТЬ ОТПУЩЕНИЕ",
    loading: "Договариваемся с Вечностью...",
    sins: {
      doomscroll: "Думскроллинг после 3 ночи",
      envy: "Зависть к чужой жизни в Instagram",
      crypto: "Одержимость курсом крипты",
      ai: "Использование AI для личных писем",
      hoarding: "Накопление цифрового мусора (вкладки)",
      vanity: "Тщеславие: Гуглил свое имя",
      wrath: "Гнев: Срач в комментариях",
      other: "Другое..."
    },
    receipt: {
      header: "ДЕПАРТАМЕНТ КАРМЫ",
      sinner: "ГРЕШНИК:",
      verdict: "ВЕРДИКТ:",
      verdictValue: "ПРОЩЕН",
      footer: "Шум временен. Тишина вечна.",
      signature: "Pierrot, AI Chaplain."
    },
    actions: {
      save: "СОХРАНИТЬ",
      share: "ПОДЕЛИТЬСЯ",
      donate: "ПОДДЕРЖАТЬ"
    }
  },
  lat: {
    title: "CONFITERE PECCATA DIGITALIA",
    namePlaceholder: "Nomen Tuum",
    button: "ABSOLUTIONEM PETERE",
    loading: "Cum Aeternitate Agimus...",
    sins: {
      doomscroll: "Scrollex Infinitus Nocturnus",
      envy: "Invidia Vitae Digitalis",
      crypto: "Obsessio Pecuniae Virtualis",
      ai: "Scriptura Artificialis Sine Anima",
      hoarding: "Avaritia Datae Inutilis",
      vanity: "Vanitas Egoismus in Search",
      wrath: "Ira in Commentariis",
      other: "Aliud..."
    },
    receipt: {
      header: "DEPARTAMENTUM KARMAE",
      sinner: "PECCATOR:",
      verdict: "JUDICIUM:",
      verdictValue: "ABSOLVO",
      footer: "Strepitus temporalis est. Silentium aeternum.",
      signature: "Pierrot, AI Chaplain."
    },
    actions: {
      save: "SALVARE",
      share: "COMMUNICARE",
      donate: "DONARE"
    }
  }
};

const STAMP_HIT_TIME = 1200; // Time when stamp hits the paper

export default function AbsolutionPage() {
  const [lang, setLang] = useState<'en' | 'ru' | 'lat'>('en');
  const [state, setState] = useState<'confess' | 'purgatory' | 'ritual' | 'complete'>('confess');
  const [name, setName] = useState('');
  const [selectedSin, setSelectedSin] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [ticketId, setTicketId] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [showStamp, setShowStamp] = useState(false);
  const [shake, setShake] = useState(false);
  const [html2canvasLoaded, setHtml2canvasLoaded] = useState(false);

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    // Generate ticket ID and date
    setTicketId(`#${Math.random().toString(36).substr(2, 9).toUpperCase()}`);
    setDateStr(new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    }));
  }, []);

  const handleSubmit = () => {
    if (!name.trim() || !selectedSin) return;
    
    // State 2: Purgatory
    setState('purgatory');
    
    // After 4 seconds -> State 3: Ritual
    setTimeout(() => {
      setState('ritual');
      
      // Trigger stamp animation sync
      setTimeout(() => {
        setShake(true);
        setShowStamp(true);
        
        // Stop shake after 300ms
        setTimeout(() => {
          setShake(false);
          setState('complete');
        }, 300);
      }, STAMP_HIT_TIME);
    }, 4000);
  };

  const handleSave = async () => {
    if (!html2canvasLoaded || typeof window === 'undefined') return;
    
    const receipt = document.getElementById('receipt');
    if (!receipt) return;

    try {
      // @ts-ignore
      const canvas = await html2canvas(receipt, {
        backgroundColor: '#f4f4f4',
        scale: 2
      });
      
      const link = document.createElement('a');
      link.download = `absolution-${ticketId}.png`;
      link.href = canvas.toDataURL();
      link.click();
    } catch (e) {
      console.error('Save failed:', e);
    }
  };

  const handleShare = async () => {
    const text = `I received absolution for: ${selectedSin}`;
    const url = 'https://merkurov.love/absolution';
    
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Digital Absolution', text, url });
      } catch (e) {
        console.log('Share cancelled');
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(`${text}\n${url}`);
      alert('Link copied to clipboard!');
    }
  };

  const handleDonate = () => {
    window.open('mailto:merkurov@gmail.com?subject=Support%20Digital%20Absolution', '_blank');
  };

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"
        onLoad={() => setHtml2canvasLoaded(true)}
      />
      
      <div className="absolution-container">
        {/* Language Toggle */}
        <div className="lang-toggle">
          <button 
            className={lang === 'en' ? 'active' : ''} 
            onClick={() => setLang('en')}
          >
            EN
          </button>
          <span>|</span>
          <button 
            className={lang === 'ru' ? 'active' : ''} 
            onClick={() => setLang('ru')}
          >
            RU
          </button>
          <span>|</span>
          <button 
            className={lang === 'lat' ? 'active' : ''} 
            onClick={() => setLang('lat')}
          >
            LAT
          </button>
        </div>

        {/* State 1: Confessional */}
        {state === 'confess' && (
          <div className="confessional">
            <h1 className="title">{t.title}</h1>
            
            {/* Custom Dropdown */}
            <div className="custom-dropdown">
              <div 
                className="dropdown-selected"
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                {selectedSin || 'Select your sin...'}
              </div>
              {dropdownOpen && (
                <div className="dropdown-options">
                  {Object.entries(t.sins).map(([key, value]) => (
                    <div
                      key={key}
                      className="dropdown-option"
                      onClick={() => {
                        setSelectedSin(value);
                        setDropdownOpen(false);
                      }}
                    >
                      {value}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <input
              type="text"
              className="name-input"
              placeholder={t.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
            />

            <button
              className="submit-btn"
              onClick={handleSubmit}
              disabled={!name.trim() || !selectedSin}
            >
              {t.button}
            </button>
          </div>
        )}

        {/* State 2: Purgatory */}
        {state === 'purgatory' && (
          <div className="purgatory">
            <img 
              src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0945.gif" 
              alt="Angel washing"
              className="angel-animation"
            />
            <p className="loading-text">{t.loading}</p>
          </div>
        )}

        {/* State 3: Ritual */}
        {(state === 'ritual' || state === 'complete') && (
          <div className="ritual">
            <div className="ritual-content">
              {/* Receipt */}
              <div 
                id="receipt" 
                className={`receipt ${shake ? 'shake' : ''}`}
              >
                <div className="receipt-header">{t.receipt.header}</div>
                <div className="receipt-divider">━━━━━━━━━━━━━━━━━━━━</div>
                <div className="receipt-line">
                  <span>DATE:</span>
                  <span>{dateStr}</span>
                </div>
                <div className="receipt-line">
                  <span>TICKET:</span>
                  <span>{ticketId}</span>
                </div>
                <div className="receipt-divider">━━━━━━━━━━━━━━━━━━━━</div>
                <div className="receipt-section">
                  <div className="receipt-label">{t.receipt.sinner}</div>
                  <div className="receipt-value">{name}</div>
                </div>
                <div className="receipt-section">
                  <div className="receipt-label">SIN:</div>
                  <div className="receipt-value sin-text">{selectedSin}</div>
                </div>
                <div className="receipt-divider">━━━━━━━━━━━━━━━━━━━━</div>
                <div className="receipt-section verdict-section">
                  <div className="receipt-label">{t.receipt.verdict}</div>
                  <div className="receipt-value verdict-value">{t.receipt.verdictValue}</div>
                </div>
                <div className="receipt-divider">━━━━━━━━━━━━━━━━━━━━</div>
                <div className="receipt-footer">
                  <p className="footer-quote">{t.receipt.footer}</p>
                  <p className="footer-signature">{t.receipt.signature}</p>
                </div>

                {/* Stamp overlay */}
                {showStamp && (
                  <img 
                    src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0947.png"
                    alt="Stamp"
                    className="stamp-mark"
                  />
                )}
              </div>

              {/* Devil animation */}
              <div className="devil-container">
                <img 
                  src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0946.gif"
                  alt="Devil stamp"
                  className="devil-animation"
                />
              </div>
            </div>

            {/* Action buttons */}
            {state === 'complete' && (
              <div className="action-buttons">
                <button onClick={handleSave}>{t.actions.save}</button>
                <button onClick={handleShare}>{t.actions.share}</button>
                <button onClick={handleDonate}>{t.actions.donate}</button>
              </div>
            )}
          </div>
        )}

        <style jsx>{`
          .absolution-container {
            min-height: 100vh;
            background-color: #000;
            color: #fff;
            font-family: 'Inter', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            position: relative;
          }

          .lang-toggle {
            position: absolute;
            top: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
            align-items: center;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .lang-toggle button {
            background: none;
            border: none;
            color: #666;
            cursor: pointer;
            transition: color 0.3s;
          }

          .lang-toggle button:hover,
          .lang-toggle button.active {
            color: #fff;
          }

          .lang-toggle span {
            color: #333;
          }

          /* State 1: Confessional */
          .confessional {
            text-align: center;
            max-width: 500px;
            width: 100%;
          }

          .title {
            font-size: clamp(24px, 5vw, 42px);
            font-weight: 700;
            letter-spacing: 2px;
            margin-bottom: 60px;
            line-height: 1.2;
          }

          .custom-dropdown {
            position: relative;
            margin-bottom: 20px;
          }

          .dropdown-selected {
            background: #000;
            border: 1px solid #fff;
            padding: 15px 20px;
            cursor: pointer;
            text-align: left;
            font-size: 16px;
            transition: background 0.3s;
          }

          .dropdown-selected:hover {
            background: #111;
          }

          .dropdown-options {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: #000;
            border: 1px solid #fff;
            border-top: none;
            max-height: 300px;
            overflow-y: auto;
            z-index: 10;
          }

          .dropdown-option {
            padding: 15px 20px;
            cursor: pointer;
            border-bottom: 1px solid #222;
            transition: background 0.2s;
          }

          .dropdown-option:hover {
            background: #111;
          }

          .name-input {
            width: 100%;
            background: #000;
            border: 1px solid #fff;
            color: #fff;
            padding: 15px 20px;
            font-size: 16px;
            font-family: 'Inter', sans-serif;
            margin-bottom: 30px;
          }

          .name-input::placeholder {
            color: #666;
          }

          .submit-btn {
            width: 100%;
            background: #000;
            border: 2px solid #fff;
            color: #fff;
            padding: 18px 40px;
            font-size: 16px;
            font-weight: 600;
            letter-spacing: 2px;
            cursor: pointer;
            transition: all 0.3s;
            text-transform: uppercase;
          }

          .submit-btn:hover:not(:disabled) {
            background: #fff;
            color: #000;
          }

          .submit-btn:disabled {
            opacity: 0.3;
            cursor: not-allowed;
          }

          /* State 2: Purgatory */
          .purgatory {
            text-align: center;
          }

          .angel-animation {
            width: 100%;
            max-width: 400px;
            height: auto;
            margin-bottom: 40px;
          }

          .loading-text {
            font-size: 20px;
            letter-spacing: 1px;
            animation: pulse 2s infinite;
          }

          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }

          /* State 3: Ritual */
          .ritual {
            width: 100%;
            max-width: 1000px;
          }

          .ritual-content {
            display: flex;
            gap: 40px;
            align-items: center;
            justify-content: center;
            flex-wrap: wrap;
            margin-bottom: 40px;
          }

          .receipt {
            background-color: #f0f0f0;
            color: #000;
            font-family: 'Space Mono', 'Courier New', monospace;
            width: 320px;
            padding: 30px 20px;
            box-shadow: 0 0 20px rgba(255,255,255,0.1);
            position: relative;
            text-transform: uppercase;
            font-size: 13px;
            letter-spacing: 0.5px;
          }

          .receipt.shake {
            animation: shake 0.3s;
          }

          @keyframes shake {
            0%, 100% { transform: translate(0, 0); }
            25% { transform: translate(-3px, -3px); }
            50% { transform: translate(3px, 3px); }
            75% { transform: translate(-3px, 3px); }
          }

          .receipt-header {
            text-align: center;
            font-size: 16px;
            font-weight: 700;
            margin-bottom: 15px;
            letter-spacing: 2px;
          }

          .receipt-divider {
            margin: 15px 0;
            color: #666;
          }

          .receipt-line {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            font-size: 11px;
          }

          .receipt-section {
            margin: 20px 0;
          }

          .receipt-label {
            font-size: 11px;
            color: #666;
            margin-bottom: 5px;
          }

          .receipt-value {
            font-size: 14px;
            font-weight: 700;
          }

          .sin-text {
            font-size: 12px;
            line-height: 1.4;
          }

          .verdict-section {
            margin: 30px 0;
          }

          .verdict-value {
            font-size: 24px;
            letter-spacing: 3px;
          }

          .receipt-footer {
            margin-top: 20px;
            text-align: center;
            font-size: 10px;
          }

          .footer-quote {
            font-style: italic;
            margin-bottom: 15px;
            line-height: 1.4;
            text-transform: none;
          }

          .footer-signature {
            font-size: 9px;
            color: #666;
          }

          .stamp-mark {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-3deg);
            width: 150px;
            height: 150px;
            opacity: 0.85;
            mix-blend-mode: multiply;
            pointer-events: none;
          }

          .devil-container {
            width: 200px;
            height: 200px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .devil-animation {
            width: 100%;
            height: auto;
          }

          .action-buttons {
            display: flex;
            gap: 20px;
            justify-content: center;
            flex-wrap: wrap;
          }

          .action-buttons button {
            background: #000;
            border: 1px solid #fff;
            color: #fff;
            padding: 12px 30px;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 1px;
            cursor: pointer;
            transition: all 0.3s;
            text-transform: uppercase;
          }

          .action-buttons button:hover {
            background: #fff;
            color: #000;
          }

          /* Mobile adjustments */
          @media (max-width: 768px) {
            .ritual-content {
              flex-direction: column;
            }

            .devil-container {
              width: 150px;
              height: 150px;
            }

            .receipt {
              width: 280px;
              padding: 25px 15px;
            }
          }
        `}</style>
      </div>
    </>
  );
}
