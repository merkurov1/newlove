import React from 'react';
import Link from 'next/link';

import type {
  ParticipantKey,
  PublicDeepSeek,
  PublicDistribution,
  PublicEditorialEvent,
  PublicMonth,
  PublicParticipant,
  PublicTelegramCase,
} from '@/lib/telegram-research/public-case';

const numberFormat = new Intl.NumberFormat('ru-RU');

function formatNumber(value: number): string {
  return numberFormat.format(value);
}

function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits).replace('.', ',')}%`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatMonth(value: string): string {
  const [year, month] = value.split('-');
  if (!year || !month) return value;
  return `${month}.${year.slice(2)}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)} сек`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} мин`;
  if (seconds < 86_400) return `${(seconds / 3600).toFixed(1).replace('.', ',')} ч`;
  return `${(seconds / 86_400).toFixed(1).replace('.', ',')} дн`;
}

function participantLabel(data: PublicTelegramCase, key: ParticipantKey): string {
  return data.participants.find((item) => item.key === key)?.displayName ?? key;
}

function Section({
  eyebrow,
  title,
  children,
  id,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="border-t border-stone-300/80 py-14 md:py-20">
      <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#A8402C]">
            {eyebrow}
          </p>
          <h2 className="mt-2 font-serif text-3xl font-light tracking-tight text-stone-900 md:text-5xl">
            {title}
          </h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function BigStat({
  value,
  label,
  note,
  accent = false,
}: {
  value: string;
  label: string;
  note?: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p
        className={`font-serif text-4xl font-light leading-none tracking-tight md:text-5xl ${
          accent ? 'text-[#A8402C]' : 'text-stone-900'
        }`}
      >
        {value}
      </p>
      <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.18em] text-stone-500">
        {label}
      </p>
      {note ? <p className="mt-1 text-xs leading-relaxed text-stone-500">{note}</p> : null}
    </div>
  );
}

function MonthlyChart({ months }: { months: PublicMonth[] }) {
  if (months.length === 0) return null;

  const width = 1180;
  const height = 300;
  const left = 20;
  const bottom = 34;
  const chartHeight = 220;
  const max = Math.max(...months.map((item) => item.total), 1);
  const step = (width - left * 2) / months.length;
  const barWidth = Math.min(22, step * 0.62);

  return (
    <div className="overflow-x-auto pb-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto min-w-[860px] w-full"
        role="img"
        aria-label="Активность по месяцам"
      >
        <line
          x1={left}
          y1={height - bottom}
          x2={width - left}
          y2={height - bottom}
          stroke="#d6d3d1"
          strokeWidth="1"
        />

        {[0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = height - bottom - chartHeight * fraction;
          return (
            <line
              key={fraction}
              x1={left}
              y1={y}
              x2={width - left}
              y2={y}
              stroke="#e7e5e4"
              strokeDasharray="3 5"
              strokeWidth="1"
            />
          );
        })}

        {months.map((month, index) => {
          const x = left + index * step + (step - barWidth) / 2;
          const totalHeight = (month.total / max) * chartHeight;
          const selfHeight = month.total === 0 ? 0 : (month.self / month.total) * totalHeight;
          const peerHeight = totalHeight - selfHeight;
          const baseY = height - bottom;
          const showLabel = index % 3 === 0 || month.month.endsWith('-01');

          return (
            <g key={month.month}>
              <title>{`${month.month}: ${formatNumber(month.total)} сообщений`}</title>
              <rect
                x={x}
                y={baseY - peerHeight}
                width={barWidth}
                height={peerHeight}
                rx="2"
                fill="#292524"
              />
              <rect
                x={x}
                y={baseY - peerHeight - selfHeight}
                width={barWidth}
                height={selfHeight}
                rx="2"
                fill="#A8402C"
              />
              {showLabel ? (
                <text
                  x={x + barWidth / 2}
                  y={height - 12}
                  textAnchor="end"
                  transform={`rotate(-45 ${x + barWidth / 2} ${height - 12})`}
                  fontSize="11"
                  fill="#78716c"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {formatMonth(month.month)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DistributionRows({
  items,
  max,
}: {
  items: Array<{ label: string; value: number; note?: string }>;
  max: number;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[3.2rem_1fr_3.6rem] items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
            {item.label}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-stone-200/80">
            <span
              className="block h-full rounded-full bg-[#141210]"
              style={{ width: `${max > 0 ? (item.value / max) * 100 : 0}%` }}
            />
          </span>
          <span className="text-right font-mono text-[10px] tabular-nums text-stone-600">
            {formatNumber(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function LengthCard({
  label,
  distribution,
  unit,
}: {
  label: string;
  distribution: PublicDistribution;
  unit: string;
}) {
  return (
    <div className="border-t border-stone-300/70 pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-stone-500">
          {label}
        </span>
        <span className="font-serif text-3xl font-light text-stone-900">
          {formatNumber(distribution.median)}
        </span>
      </div>
      <p className="mt-1 text-xs text-stone-500">
        медиана, {unit}; среднее — {formatNumber(Math.round(distribution.mean))}, p90 —{' '}
        {formatNumber(distribution.p90)}
      </p>
    </div>
  );
}

function ParticipantColumn({
  participant,
  accent,
}: {
  participant: PublicParticipant;
  accent: boolean;
}) {
  return (
    <div className={accent ? 'text-[#A8402C]' : 'text-stone-900'}>
      <div className="flex items-baseline justify-between gap-4 border-b border-stone-300/70 pb-4">
        <div>
          <p className="font-serif text-2xl font-light md:text-3xl">{participant.displayName}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] opacity-60">
            @{participant.username || '—'}
          </p>
        </div>
        <p className="font-serif text-4xl font-light md:text-5xl">
          {formatNumber(participant.messages)}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-stone-500">Доля</p>
          <p className="mt-1 font-serif text-xl">{formatPercent(participant.share)}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-stone-500">Символы</p>
          <p className="mt-1 font-serif text-xl">{formatNumber(participant.characters)}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-stone-500">Слова</p>
          <p className="mt-1 font-serif text-xl">{formatNumber(participant.words)}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-stone-500">Ссылки</p>
          <p className="mt-1 font-serif text-xl">{formatNumber(participant.links)}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-stone-500">Медиа</p>
          <p className="mt-1 font-serif text-xl">{formatNumber(participant.media)}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-stone-500">
            Начал сессий
          </p>
          <p className="mt-1 font-serif text-xl">{formatNumber(participant.sessionsStarted)}</p>
        </div>
      </div>

      <div className="mt-6 space-y-3 border-t border-stone-300/70 pt-5 text-xs leading-relaxed text-stone-600">
        <p>
          Медианное сообщение: <strong>{formatNumber(participant.medianCharacters)}</strong>{' '}
          символов, <strong>{formatNumber(participant.medianWords)}</strong> слов.
        </p>
        <p>
          Прямых ответов: <strong>{formatNumber(participant.directRepliesSent)}</strong>, медиана{' '}
          <strong>{formatDuration(participant.medianDirectReplySeconds)}</strong>.
        </p>
        <p>
          Оценочных ответов: <strong>{formatNumber(participant.estimatedRepliesSent)}</strong>,
          медиана <strong>{formatDuration(participant.medianEstimatedReplySeconds)}</strong>.
        </p>
      </div>

      <p className="mt-5 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-400">
        {formatDate(participant.firstMessageAt)} — {formatDate(participant.lastMessageAt)}
      </p>
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  assignment: 'Поручение',
  deadline: 'Срок',
  text_delivery: 'Сдача текста',
  revision_request: 'Правки',
  approval: 'Согласование',
  publication_link: 'Публикация',
  task_completion: 'Завершение',
  other: 'Другое',
};

const STATUS_LABELS: Record<string, string> = {
  stated: 'заявлено',
  agreed: 'согласовано',
  in_progress: 'в работе',
  completed: 'завершено',
  cancelled: 'отменено',
  uncertain: 'неясно',
};

function EventRow({ event }: { event: PublicEditorialEvent }) {
  return (
    <article className="grid gap-3 border-t border-stone-300/70 py-5 md:grid-cols-[8.5rem_1fr]">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#A8402C]">
          {EVENT_LABELS[event.type] ?? event.type}
        </p>
        <p className="mt-1 font-mono text-[10px] text-stone-500">{formatDate(event.date)}</p>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-stone-400">
          {STATUS_LABELS[event.status] ?? event.status}
        </p>
      </div>
      <div>
        <p className="font-serif text-lg leading-snug text-stone-900 md:text-xl">{event.summary}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[9px] uppercase tracking-[0.12em] text-stone-500">
          <span>уверенность {formatPercent(event.confidence, 0)}</span>
          <span>{event.sourceCount} сообщ.</span>
          {event.deadline?.date ? <span>дедлайн {formatDate(event.deadline.date)}</span> : null}
          {event.participants.length > 0 ? <span>{event.participants.join(' · ')}</span> : null}
        </div>
      </div>
    </article>
  );
}

function DeepSeekSection({
  deepseek,
  period,
}: {
  deepseek: PublicDeepSeek;
  period: { from: string; to: string };
}) {
  return (
    <Section eyebrow="AI synthesis" title="Что удалось извлечь">
      <div className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr]">
        <div>
          <p className="max-w-3xl font-serif text-xl font-light leading-relaxed text-stone-800 md:text-2xl">
            {deepseek.summary}
          </p>
          <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500">
            AI-сводка; точный диапазон корпуса: {formatDate(period.from)} — {formatDate(period.to)}.
          </p>

          {deepseek.editorialEvents.length > 0 ? (
            <div className="mt-10">
              <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">
                Редакционные события
              </p>
              {deepseek.editorialEvents.map((event, index) => (
                <EventRow key={`${event.type}-${event.date ?? 'undated'}-${index}`} event={event} />
              ))}
            </div>
          ) : null}

          {deepseek.timeline.length > 0 ? (
            <div className="mt-10">
              <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">
                Хронология
              </p>
              <div className="space-y-4 border-l border-stone-300/80 pl-5">
                {deepseek.timeline.map((item, index) => (
                  <div key={`${item.date ?? 'undated'}-${index}`} className="relative">
                    <span className="absolute -left-[23px] top-2 h-1.5 w-1.5 rounded-full bg-[#A8402C]" />
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-400">
                      {formatDate(item.date)}
                    </p>
                    <p className="mt-1 font-serif text-base leading-relaxed text-stone-800">
                      {item.summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
              Повторяющиеся темы
            </p>
            <div className="mt-4 space-y-3">
              {deepseek.recurringThemes.map((theme) => (
                <div key={theme.label} className="border-t border-stone-300/70 pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-serif text-base text-stone-900">{theme.label}</p>
                    <span className="font-mono text-[9px] text-stone-400">
                      {formatPercent(theme.confidence, 0)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">{theme.summary}</p>
                </div>
              ))}
            </div>
          </div>

          {deepseek.openQuestions.length > 0 ? (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
                Открытые вопросы
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-stone-600">
                {deepseek.openQuestions.map((question) => (
                  <li key={question} className="border-l border-stone-300 pl-3">
                    {question}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>

      {deepseek.linguisticObservations.length > 0 ? (
        <div className="mt-12 border-t border-stone-300/80 pt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">
            Наблюдения о языке
          </p>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-stone-500">
            Только наблюдаемые особенности и отдельно маркированные интерпретации. Это не
            диагностика личности и не утверждения о мотивах.
          </p>
          <div className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
            {deepseek.linguisticObservations.map((observation, index) => (
              <div
                key={`${observation.kind}-${index}`}
                className="border-t border-stone-300/70 pt-4"
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#A8402C]">
                  {observation.kind === 'observable' ? 'наблюдаемо' : 'интерпретация'}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-stone-700">
                  {observation.observation}
                </p>
                {observation.alternativeInterpretations.length > 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-stone-500">
                    Альтернативы: {observation.alternativeInterpretations.join('; ')}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-10 max-w-3xl text-xs leading-relaxed text-stone-500">
        {deepseek.disclaimer}
      </p>
    </Section>
  );
}

export default function TelegramCaseView({
  data,
  caseNumber = 1,
}: {
  data: PublicTelegramCase;
  caseNumber?: number;
}) {
  const self = data.participants.find((item) => item.key === 'self');
  const peer = data.participants.find((item) => item.key === 'peer');
  const maxWeekday = Math.max(...data.activity.byWeekday.map((item) => item.total), 1);
  const maxHour = Math.max(...data.activity.byHour.map((item) => item.total), 1);
  const totalYears = data.activity.byYear.reduce((sum, item) => sum + item.total, 0);
  const activityYears = data.activity.byYear.map((item) => item.year).sort();
  const activityRange =
    activityYears.length > 0
      ? `${activityYears[0]}–${activityYears[activityYears.length - 1]}`
      : '';

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#141210] selection:bg-[#141210] selection:text-[#FAF8F5]">
      <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-28 sm:px-8 md:pt-36 lg:px-12">
        <nav className="mb-10 flex items-center justify-between border-b border-stone-300/80 pb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500">
          <Link href="/research" className="transition-colors hover:text-[#A8402C]">
            ← Research
          </Link>
          <span>Telegram Research / Case {String(caseNumber).padStart(2, '0')}</span>
        </nav>

        <header className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#A8402C]">
              Полный текстовый анализ личного диалога
            </p>
            <h1 className="mt-5 max-w-4xl font-serif text-5xl font-light leading-[0.95] tracking-tight text-stone-900 sm:text-7xl lg:text-8xl">
              {data.chat.title}
            </h1>
            <p className="mt-5 font-mono text-xs uppercase tracking-[0.2em] text-stone-500">
              @{data.chat.username} · {formatDate(data.period.from)} — {formatDate(data.period.to)}
            </p>
            <p className="mt-8 max-w-2xl font-serif text-xl font-light leading-relaxed text-stone-700 md:text-2xl">
              {formatNumber(data.totals.messages)} сообщений, {data.totals.participants} участника и{' '}
              {activityRange} — текстовый корпус без изображений, без скачивания медиа и без
              непроверенных выводов о личности.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-t border-stone-300/80 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <BigStat value={formatNumber(data.totals.messages)} label="сообщений" accent />
            <BigStat value={formatNumber(data.sessions.count)} label="разговорных сессий" />
            <BigStat value={formatNumber(data.totals.media)} label="медиа, только метаданные" />
            <BigStat
              value={formatNumber(data.responses.direct.count)}
              label="прямых reply-ответов"
            />
          </div>
        </header>

        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-stone-300/80 py-4 font-mono text-[9px] uppercase tracking-[0.16em] text-stone-500">
          <span className="text-[#A8402C]">completeness: {data.completeness.status}</span>
          <span>strategy: {data.export.strategy}</span>
          <span>duplicates dropped: {formatNumber(data.export.duplicatesDropped)}</span>
          <span>source timezone: {data.export.sourceTimezone}</span>
          <span>display timezone: {data.methodology.timezone ?? 'UTC'}</span>
        </div>

        <Section eyebrow="Corpus" title="Корпус">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <BigStat value={formatNumber(data.totals.withText)} label="с текстом" />
            <BigStat value={formatNumber(data.totals.withoutText)} label="без текста" />
            <BigStat value={formatNumber(data.totals.edited)} label="редактирований" />
            <BigStat value={formatNumber(data.totals.forwarded)} label="пересылок" />
            <BigStat value={formatNumber(data.totals.replies)} label="reply-связей" />
            <BigStat value={formatNumber(data.totals.service)} label="сервисных сообщений" />
            <BigStat
              value={formatNumber(data.lengths.messagesWithLinks)}
              label="сообщений со ссылками"
            />
            <BigStat value={formatNumber(data.lengths.totalLinks)} label="ссылок всего" />
          </div>

          <div className="mt-10 grid gap-x-10 gap-y-5 md:grid-cols-3">
            <LengthCard label="Символы" distribution={data.lengths.characters} unit="симв." />
            <LengthCard label="Слова" distribution={data.lengths.words} unit="слов" />
            <LengthCard label="Ссылки" distribution={data.lengths.linksPerMessage} unit="ссылок" />
          </div>
        </Section>

        <Section eyebrow="Participants" title="Кто говорил">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            {self ? <ParticipantColumn participant={self} accent /> : null}
            {peer ? <ParticipantColumn participant={peer} accent={false} /> : null}
          </div>

          <div className="mt-10">
            <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500">
              <span>
                {formatPercent(data.participants.find((item) => item.key === 'self')?.share ?? 0)}
              </span>
              <span>баланс сообщений</span>
              <span>
                {formatPercent(data.participants.find((item) => item.key === 'peer')?.share ?? 0)}
              </span>
            </div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-stone-200">
              <span
                className="h-full bg-[#A8402C]"
                style={{
                  width: `${(data.participants.find((item) => item.key === 'self')?.share ?? 0) * 100}%`,
                }}
              />
              <span
                className="h-full bg-[#292524]"
                style={{
                  width: `${(data.participants.find((item) => item.key === 'peer')?.share ?? 0) * 100}%`,
                }}
              />
            </div>
          </div>
        </Section>

        <Section eyebrow="Rhythm" title="Ритм разговора">
          <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#A8402C]" />
              {participantLabel(data, 'self')}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#292524]" />
              {participantLabel(data, 'peer')}
            </span>
            <span>месяцы, {activityRange}</span>
          </div>
          <MonthlyChart months={data.activity.byMonth} />

          <div className="mt-10 grid gap-8 border-t border-stone-300/70 pt-8 md:grid-cols-3">
            {data.activity.byYear.map((year) => (
              <div key={year.year}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-serif text-3xl font-light">{year.year}</p>
                  <p className="font-mono text-[10px] text-stone-500">{formatNumber(year.total)}</p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-200">
                  <span
                    className="block h-full bg-[#141210]"
                    style={{ width: `${totalYears > 0 ? (year.total / totalYears) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div>
              <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
                Дни недели
              </p>
              <DistributionRows
                items={data.activity.byWeekday.map((item) => ({
                  label: item.label.slice(0, 3),
                  value: item.total,
                }))}
                max={maxWeekday}
              />
            </div>
            <div>
              <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
                Часы, {data.methodology.timezone ?? 'UTC'}
              </p>
              <div className="grid grid-cols-2 gap-x-6">
                <DistributionRows
                  items={data.activity.byHour.slice(0, 12).map((item) => ({
                    label: `${String(item.hour).padStart(2, '0')}:00`,
                    value: item.total,
                  }))}
                  max={maxHour}
                />
                <DistributionRows
                  items={data.activity.byHour.slice(12).map((item) => ({
                    label: `${String(item.hour).padStart(2, '0')}:00`,
                    value: item.total,
                  }))}
                  max={maxHour}
                />
              </div>
            </div>
          </div>
        </Section>

        <Section eyebrow="Replies & sessions" title="Паузы и ответы">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <p className="max-w-xl text-sm leading-relaxed text-stone-600">
                Прямой ответ — только сообщение с reply-связью, у которой найдена цель. Оценочный
                ответ — следующее сообщение другого участника без reply в пределах 6 часов; это
                эвристика, а не доказанный ответ. Метрики не суммируются.
              </p>

              <div className="mt-8 grid grid-cols-2 gap-8">
                <BigStat
                  value={formatNumber(data.responses.direct.count)}
                  label="прямых ответов"
                  note={`покрытие reply ${formatPercent(data.responses.replyCoverage)}`}
                />
                <BigStat
                  value={formatNumber(data.responses.estimated.count)}
                  label="оценочных ответов"
                  note="отдельная эвристика"
                />
                <BigStat
                  value={formatDuration(data.responses.direct.medianSeconds)}
                  label="медиана прямого ответа"
                />
                <BigStat
                  value={formatDuration(data.responses.estimated.medianSeconds)}
                  label="медиана оценочного"
                />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-stone-300/70 pb-3">
                <p className="font-serif text-2xl font-light">Сессии</p>
                <p className="font-mono text-[10px] text-stone-500">
                  порог {formatDuration(data.sessions.thresholdSeconds)}
                </p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-6">
                <BigStat value={formatNumber(data.sessions.count)} label="всего" />
                <BigStat
                  value={formatDuration(data.sessions.medianDurationSeconds)}
                  label="медианная длительность"
                />
                <BigStat
                  value={formatNumber(data.sessions.medianMessagesPerSession)}
                  label="медиана сообщений"
                />
                <BigStat
                  value={formatDuration(data.sessions.longest?.durationSeconds ?? null)}
                  label="самая длинная"
                  note={
                    data.sessions.longest
                      ? `${formatDate(data.sessions.longest.start)} · ${data.sessions.longest.messageCount} сообщ.`
                      : undefined
                  }
                />
              </div>
              <div className="mt-6 space-y-1 text-xs text-stone-600">
                <p>
                  Начал сессий: {participantLabel(data, 'self')} —{' '}
                  {formatNumber(data.sessions.starts.self)}, {participantLabel(data, 'peer')} —{' '}
                  {formatNumber(data.sessions.starts.peer)}.
                </p>
                <p>
                  Возобновлений после пауз ≥ {formatDuration(data.sessions.longPauseSeconds)}:{' '}
                  {formatNumber(data.sessions.longPauseGaps)}.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {data.deepseek ? <DeepSeekSection deepseek={data.deepseek} period={data.period} /> : null}

        <Section eyebrow="Method" title="Метод и ограничения">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
                Полнота
              </p>
              <ul className="mt-4 space-y-2 text-sm text-stone-700">
                {Object.entries(data.completeness.checks).map(([key, value]) => (
                  <li key={key} className="flex items-start gap-2">
                    <span className={value ? 'text-[#A8402C]' : 'text-stone-400'}>
                      {value ? '✓' : '—'}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em]">{key}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
                <BigStat
                  value={formatNumber(data.dataQuality.totalMessages ?? 0)}
                  label="сообщений проверено"
                />
                <BigStat
                  value={formatNumber(data.dataQuality.duplicateIds ?? 0)}
                  label="дубликатов ID"
                />
                <BigStat
                  value={formatNumber(data.dataQuality.outOfOrderMessages ?? 0)}
                  label="нарушений порядка"
                />
                <BigStat
                  value={formatNumber(data.dataQuality.mediaOnlyMessages ?? 0)}
                  label="только медиа"
                />
                <BigStat
                  value={formatNumber(data.dataQuality.messagesWithoutText ?? 0)}
                  label="без текста"
                />
                <BigStat
                  value={formatNumber(data.dataQuality.unresolvedReplyTargets ?? 0)}
                  label="неразрешённых reply"
                />
              </div>

              <ul className="mt-8 space-y-3 border-t border-stone-300/70 pt-6 text-xs leading-relaxed text-stone-600">
                {(data.methodology.limitations ?? []).map((limitation) => (
                  <li key={limitation} className="border-l border-stone-300 pl-3">
                    {limitation}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-10 max-w-4xl text-xs leading-relaxed text-stone-500">
            {data.privacy.note} Исходные timestamps хранятся в UTC; календарная группировка
            выполнена в {data.methodology.timezone ?? 'UTC'}. Медиа не скачивались, поэтому
            визуальный контент и голосовые сообщения не анализировались.
          </p>
        </Section>

        <footer className="mt-16 border-t border-stone-300/80 pt-8 font-mono text-[9px] uppercase tracking-[0.16em] text-stone-500">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Telegram Research / Merkurov.love</span>
            <span>case generated {formatDate(data.generatedAt)}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
