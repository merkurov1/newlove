import { formatLocalDate, formatLocalTime } from './time';
import type {
  IntakeLog,
  IntakeMutationIntent,
  IntakeQueryIntent,
  ParsedIntakeItem,
} from './types';

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

const B = '(?:^|[^a-zа-я0-9])';
const E = '(?=$|[^a-zа-я0-9])';

function phrase(source: string): RegExp {
  return new RegExp(`${B}(?:${source})${E}`, 'i');
}

function periodFrom(text: string): IntakeQueryIntent['period'] {
  if (phrase('вчера|yesterday').test(text)) return 'yesterday';
  if (phrase('позавчера').test(text)) return 'last7';
  if (
    phrase(
      'последние\\s+(?:7|семь)\\s+дн[a-zа-я0-9]*|за\\s+(?:7|семь)\\s+дн[a-zа-я0-9]*|last\\s+(?:7|seven)\\s+days|past\\s+week'
    ).test(text)
  ) {
    return 'last7';
  }
  if (phrase('на\\s+этой\\s+неделе|за\\s+эту\\s+неделю|эта\\s+неделя|this\\s+week').test(text)) {
    return 'week';
  }
  if (phrase('сегодня|today').test(text)) return 'today';
  if (phrase('все|всё|истори[a-zа-я0-9]*|all|history|ever').test(text)) return 'all';
  return 'today';
}

/**
 * Read-only intent detection for the private food log. It is deliberately
 * separate from the write parser: "Что я ел?" must never create a record.
 */
export function detectIntakeQuery(message: string): IntakeQueryIntent | null {
  const text = normalize(message);
  const asksWhat =
    /(?:что\s+(?:я|мы)\s+(?:(?:сегодня|вчера|сейчас|за\s+(?:день|вчера))\s+)?(?:ел|ела|пил|пила|съел|съела|выпил|выпила)|что\s+было\s+(?:в|на)\s+(?:еду|обед|завтрак|ужин)|покажи\s+(?:все|всё|истори|запис)|what\s+did\s+i\s+(?:eat|drink)|show\s+(?:my\s+)?(?:food|intake|history)|food\s+(?:history|log))/i.test(
      text
    );
  const asksCount = /(?:сколько\s+раз|how\s+many\s+times|count\s+(?:my\s+)?(?:meals|food|drinks))/i.test(
    text
  );
  const asksWater = /(?:сколько\s+(?:я\s+)?(?:выпил|пил|воды)|how\s+much\s+water|water\s+intake)/i.test(
    text
  );

  if (!asksWhat && !asksCount && !asksWater) return null;

  const period = periodFrom(text);
  if (asksWater) return { kind: 'water', period };
  if (asksCount) return { kind: 'count', period };
  return { kind: 'list', period };
}

export function detectIntakeMutation(message: string): IntakeMutationIntent | null {
  const text = normalize(message);

  if (
    /(?:удали|удалить|delete|remove).*(?:последн|last).*(?:запис|прием|приём|еда|еды|пит|food|drink|intake|meal)/i.test(
      text
    ) ||
    /(?:удали|удалить|delete|remove)\s+(?:последн|last)\s+(?:запис|запись|intake|meal|food|drink)/i.test(
      text
    )
  ) {
    return { kind: 'delete_last' };
  }

  if (
    /(?:исправь|измени|поправь|correct|fix|update).*(?:последн|last).*(?:запис|прием|приём|еда|еды|пит|food|drink|intake|meal)/i.test(
      text
    )
  ) {
    const replacement =
      message.split(/[:—–-]\s*/).slice(1).join(':').trim() ||
      message.match(/(?:это\s+был[аоы]?|actually\s+it\s+was|it\s+was)\s+(.+)$/i)?.[1]?.trim() ||
      null;
    return { kind: 'correct_last', replacement };
  }

  return null;
}

function periodLabel(period: IntakeQueryIntent['period'], language: 'ru' | 'en'): string {
  if (language === 'en') {
    return period === 'today'
      ? 'today'
      : period === 'yesterday'
        ? 'yesterday'
        : period === 'week'
          ? 'this week'
          : period === 'last7'
            ? 'the last 7 days'
            : 'the whole history';
  }
  return period === 'today'
    ? 'сегодня'
    : period === 'yesterday'
      ? 'вчера'
      : period === 'week'
        ? 'на этой неделе'
        : period === 'last7'
          ? 'за последние 7 дней'
          : 'за всё время';
}

function quantityLabel(log: IntakeLog): string | null {
  if (log.quantity === null && !log.unit) return null;
  const number = log.quantity === null ? '' : String(log.quantity);
  return [number, log.unit || ''].filter(Boolean).join(' ').trim() || null;
}

