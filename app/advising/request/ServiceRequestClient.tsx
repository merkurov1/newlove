'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Lead = {
  id: string;
  status: string;
  needType: string | null;
  stage: string | null;
  timeline: string | null;
  summary: string;
  canSubmit: boolean;
  alreadySubmitted: boolean;
};

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; lead: Lead };

const NEED: Record<string, { ru: string; en: string }> = {
  acquisition: { ru: 'приобретение', en: 'acquisition' },
  analysis: { ru: 'анализ работы или коллекции', en: 'analysis of a work or collection' },
  consultation: { ru: 'консультация', en: 'consultation' },
  other: { ru: 'другой запрос', en: 'another request' },
};

const STAGE: Record<string, { ru: string; en: string }> = {
  exploring: { ru: 'изучаю', en: 'exploring' },
  comparing: { ru: 'сравниваю варианты', en: 'comparing options' },
  ready: { ru: 'готов двигаться', en: 'ready to move' },
  in_progress: { ru: 'уже в процессе', en: 'already in progress' },
  unsure: { ru: 'пока не уверен', en: 'not sure yet' },
};

const TIMELINE: Record<string, { ru: string; en: string }> = {
  this_month: { ru: 'этот месяц', en: 'this month' },
  this_quarter: { ru: 'этот квартал', en: 'this quarter' },
  no_fixed_date: { ru: 'без фиксированного срока', en: 'no fixed date' },
};

function label(
  map: Record<string, { ru: string; en: string }>,
  key: string | null,
  lang: 'ru' | 'en'
) {
  return key ? map[key]?.[lang] || key : lang === 'ru' ? 'не указано' : 'not specified';
}

