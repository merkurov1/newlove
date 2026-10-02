'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';

interface Props {
  daemonUrl?: string;
  heartUrl?: string;
}

export default function HeartPhysics({
  daemonUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Daemon.png',
  heartUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png',
}: Props) {
  const { user, profile, session } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [bgColor, setBgColor] = useState('#e8b4b8');
  const [seconds, setSeconds] = useState(0);

  // Вычисляем имя автора
  const currentAuthorName = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Guardian';

  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;
  const authorRef = useRef(currentAuthorName);
  authorRef.current = currentAuthorName;

  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.access_token || null;

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Отправка таймера спокойствия с токеном и реальным автором
  useEffect(() => {
    return () => {
      const currentSeconds = secondsRef.current;
      if (currentSeconds > 2) {
        const payload = {
          event_type: 'calm_timer',
          message: `Spent ${currentSeconds} ${currentSeconds === 1 ? 'second' : 'seconds'} finding calm.`,
          author: authorRef.current,
          token: tokenRef.current
        };

        if (navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
          navigator.sendBeacon('/api/temple_logs', blob);
        } else {
          fetch('/api/temple_logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
          }).catch(() => {});
        }
      }
    };
  }, []);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 18) {
      setBgColor('#e8b4b8');
    } else if (hour >= 18 && hour < 22) {
      setBgColor('#e0a1a6');
    } else {
      setBgColor('#2b1d24');
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const daemonImg = new Image();
    daemonImg.crossOrigin = 'anonymous';
    daemonImg.src = daemonUrl;

    const heartImg = new Image();
    heartImg.crossOrigin = 'anonymous';
    heartImg.src = heartUrl;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const daemonWidth = Math.min(width * 0.35, 260);
    const daemonHeight = daemonWidth * 1.5;

    let handX = width / 2 + daemonWidth * 0.35;
    let handY = height - daemonHeight * 0.48;

    let balloonX = width / 2;
    let balloonY = handY - 260;
    let vx = 0;
    let vy = 0;
    let angle = 0;

    let windX = 0;
    let windY = 0;

    const restLength = Math.min(height * 0.3, 280);

    let currentHeartScale = 1;
    let targetHeartScale = 1;
    let stringVibration = 0;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        windX = e.gamma * 0.3;
        windY = (e.beta - 45) * 0.2;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const offsetX = (e.clientX - width / 2) / (width / 2);
      windX = offsetX * 12;
    };

    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('mousemove', handleMouseMove);

    const handleTouch = (e: TouchEvent | MouseEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const dist = Math.hypot(clientX - balloonX, clientY - balloonY);
      if (dist < 140) {
        vx += (Math.random() - 0.5) * 20;
        vy -= 15;
        targetHeartScale = 1.25;
        stringVibration = 15;

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(15);
        }
      }
    };

    window.addEventListener('touchstart', handleTouch, { passive: true });
    window.addEventListener('mousedown', handleTouch);

    let animationFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      handX = width / 2 + daemonWidth * 0.35;
      handY = height - daemonHeight * 0.48;

      const dx = balloonX - handX;
      const dy = balloonY - handY;
      const currentLength = Math.hypot(dx, dy);

      vy -= 0.4;
      vx += windX * 0.05;
      vy += windY * 0.05;

      if (currentLength > restLength) {
        const tension = (currentLength - restLength) * 0.08;
        const angleSpring = Math.atan2(dy, dx);
        vx -= Math.cos(angleSpring) * tension;
        vy -= Math.sin(angleSpring) * tension;
      }

      vx *= 0.93;
      vy *= 0.93;

      balloonX += vx;
      balloonY += vy;
      angle = vx * 0.03;

      currentHeartScale += (targetHeartScale - currentHeartScale) * 0.1;
      targetHeartScale += (1 - targetHeartScale) * 0.1;
      stringVibration *= 0.88;

      const daemonX = width / 2 - daemonWidth / 2;
      const daemonY = height - daemonHeight;

      if (daemonImg.complete) {
        ctx.drawImage(daemonImg, daemonX, daemonY, daemonWidth, daemonHeight);
      }

      const heartSize = Math.min(width * 0.22, 140) * currentHeartScale;
      const knotRelativeX = 0;
      const knotRelativeY = heartSize / 2;

      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const knotX = balloonX + (knotRelativeX * cosA - knotRelativeY * sinA);
      const knotY = balloonY + (knotRelativeX * sinA + knotRelativeY * cosA);

      ctx.beginPath();
      ctx.moveTo(handX, handY);

      const vibX = Math.sin(Date.now() * 0.05) * stringVibration;
      const controlX = (handX + knotX) / 2 - vx * 4 + vibX;
      const controlY = (handY + knotY) / 2 + 15;

      ctx.quadraticCurveTo(controlX, controlY, knotX, knotY);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      if (heartImg.complete) {
        ctx.save();
        ctx.translate(balloonX, balloonY);
        ctx.rotate(angle);
        ctx.drawImage(
          heartImg,
          -heartSize / 2,
          -heartSize / 2,
          heartSize,
          heartSize
        );
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleTouch);
      window.removeEventListener('mousedown', handleTouch);
      cancelAnimationFrame(animationFrameId);
    };
  }, [daemonUrl, heartUrl, permissionGranted]);

  const requestGyroPermission = async () => {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      // @ts-ignore
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        // @ts-ignore
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          setPermissionGranted(true);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      setPermissionGranted(true);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}:${remainSecs < 10 ? '0' : ''}${remainSecs}`;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', background: bgColor, transition: 'background 1.5s ease', overflow: 'hidden', touchAction: 'none' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      
      {/* Верхняя панель с кнопкой возврата в Храм и таймером */}
      <header className="absolute top-0 left-0 w-full z-50 flex justify-between items-center p-6 sm:p-12 pointer-events-auto">
        <Link 
          href="/temple"
          className="flex items-center gap-2 px-5 py-2.5 rounded-full backdrop-blur-md border border-white/30 bg-white/80 text-stone-900 shadow-md transition-all text-xs font-serif tracking-wider hover:bg-white cursor-pointer"
        >
          <span>← Back to Temple</span>
        </Link>

        <div className="text-stone-900 font-mono text-xs sm:text-sm tracking-[0.2em] bg-white/80 px-4 py-2 rounded-full backdrop-blur-md border border-white/30 shadow-md">
          ⏳ {formatTime(seconds)}
        </div>
      </header>

      {!permissionGranted && (
        <button
          onClick={requestGyroPermission}
          style={{
            position: 'absolute',
            bottom: '32px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 24px',
            borderRadius: '24px',
            border: '1px solid #1a1a1a',
            background: '#ffffff',
            color: '#1a1a1a',
            fontFamily: 'sans-serif',
            fontSize: '12px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 30,
          }}
        >
          Enable Gyroscope 📱
        </button>
      )}
    </div>
  );
}
