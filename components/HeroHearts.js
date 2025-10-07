"use client";
import { useEffect, useRef, useState } from "react";

const WORDS = ["ART", "LOVE", "MONEY"];
const COLORS = ["#FFB6C1", "#FFC0CB", "#FF69B4", "#FF8DA1", "#FFB6B9"];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

function createHeart(width, height) {
  const angle = Math.random() * 2 * Math.PI;
  const radius = randomBetween(80, Math.min(width, height) / 2 - 40);
  return {
    x: width / 2 + Math.cos(angle) * radius,
    y: height / 2 + Math.sin(angle) * radius,
    vx: randomBetween(-0.3, 0.3),
    vy: randomBetween(-0.3, 0.3),
    size: randomBetween(18, 32),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    id: Math.random().toString(36).slice(2),
  };
}

export default function HeroHearts({ className = "", style }) {
  const canvasRef = useRef(null);
  const [wordIdx, setWordIdx] = useState(0);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [mounted, setMounted] = useState(false);
  const heartsRef = useRef([]);
  const animationRef = useRef();

  // Кинетическая типографика
  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      setWordIdx((idx) => (idx + 1) % WORDS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [mounted]);

  // Canvas-анимация
  useEffect(() => {
    setMounted(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let width = canvas.offsetWidth;
    let height = canvas.offsetHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    // Инициализация сердечек
    let hearts = Array.from({ length: 18 }, () => createHeart(width, height));
    heartsRef.current = hearts;

    function drawHeart(ctx, x, y, size, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, size * 0.3);
      ctx.bezierCurveTo(size * 0.5, -size * 0.3, size, size * 0.5, 0, size);
      ctx.bezierCurveTo(-size, size * 0.5, -size * 0.5, -size * 0.3, 0, size * 0.3);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.shadowColor = color + "55";
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);
      // Параллакс-эффект
      const parallaxX = lerp(width / 2, mouse.x * width, 0.08);
      const parallaxY = lerp(height / 2, mouse.y * height, 0.08);
      // Движение и отрисовка сердечек
      for (let i = 0; i < hearts.length; i++) {
        let h = hearts[i];
        h.x += h.vx;
        h.y += h.vy;
        // Bounce от краев
        if (h.x < h.size || h.x > width - h.size) h.vx *= -1;
        if (h.y < h.size || h.y > height - h.size) h.vy *= -1;
        drawHeart(ctx, h.x + (parallaxX - width / 2) * 0.12, h.y + (parallaxY - height / 2) * 0.12, h.size, h.color);
      }
      // Соединяющие линии
      for (let i = 0; i < hearts.length; i++) {
        for (let j = i + 1; j < hearts.length; j++) {
          const a = hearts[i], b = hearts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.save();
            ctx.globalAlpha = 0.18 * (1 - dist / 120);
            ctx.strokeStyle = a.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      animationRef.current = requestAnimationFrame(animate);
    }
    animate();
    return () => cancelAnimationFrame(animationRef.current);
  }, [mounted, mouse.x, mouse.y]);

  // Resize
  useEffect(() => {
    function handleResize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Mouse move для параллакса
  useEffect(() => {
    function handle(e) {
      const rect = canvasRef.current.getBoundingClientRect();
      setMouse({
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      });
    }
    window.addEventListener("mousemove", handle);
    return () => window.removeEventListener("mousemove", handle);
  }, []);

  return (
    <div className={`relative w-full h-[420px] md:h-[520px] rounded-3xl overflow-hidden shadow-xl bg-gradient-to-br from-pink-50 via-white to-pink-100 ${className}`} style={style}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} />
      <div className="relative z-10 flex flex-col items-center justify-center h-full text-center select-none">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 mb-4 drop-shadow-lg">
          <span className="inline-block bg-gradient-to-r from-pink-400 via-pink-300 to-pink-500 bg-clip-text text-transparent animate-fade-in">
            {WORDS[wordIdx]}
          </span>
        </h1>
        <div className="text-lg md:text-2xl font-semibold text-gray-800 mb-2 animate-fade-in-slow">Anton Merkurov</div>
        <div className="text-base md:text-lg text-gray-600 mb-6 animate-fade-in-slow">Art x Love x Money</div>
        {/* Здесь можно добавить динамический список рубрик */}
      </div>
      {/* Scroll indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center opacity-80">
        <div className="w-6 h-6 rounded-full border-2 border-pink-300 flex items-center justify-center animate-bounce">
          <svg width="16" height="16" fill="none" stroke="#FF69B4" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
        </div>
        <span className="text-xs text-pink-400 mt-1">Scroll</span>
      </div>
    </div>
  );
}
