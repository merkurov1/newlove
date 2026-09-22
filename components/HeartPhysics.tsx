'use client';

import React, { useEffect, useRef, useState } from 'react';

interface Props {
  daemonUrl?: string;
  heartUrl?: string;
}

export default function HeartPhysics({
  daemonUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Daemon.png',
  heartUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

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

    // Габариты и точная привязка к пальцам вытянутой ладони
    const daemonWidth = 240;
    const daemonHeight = 360;

    // Скорректированные координаты кисти руки
    let handX = width / 2 + daemonWidth * 0.33; 
    let handY = height - daemonHeight * 0.48; 

    let balloonX = handX;
    let balloonY = handY - 260;
    let vx = 0;
    let vy = 0;
    let angle = 0; // Угол поворота шарика

    let windX = 0;
    let windY = 0;

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
      if (dist < 120) {
        vx += (Math.random() - 0.5) * 24;
        vy -= 18;
      }
    };

    window.addEventListener('touchstart', handleTouch);
    window.addEventListener('mousedown', handleTouch);

    let animationFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Корректные координаты кисти руки
      handX = width / 2 + daemonWidth * 0.33;
      handY = height - daemonHeight * 0.48;

      const restLength = 240;
      const dx = balloonX - handX;
      const dy = balloonY - handY;
      const currentLength = Math.hypot(dx, dy);

      vy -= 0.5; // Подъемная сила

      vx += windX * 0.06;
      vy += windY * 0.06;

      if (currentLength > restLength) {
        const tension = (currentLength - restLength) * 0.09;
        const angleSpring = Math.atan2(dy, dx);
        vx -= Math.cos(angleSpring) * tension;
        vy -= Math.sin(angleSpring) * tension;
      }

      vx *= 0.93; // Сопротивление воздуха
      vy *= 0.93;

      balloonX += vx;
      balloonY += vy;
      angle = vx * 0.03; // Угол зависит от горизонтальной скорости

      // 1. Отрисовка Чёртика
      ctx.drawImage(
        daemonImg,
        width / 2 - daemonWidth / 2,
        height - daemonHeight,
        daemonWidth,
        daemonHeight
      );

      // 2. Расчет динамической точки крепления нити к узлу сердца
      const heartSize = 140;
      // Узел находится внизу спрайта (в вертикальном положении: x=0, y=heartSize/2)
      const knotRelativeX = 0;
      const knotRelativeY = heartSize / 2;

      // Применяем вращение к относительным координатам узла
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      
      // Точка крепления нити с учетом поворота сердца
      const knotX = balloonX + (knotRelativeX * cosA - knotRelativeY * sinA);
      const knotY = balloonY + (knotRelativeX * sinA + knotRelativeY * cosA);

      // 3. Динамическая нить (Кривая Безье)
      ctx.beginPath();
      ctx.moveTo(handX, handY);

      // Точка изгиба нити реагирует на скорость движения
      const controlX = (handX + knotX) / 2 - vx * 4;
      const controlY = (handY + knotY) / 2 + 15;

      ctx.quadraticCurveTo(controlX, controlY, knotX, knotY);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // 4. Отрисовка Сердца (Вращается вокруг своего центра)
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

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#e8b4b8', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      {!permissionGranted && (
        <button
          onClick={requestGyroPermission}
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 24px',
            borderRadius: '24px',
            border: '1px solid #1a1a1a',
            background: '#ffffff',
            color: '#1a1a1a',
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
        >
          Enable Gyroscope 📱
        </button>
      )}
    </div>
  );
}