export function formatIntakeAnswer(input: {
  rows: IntakeLog[];
  query: IntakeQueryIntent;
  language: 'ru' | 'en';
  timezone: string;
  timezoneKnown: boolean;
}): string {
  const { rows, query, language, timezone, timezoneKnown } = input;
  const ru = language === 'ru';
  const label = periodLabel(query.period, language);
  const timezoneNote = timezoneKnown
    ? null
    : ru
      ? 'Часовой пояс владельца не настроен: границы суток рассчитаны по UTC и могут быть неточными.'
      : 'The owner timezone is not configured: day boundaries use UTC and may be approximate.';

  if (rows.length === 0) {
    return [
      ru ? `За ${label} записей о еде и напитках нет.` : `There are no food or drink records for ${label}.`,
      timezoneNote,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  const food = rows.filter((row) => row.type === 'food');
  const drinks = rows.filter((row) => row.type === 'drink');

  if (query.kind === 'count') {
    return [
      ru
        ? `За ${label}: ${food.length} записей о еде и ${drinks.length} записей о напитках (всего ${rows.length}).`
        : `For ${label}: ${food.length} food records and ${drinks.length} drink records (${rows.length} total).`,
      timezoneNote,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  if (query.kind === 'water') {
    const water = rows.filter((row) => /^(?:вода|water)$/i.test(row.itemName.trim()));
    const measured = water
      .map((row) => {
        if (row.quantity === null || !row.unit) return null;
        const unit = row.unit.toLowerCase();
        if (unit === 'мл' || unit === 'ml') return row.quantity;
        if (unit === 'л' || unit === 'l') return row.quantity * 1000;
        return null;
      })
      .filter((value): value is number => value !== null);
    const totalMl = measured.reduce((sum, value) => sum + value, 0);
    const measuredCount = measured.length;
    const lines = [
      ru
        ? `Вода за ${label}: ${water.length} записей.`
        : `Water for ${label}: ${water.length} records.`,
      measuredCount === water.length && measuredCount > 0
        ? ru
          ? `Подтверждённый объём: ${totalMl} мл.`
          : `Confirmed volume: ${totalMl} ml.`
        : ru
          ? `Объём подтверждён только для ${measuredCount} из ${water.length} записей; остальное не суммирую, чтобы не придумывать данные.`
          : `Volume is confirmed for ${measuredCount} of ${water.length} records; the rest is not summed to avoid inventing data.`,
      ...water.map((row) => {
        const time = formatLocalTime(row.occurredAt, timezone);
        return `- ${time ? `${time} · ` : ''}${row.itemName}${quantityLabel(row) ? ` · ${quantityLabel(row)}` : ''}`;
      }),
      timezoneNote,
    ];
    return lines.filter(Boolean).join('\n');
  }

  const renderRows = (list: IntakeLog[]) =>
    list.map((row) => {
      const time = formatLocalTime(row.occurredAt, timezone);
      const date = formatLocalDate(row.occurredAt, timezone);
      const quantity = quantityLabel(row);
      const parts = [
        query.period === 'today' || query.period === 'yesterday'
          ? time
          : [date, time].filter(Boolean).join(' '),
        row.itemName,
        quantity,
      ].filter(Boolean);
      return `- ${parts.join(' · ')}`;
    });

  return [
    ru ? `Еда и напитки ${label}:` : `Food and drinks ${label}:`,
    food.length ? `${ru ? 'Еда' : 'Food'}:\n${renderRows(food).join('\n')}` : null,
    drinks.length ? `${ru ? 'Напитки' : 'Drinks'}:\n${renderRows(drinks).join('\n')}` : null,
    ru
      ? `Итог: ${food.length} записей о еде, ${drinks.length} записей о напитках. Калории и БЖУ не рассчитываются.`
      : `Total: ${food.length} food records, ${drinks.length} drink records. Calories and macros are not calculated.`,
    timezoneNote,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function formatIntakeSaved(
  items: ParsedIntakeItem[],
  language: 'ru' | 'en'
): string {
  const ru = language === 'ru';
  const lines = items.map((item) => {
    const quantity = [item.quantity === null ? '' : String(item.quantity), item.unit || '']
      .filter(Boolean)
      .join(' ');
    return `- ${item.itemName}${quantity ? ` · ${quantity}` : ''}`;
  });
  return [ru ? 'Записал:' : 'Recorded:', ...lines].join('\n');
}

export function formatIntakeDeleted(language: 'ru' | 'en'): string {
  return language === 'ru'
    ? 'Удалил последнюю запись о еде или напитке.'
    : 'Deleted the last food or drink record.';
}

export function formatIntakeCorrected(
  log: IntakeLog,
  language: 'ru' | 'en'
): string {
  return language === 'ru'
    ? `Исправил последнюю запись: ${log.itemName}${log.quantity !== null ? ` · ${log.quantity}${log.unit ? ` ${log.unit}` : ''}` : ''}.`
    : `Corrected the last record: ${log.itemName}${log.quantity !== null ? ` · ${log.quantity}${log.unit ? ` ${log.unit}` : ''}` : ''}.`;
}

export function intakeQueryLabel(query: IntakeQueryIntent, language: 'ru' | 'en'): string {
  return periodLabel(query.period, language);
}
