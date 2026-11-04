import React from 'react';
import type { Metadata, Viewport } from 'next';
import TemplePageTransition from '@/components/TemplePageTransition';
import HeartAndAngelPwa from '@/components/heartandangel/HeartAndAngelPwa';

const STARTUP_IMAGES = [
  {
    url: '/heartandangel/splash/splash-1320x2868.png',
    media:
      '(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)',
  },
  {
    url: '/heartandangel/splash/splash-1206x2622.png',
    media:
      '(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3)',
  },
  {
    url: '/heartandangel/splash/splash-1179x2556.png',
    media:
      '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)',
  },
  {
    url: '/heartandangel/splash/splash-1290x2796.png',
    media:
      '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)',
  },
  {
    url: '/heartandangel/splash/splash-1284x2778.png',
    media:
      '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)',
  },
  {
    url: '/heartandangel/splash/splash-1242x2688.png',
    media:
      '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)',
  },
  {
    url: '/heartandangel/splash/splash-1170x2532.png',
    media:
      '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)',
  },
  {
    url: '/heartandangel/splash/splash-1125x2436.png',
    media:
      '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)',
  },
  {
    url: '/heartandangel/splash/splash-828x1792.png',
    media:
      '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)',
  },
  {
    url: '/heartandangel/splash/splash-750x1334.png',
    media:
      '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)',
  },
  {
    url: '/heartandangel/splash/splash-2048x2732.png',
    media:
      '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)',
  },
  {
    url: '/heartandangel/splash/splash-1668x2388.png',
    media:
      '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)',
  },
  {
    url: '/heartandangel/splash/splash-1640x2360.png',
    media:
      '(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2)',
  },
  {
    url: '/heartandangel/splash/splash-1488x2266.png',
    media:
      '(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2)',
  },
  {
    url: '/heartandangel/splash/splash-1536x2048.png',
    media:
      '(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)',
  },
];

export const metadata: Metadata = {
  applicationName: 'Heart & Angel',
  manifest: '/heartandangel/manifest.webmanifest',
  icons: {
    icon: [
      {
        url: '/favicon.ico',
        sizes: 'any',
      },
      {
        url: '/heartandangel/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/heartandangel/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/heartandangel/icons/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: 'Heart & Angel',
    statusBarStyle: 'default',
    startupImage: STARTUP_IMAGES,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#FAF8F5',
};

export default function HeartAndAngelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <HeartAndAngelPwa />
      <TemplePageTransition>{children}</TemplePageTransition>
    </>
  );
}
