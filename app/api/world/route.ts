import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CACHE_SECONDS = 900; // 15 minutes

function getNumberHeader(request: Request, name: string) {
  const value = request.headers.get(name);

  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  try {
    const latitude = getNumberHeader(request, 'x-vercel-ip-latitude');
    const longitude = getNumberHeader(request, 'x-vercel-ip-longitude');
    const timezone =
      request.headers.get('x-vercel-ip-timezone') || 'UTC';

    // Local development / non-Vercel environments may not have
    // Vercel geolocation headers. In that case the client keeps
    // using its local device time as a fallback.
    if (latitude === null || longitude === null) {
      return NextResponse.json(
        {
          available: false,
          timezone,
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'private, no-store',
          },
        }
      );
    }

    // Round coordinates slightly. This avoids generating excessive
    // cache variants while remaining more than precise enough for weather.
    const lat = Number(latitude.toFixed(2));
    const lon = Number(longitude.toFixed(2));

    const url = new URL('https://api.open-meteo.com/v1/forecast');

    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set(
      'current',
      'temperature_2m,weathercode,is_day'
    );
    url.searchParams.set('timezone', 'auto');

    const response = await fetch(url.toString(), {
      next: {
        revalidate: CACHE_SECONDS,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Open-Meteo returned HTTP ${response.status}`
      );
    }

    const data = await response.json();

    if (!data?.current) {
      throw new Error('Open-Meteo returned no current weather');
    }

    return NextResponse.json(
      {
        available: true,
        latitude: lat,
        longitude: lon,
        timezone: data.timezone || timezone,
        isDay: data.current.is_day === 1,
        weatherCode: Number(data.current.weathercode),
        temperature: Number(data.current.temperature_2m),
      },
      {
        status: 200,
        headers: {
          // The actual Open-Meteo request is cached by Next.js for 15 min.
          // Keep this response private because its content is visitor-specific.
          'Cache-Control': 'private, max-age=300',
        },
      }
    );
  } catch (error) {
    console.error('World weather error:', error);

    return NextResponse.json(
      {
        available: false,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  }
}