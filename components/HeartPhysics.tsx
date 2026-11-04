'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthContext';
import TempleTopBar from './TempleTopBar';
import { logTempleEvent } from '@/lib/templeLogger';

interface Props {
  daemonUrl?: string;
  heartUrl?: string;
}

export default function HeartPhysics({
  daemonUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Daemon.png',
  heartUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png',
}: Props) {
  const { user, profile } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showGyroPrompt, setShowGyroPrompt] = useState(false);
  const [gyroDenied, setGyroDenied] = useState(false);
  const [bgColor, setBgColor] = useState('#e8b4b8');
  const [seconds, setSeconds] = useState(0);

  const currentAuthorName =
    profile?.name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    (typeof window !== 'undefined' ? localStorage.getItem('temple_user') : null) ||
    'Guardian';

  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;

  const authorRef = useRef(currentAuthorName);
  authorRef.current = currentAuthorName;

  useEffect(() => {
    if (typeof DeviceOrientationEvent === 'undefined') return;

    const OrientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof OrientationEvent.requestPermission === 'function') {
      setShowGyroPrompt(true);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      const currentSeconds = secondsRef.current;

      if (currentSeconds > 2) {
        void logTempleEvent({
          event_type: 'MEDITATION',
          message: `Spent ${currentSeconds} ${
            currentSeconds === 1 ? 'second' : 'seconds'
          } finding calm.`,
          author: authorRef.current,
        });
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

    let daemonReady = false;
    let heartReady = false;

    const daemonImg = new Image();
    daemonImg.crossOrigin = 'anonymous';
    daemonImg.onload = () => {
      daemonReady =
        daemonImg.naturalWidth > 0 && daemonImg.naturalHeight > 0;
    };
    daemonImg.onerror = () => {
      daemonReady = false;
      console.warn('HeartPhysics: daemon image unavailable');
    };
    daemonImg.src = daemonUrl;

    const heartImg = new Image();
    heartImg.crossOrigin = 'anonymous';
    heartImg.onload = () => {
      heartReady =
        heartImg.naturalWidth > 0 && heartImg.naturalHeight > 0;
    };
    heartImg.onerror = () => {
      heartReady = false;
      console.warn('HeartPhysics: heart image unavailable');
    };
    heartImg.src = heartUrl;

    let width = 0;
    let height = 0;
    let dpr = 1;

    let daemonWidth = 0;
    let daemonHeight = 0;
    let sceneLift = 0;
    let restLength = 0;

    let handX = 0;
    let handY = 0;
    let balloonX = 0;
    let balloonY = 0;

    let vx = 0;
    let vy = 0;
    let angle = 0;

    let windX = 0;
    let windY = 0;

    let currentHeartScale = 1;
    let targetHeartScale = 1;
    let stringVibration = 0;

    const updateSceneSize = (
      nextWidth: number,
      nextHeight: number,
      preserveBalloon: boolean
    ) => {
      const safeWidth = Math.max(1, nextWidth);
      const safeHeight = Math.max(1, nextHeight);
      const nextDpr = Math.max(1, window.devicePixelRatio || 1);

      if (
        width === safeWidth &&
        height === safeHeight &&
        dpr === nextDpr &&
        canvas.width === Math.round(safeWidth * nextDpr) &&
        canvas.height === Math.round(safeHeight * nextDpr)
      ) {
        return;
      }

      const hadSize = width > 1 && height > 1;
      const oldWidth = width || safeWidth;
      const oldHeight = height || safeHeight;
      const relativeX = hadSize ? balloonX - width / 2 : 0;
      const relativeY = hadSize ? balloonY - height / 2 : 0;

      width = safeWidth;
      height = safeHeight;
      dpr = nextDpr;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      daemonWidth = Math.min(
        width * 0.35,
        260,
        (height * 0.62) / 1.5
      );
      daemonHeight = daemonWidth * 1.5;
      sceneLift = Math.min(height * 0.12, 132);
      restLength = Math.min(height * 0.3, 280);

      handX = width / 2 + daemonWidth * 0.35;
      handY = height - daemonHeight * 0.48 - sceneLift;

      // Damp the previous motion when the viewport changes so rotation does
      // not throw the heart violently across the new composition.
      if (hadSize) {
        vx *= 0.5;
        vy *= 0.5;
      }

      if (!preserveBalloon || !hadSize) {
        balloonX = width / 2;
        balloonY = handY - 260;
      } else {
        balloonX = width / 2 + relativeX * (width / oldWidth);
        balloonY = height / 2 + relativeY * (height / oldHeight);
      }

      const heartSize = Math.min(width * 0.22, 140);
      const margin = heartSize * 0.6;

      balloonX = Math.min(
        Math.max(balloonX, margin),
        Math.max(margin, width - margin)
      );
      balloonY = Math.min(
        Math.max(balloonY, margin),
        Math.max(margin, height - margin)
      );
    };

    updateSceneSize(window.innerWidth, window.innerHeight, false);

    const handleResize = () => {
      updateSceneSize(
        canvas.clientWidth || window.innerWidth,
        canvas.clientHeight || window.innerHeight,
        true
      );
    };

    let resizeObserver: ResizeObserver | null = null;

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener('resize', handleResize);
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        windX = e.gamma * 0.3;
        windY = (e.beta - 45) * 0.2;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const offsetX =
        (e.clientX - width / 2) /
        (width / 2);

      windX = offsetX * 12;
    };

    window.addEventListener(
      'deviceorientation',
      handleOrientation
    );

    window.addEventListener(
      'mousemove',
      handleMouseMove
    );

    const handleTouch = (
      e: TouchEvent | MouseEvent
    ) => {
      const clientX =
        'touches' in e
          ? e.touches[0].clientX
          : e.clientX;

      const clientY =
        'touches' in e
          ? e.touches[0].clientY
          : e.clientY;

      const dist = Math.hypot(
        clientX - balloonX,
        clientY - balloonY
      );

      if (dist < 140) {
        vx +=
          (Math.random() - 0.5) * 20;

        vy -= 15;

        targetHeartScale = 1.25;
        stringVibration = 15;

        if (
          typeof navigator !==
            'undefined' &&
          navigator.vibrate
        ) {
          navigator.vibrate(15);
        }
      }
    };

    window.addEventListener(
      'touchstart',
      handleTouch,
      {
        passive: true,
      }
    );

    window.addEventListener(
      'mousedown',
      handleTouch
    );

    let animationFrameId = 0;
    let isTabVisible =
      !document.hidden;

    const handleVisibilityChange =
      () => {
        isTabVisible =
          !document.hidden;

        if (isTabVisible) {
          render();
        } else {
          cancelAnimationFrame(
            animationFrameId
          );
        }
      };

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    );

    const render = () => {
      if (!isTabVisible) return;

      ctx.clearRect(
        0,
        0,
        width,
        height
      );

      /*
       * Keep the hand at the lifted position.
       * The heart remains physically attached to this point,
       * so the complete heart/string/daemon composition moves together.
       */
      handX =
        width / 2 +
        daemonWidth * 0.35;

      handY =
        height -
        daemonHeight * 0.48 -
        sceneLift;

      const dx =
        balloonX - handX;

      const dy =
        balloonY - handY;

      const currentLength =
        Math.hypot(dx, dy);

      vy -= 0.4;

      vx += windX * 0.05;
      vy += windY * 0.05;

      if (
        currentLength >
        restLength
      ) {
        const tension =
          (currentLength -
            restLength) *
          0.08;

        const angleSpring =
          Math.atan2(dy, dx);

        vx -=
          Math.cos(
            angleSpring
          ) * tension;

        vy -=
          Math.sin(
            angleSpring
          ) * tension;
      }

      vx *= 0.93;
      vy *= 0.93;

      balloonX += vx;
      balloonY += vy;

      angle = vx * 0.03;

      currentHeartScale +=
        (targetHeartScale -
          currentHeartScale) *
        0.1;

      targetHeartScale +=
        (1 -
          targetHeartScale) *
        0.1;

      stringVibration *= 0.88;

      /*
       * The daemon is lifted by exactly the same amount as the hand.
       */
      const daemonX =
        width / 2 -
        daemonWidth / 2;

      const daemonY =
        height -
        daemonHeight -
        sceneLift;

      if (daemonReady) {
        ctx.drawImage(
          daemonImg,
          daemonX,
          daemonY,
          daemonWidth,
          daemonHeight
        );
      }

      const heartSize =
        Math.min(
          width * 0.22,
          140
        ) *
        currentHeartScale;

      const knotRelativeX = 0;

      const knotRelativeY =
        heartSize / 2;

      const cosA =
        Math.cos(angle);

      const sinA =
        Math.sin(angle);

      const knotX =
        balloonX +
        (knotRelativeX *
          cosA -
          knotRelativeY *
            sinA);

      const knotY =
        balloonY +
        (knotRelativeX *
          sinA +
          knotRelativeY *
            cosA);

      /*
       * String from daemon's hand to the heart.
       */
      ctx.beginPath();

      ctx.moveTo(
        handX,
        handY
      );

      const vibX =
        Math.sin(
          Date.now() * 0.05
        ) *
        stringVibration;

      const controlX =
        (handX + knotX) / 2 -
        vx * 4 +
        vibX;

      const controlY =
        (handY + knotY) / 2 +
        15;

      ctx.quadraticCurveTo(
        controlX,
        controlY,
        knotX,
        knotY
      );

      ctx.strokeStyle =
        '#1a1a1a';

      ctx.lineWidth = 1.8;

      ctx.stroke();

      /*
       * Heart. If the remote image is unavailable, keep the ritual alive
       * with a neutral circular fallback rather than throwing from drawImage.
       */
      ctx.save();
      ctx.translate(balloonX, balloonY);
      ctx.rotate(angle);

      if (heartReady) {
        ctx.drawImage(
          heartImg,
          -heartSize / 2,
          -heartSize / 2,
          heartSize,
          heartSize
        );
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, heartSize * 0.36, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232, 180, 184, 0.9)';
        ctx.fill();
      }

      ctx.restore();

      animationFrameId =
        requestAnimationFrame(
          render
        );
    };

    render();

    return () => {
      resizeObserver?.disconnect();

      window.removeEventListener(
        'resize',
        handleResize
      );

      window.removeEventListener(
        'deviceorientation',
        handleOrientation
      );

      window.removeEventListener(
        'mousemove',
        handleMouseMove
      );

      window.removeEventListener(
        'touchstart',
        handleTouch
      );

      window.removeEventListener(
        'mousedown',
        handleTouch
      );

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );

      cancelAnimationFrame(
        animationFrameId
      );
    };
  }, [
    daemonUrl,
    heartUrl,
  ]);

  const requestGyroPermission = async () => {
    if (typeof DeviceOrientationEvent === 'undefined') {
      setShowGyroPrompt(false);
      return;
    }

    const OrientationEvent =
      DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };

    if (typeof OrientationEvent.requestPermission !== 'function') {
      setShowGyroPrompt(false);
      return;
    }

    try {
      const response = await OrientationEvent.requestPermission();

      setShowGyroPrompt(false);
      setGyroDenied(response !== 'granted');
    } catch (error) {
      console.error(error);
      setShowGyroPrompt(false);
      setGyroDenied(true);
    }
  };

  const safeBottom =
    'max(24px, calc(env(safe-area-inset-bottom) + 16px), calc(var(--tg-safe-area-bottom, 0px) + 16px))';

  const formatTime = (
    secs: number
  ) => {
    const mins =
      Math.floor(secs / 60);

    const remainSecs =
      secs % 60;

    return `${mins}:${
      remainSecs < 10
        ? '0'
        : ''
    }${remainSecs}`;
  };

  return (
    <div
      className="animate-fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        background: bgColor,
        transition:
          'background 1.5s ease',
        overflow: 'hidden',
        touchAction: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />

      <TempleTopBar
        backTo="world"
        right={
          <span className="rounded-full border border-amber-300/20 bg-black/40 px-3 py-2 text-[10px] uppercase tracking-[.14em] text-amber-100">
            ⏳ {formatTime(seconds)}
          </span>
        }
      />

      {showGyroPrompt && (
        <button
          onClick={requestGyroPermission}
          style={{
            position: 'absolute',
            bottom: safeBottom,
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
          Enable Gyroscope
        </button>
      )}

      {gyroDenied && (
        <p
          role="status"
          style={{
            position: 'absolute',
            bottom: safeBottom,
            left: '50%',
            transform: 'translateX(-50%)',
            margin: 0,
            width: 'min(90vw, 340px)',
            padding: '10px 16px',
            borderRadius: '24px',
            background: 'rgba(255,255,255,0.92)',
            textAlign: 'center',
            fontFamily: 'sans-serif',
            fontSize: '11px',
            letterSpacing: '0.06em',
            color: '#1a1a1a',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 30,
          }}
        >
          Gyroscope unavailable. Touch the heart instead.
        </p>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes fadeIn {
              from {
                opacity: 0;
                transform: scale(0.98);
              }
              to {
                opacity: 1;
                transform: scale(1);
              }
            }

            .animate-fade-in {
              animation: fadeIn 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `,
        }}
      />
    </div>
  );
}