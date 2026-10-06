import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import { subDays } from 'date-fns';

export const dynamic = 'force-dynamic';

// КОНФИГУРАЦИЯ АКТИВОВ
const ASSETS = {
  gold: 'GC=F',
  hermes: 'RMS.PA',
  btc: 'BTC-USD',
  nvidia: 'NVDA',
};

// Хелпер для безопасной загрузки данных по одному тикеру
async function fetchHistoricalData(symbol: string, period1: Date, period2: Date) {
  try {
    const data = await yahooFinance.historical(symbol, {
      period1,
      period2,
      interval: '1d',
    });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err);
    return [];
  }
}

export async function GET() {
  try {
    const endDate = new Date();
    const startDate = subDays(endDate, 30);

    // 1. Забираем данные параллельно с помощью безопасного хелпера
    const [goldData, hermesData, btcData, nvidiaData] = await Promise.all([
      fetchHistoricalData(ASSETS.gold, startDate, endDate),
      fetchHistoricalData(ASSETS.hermes, startDate, endDate),
      fetchHistoricalData(ASSETS.btc, startDate, endDate),
      fetchHistoricalData(ASSETS.nvidia, startDate, endDate),
    ]);

    // 2. Создаем словарь { date: closePrice }
    const createMap = (data: any[]) => {
      return data.reduce((acc, item) => {
        if (!item) return acc;
        const d = item.date ? new Date(item.date) : null;
        if (!d || Number.isNaN(d.getTime())) return acc;
        const dateStr = d.toISOString().split('T')[0];
        acc[dateStr] = typeof item.close === 'number' ? item.close : (item.adjClose ?? item.close ?? 0);
        return acc;
      }, {} as Record<string, number>);
    };

    const goldMap = createMap(goldData);
    const hermesMap = createMap(hermesData);
    const btcMap = createMap(btcData);
    const nvidiaMap = createMap(nvidiaData);

    // 3. Собираем единый массив дат (ориентируемся на золото)
    const validDates = Object.keys(goldMap).sort();
    if (validDates.length === 0) {
      return NextResponse.json({ data: [], meta: { message: 'No market data available' } }, { status: 204 });
    }

    const chartData = validDates.map((date) => {
      const pGold = goldMap[date] || 0;
      const pHermes = hermesMap[date] || 0;
      const pBtc = btcMap[date] || 0;
      const pNvidia = nvidiaMap[date] || 0;

      // Нормализация EUR -> USD для Hermes
      const pHermesUSD = pHermes * 1.05;

      // ФОРМУЛА МЕРКУРОВА
      const silenceVal = pGold + (pHermesUSD * 5); 
      const noiseVal = (pBtc * 0.05) + (pNvidia * 10);

      const indexValue = noiseVal !== 0 ? (silenceVal / noiseVal) * 100 : 0;

      return {
        date,
        value: parseFloat(indexValue.toFixed(2)),
        silence: Math.round(silenceVal),
        noise: Math.round(noiseVal),
      };
    });

    const last = chartData[chartData.length - 1];
    const prev = chartData.length > 1 ? chartData[chartData.length - 2] : null;
    const trend = prev ? (last.value > prev.value ? 'up' : 'down') : 'stable';
    const percentChange = prev && prev.value !== 0 ? ((last.value - prev.value) / prev.value) * 100 : 0;

    return NextResponse.json({
      data: chartData,
      meta: {
        currentValue: last.value,
        trend,
        percentChange: parseFloat(percentChange.toFixed(2)),
        lastUpdate: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('Index Calculation Error:', error);
    return NextResponse.json({ error: 'Failed to calculate Silence Index' }, { status: 500 });
  }
}