export default function ServiceRequestClient() {
  const searchParams = useSearchParams();
  const leadId = searchParams?.get('lead') || '';
  const queryLang = searchParams?.get('lang') === 'ru' ? 'ru' : 'en';
  const [lang, setLang] = useState<'ru' | 'en'>(queryLang);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const ru = lang === 'ru';

  useEffect(() => {
    if (searchParams?.get('lang') === 'ru' || searchParams?.get('lang') === 'en') {
      setLang(searchParams.get('lang') as 'ru' | 'en');
    } else if (
      typeof navigator !== 'undefined' &&
      navigator.language.toLowerCase().startsWith('ru')
    ) {
      setLang('ru');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!leadId) {
      setState({ kind: 'missing' });
      return;
    }

    let active = true;

    fetch(`/api/advising/inquiries?lead=${encodeURIComponent(leadId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok || !data.lead) {
          setState({ kind: 'error', message: data.error || 'Request unavailable.' });
          return;
        }
        setState({ kind: 'ready', lead: data.lead });
      })
      .catch(() => {
        if (active) setState({ kind: 'error', message: 'Request unavailable.' });
      });

    return () => {
      active = false;
    };
  }, [leadId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!consent) {
      setError(ru ? 'Нужно явное согласие на отправку контакта.' : 'Explicit consent is required.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/advising/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, name, email, consent: true }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || (ru ? 'Не удалось отправить запрос.' : 'The request could not be sent.')
        );
      }

      setSubmitted(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : ru
            ? 'Не удалось отправить запрос.'
            : 'The request could not be sent.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] px-6 py-20 text-[#111] selection:bg-black selection:text-white">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-300/70 pb-5">
          <Link
            href="/advising"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-black"
          >
            Advising
          </Link>
          <div className="flex gap-1 font-mono text-[10px]">
            <button
              type="button"
              onClick={() => setLang('ru')}
              className={`rounded px-2 py-1 ${ru ? 'bg-black text-white' : 'text-zinc-500'}`}
            >
              RU
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`rounded px-2 py-1 ${!ru ? 'bg-black text-white' : 'text-zinc-500'}`}
            >
              EN
            </button>
          </div>
        </div>

        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          {ru ? 'Запрос на консультацию / анализ' : 'Advising / art-market request'}
        </p>

        {state.kind === 'loading' && (
          <p className="mt-6 text-sm text-zinc-500">
            {ru ? 'Загружаю резюме…' : 'Loading summary…'}
          </p>
        )}

        {state.kind === 'missing' && (
          <div className="mt-6 space-y-4">
            <h1 className="font-serif text-3xl font-light">
              {ru ? 'Нет ссылки на запрос' : 'No request reference'}
            </h1>
            <p className="text-sm leading-relaxed text-zinc-600">
              {ru
                ? 'Эта форма продолжает запрос, начатый в разговоре с Пьеро. Начните с короткого разговора или используйте существующий контакт Advising.'
                : 'This form continues a request started in a Pierrot conversation. Start there, or use the existing Advising contact.'}
            </p>
            <Link
              href="/advising"
              className="inline-block border-b border-black pb-1 font-mono text-[10px] uppercase tracking-[0.18em]"
            >
              {ru ? 'Открыть Advising' : 'Open Advising'}
            </Link>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="mt-6 space-y-4">
            <h1 className="font-serif text-3xl font-light">
              {ru ? 'Запрос недоступен' : 'Request unavailable'}
            </h1>
            <p className="text-sm text-zinc-600">{state.message}</p>
          </div>
        )}

        {state.kind === 'ready' && (
          <div className="mt-6 space-y-8">
            <div>
              <h1 className="font-serif text-3xl font-light leading-tight md:text-4xl">
                {submitted || state.lead.alreadySubmitted
                  ? ru
                    ? 'Запрос получен'
                    : 'Request received'
                  : ru
                    ? 'Проверьте резюме'
                    : 'Review the summary'}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                {submitted || state.lead.alreadySubmitted
                  ? ru
                    ? 'Контакт передан только потому, что вы дали явное согласие. Это не подтверждение начала работ и не договор.'
                    : 'Contact was shared only because you gave explicit consent. This is not a confirmation of engagement or a contract.'
                  : ru
                    ? 'Контактные данные понадобятся только если вы хотите продолжить. До отправки проверьте, что резюме верное.'
                    : 'Contact details are only needed if you want to continue. Check the summary before sending.'}
              </p>
            </div>

            <dl className="grid gap-3 border-y border-zinc-300/70 py-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                  {ru ? 'Задача' : 'Need'}
                </dt>
                <dd className="mt-1">{label(NEED, state.lead.needType, lang)}</dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                  {ru ? 'Стадия' : 'Stage'}
                </dt>
                <dd className="mt-1">{label(STAGE, state.lead.stage, lang)}</dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                  {ru ? 'Срок' : 'Timeline'}
                </dt>
                <dd className="mt-1">{label(TIMELINE, state.lead.timeline, lang)}</dd>
              </div>
            </dl>

            {!submitted && !state.lead.alreadySubmitted && state.lead.canSubmit && (
              <form onSubmit={submit} className="space-y-5">
                <label className="block text-xs uppercase tracking-[0.14em] text-zinc-500">
                  {ru ? 'Имя (необязательно)' : 'Name (optional)'}
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={100}
                    className="mt-2 w-full border-0 border-b border-zinc-300 bg-transparent py-3 text-sm outline-none focus:border-black"
                  />
                </label>

                <label className="block text-xs uppercase tracking-[0.14em] text-zinc-500">
                  Email *
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    maxLength={254}
                    className="mt-2 w-full border-0 border-b border-zinc-300 bg-transparent py-3 text-sm outline-none focus:border-black"
                  />
                </label>

                <label className="flex items-start gap-3 text-sm leading-relaxed text-zinc-600">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    {ru
                      ? 'Я явно согласен на отправку имени и email владельцу сайта, чтобы он мог ответить на этот запрос.'
                      : 'I explicitly consent to sending my name and email to the site owner so they can reply to this request.'}
                  </span>
                </label>

                {error && <p className="text-sm text-rose-600">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-black px-6 py-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white disabled:opacity-50"
                >
                  {submitting
                    ? ru
                      ? 'Отправка…'
                      : 'Sending…'
                    : ru
                      ? 'Отправить запрос'
                      : 'Send request'}
                </button>
              </form>
            )}

            {!state.lead.canSubmit && !state.lead.alreadySubmitted && (
              <p className="text-sm leading-relaxed text-zinc-600">
                {ru
                  ? 'Для этого запроса пока не хватает подтверждённой задачи и стадии. Вернитесь в разговор с Пьеро, чтобы уточнить их.'
                  : 'This request does not yet have a confirmed need and stage. Return to the Pierrot conversation to clarify them.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
