import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import { subDays, format } from 'date-fns';

// КОНФИГУРАЦИЯ АКТИВОВ
// Silence (Тишина): Золото (GC=F) + Hermes (RMS.PA)
// Noise (Шум): Биткоин (BTC-USD) + Nvidia (NVDA)
const ASSETS = {
  gold: 'GC=F',
  hermes: 'RMS.PA',
  btc: 'BTC-USD',
  nvidia: 'NVDA'
};

export async function GET() {
  try {
    const endDate = new Date();
    const startDate = subDays(endDate, 30); // Берем данные за 30 дней

    const queryOptions = {
      period1: startDate,
      period2: endDate,
      interval: '1d' as const, // Явное указание типа
    };

    // 1. Забираем данные параллельно
    const [goldData, hermesData, btcData, nvidiaData] = await Promise.all([
      yahooFinance.historical(ASSETS.gold, queryOptions),
      yahooFinance.historical(ASSETS.hermes, queryOptions),
      yahooFinance.historical(ASSETS.btc, queryOptions),
      yahooFinance.historical(ASSETS.nvidia, queryOptions),
    ]);

    // 2. Функция для создания словаря { date: closePrice }
    const createMap = (data: any[]) => {
      return data.reduce((acc, item) => {
        const dateStr = item.date.toISOString().split('T')[0];
        acc[dateStr] = item.close;
        return acc;
      }, {} as Record<string, number>);
    };

    const goldMap = createMap(goldData);
    const hermesMap = createMap(hermesData);
    const btcMap = createMap(btcData);
    const nvidiaMap = createMap(nvidiaData);

    // 3. Собираем единый массив дат (исключаем выходные, где нет биржевых данных)
    // Ориентируемся на Gold (он торгуется 5/7), так как крипта торгуется 24/7, но нам нужно пересечение.
    const validDates = Object.keys(goldMap).sort();

    const chartData = validDates.map(date => {
      const pGold = goldMap[date] || 0;
      const pHermes = hermesMap[date] || 0;
      const pBtc = btcMap[date] || 0;
      const pNvidia = nvidiaMap[date] || 0;

      // Нормализация валют (грубая для MVP): Hermes в EUR, остальные в USD.
      // Считаем 1 EUR = 1.05 USD (хардкод для скорости, или можно подключить валюту)
      const pHermesUSD = pHermes * 1.05;

      // ФОРМУЛА МЕРКУРОВА
      // Basket Silence: Gold + (Hermes * 5) -> Вес Hermes увеличен, т.к. цена акции ниже золота
      const silenceVal = pGold + (pHermesUSD * 5); 
      
      // Basket Noise: (BTC * 0.05) + (Nvidia * 10) -> Уменьшаем вес BTC, чтобы он не ломал график
      const noiseVal = (pBtc * 0.05) + (pNvidia * 10);

      // INDEX VALUE
      // Множитель 100 для красоты цифры
      const indexValue = noiseVal !== 0 ? (silenceVal / noiseVal) * 100 : 0;

      return {
        date,
        value: parseFloat(indexValue.toFixed(2)),
        silence: Math.round(silenceVal),
        noise: Math.round(noiseVal)
      };
    });

    // Получаем текущий тренд (последний vs предпоследний)
    const last = chartData[chartData.length - 1];
    const prev = chartData[chartData.length - 2];
    const trend = last.value > prev.value ? 'up' : 'down';
    const percentChange = ((last.value - prev.value) / prev.value) * 100;

    return NextResponse.json({
      data: chartData,
      meta: {
        currentValue: last.value,
        trend,
        percentChange: percentChange.toFixed(2),
        lastUpdate: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Index Calculation Error:', error);
    return NextResponse.json({ error: 'Failed to calculate Silence Index' }, { status: 500 });
  }
}