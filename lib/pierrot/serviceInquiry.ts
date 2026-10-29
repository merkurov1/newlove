import type { PierrotChatAction, PierrotMessageLink } from '@/lib/pierrot/navigation';
import type { PierrotIntent } from '@/lib/pierrot/intents';

export function isServiceLeadIntent(intent: PierrotIntent): boolean {
  return intent.name === 'service_inquiry' && !intent.accessRequest;
}

export type ServiceNeed = 'acquisition' | 'analysis' | 'consultation' | 'other';
export type ServiceStage = 'exploring' | 'comparing' | 'ready' | 'in_progress' | 'unsure';
export type ServiceTimeline = 'this_month' | 'this_quarter' | 'no_fixed_date';
export type ServiceLeadStatus = 'new' | 'qualified' | 'contact_requested' | 'contacted' | 'closed';
export type ServiceQuestion = 'need' | 'stage' | 'timeline';

export type ServiceInquiryState = {
  id: string;
  status: ServiceLeadStatus;
  needType: ServiceNeed | null;
  stage: ServiceStage | null;
  timeline: ServiceTimeline | null;
  questionsAsked: number;
  qualified: boolean;
  nextQuestion: ServiceQuestion | null;
  summary: string;
};

export type ServiceInquiryAnswer = {
  needType: ServiceNeed | null;
  stage: ServiceStage | null;
  timeline: ServiceTimeline | null;
};

export type ServiceInquiryRendered = {
  reply: string;
  actions: PierrotChatAction[];
  links: PierrotMessageLink[];
  useExternalContact: boolean;
};

const MAX_QUALIFYING_QUESTIONS = 3;

function lower(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export function parseServiceNeed(value: string): ServiceNeed | null {
  const text = lower(value);

  if (
    hasAny(text, [
      'consult',
      'advice',
      'advisory',
      'advising',
      'strategy session',
      'second opinion',
      'консультац',
      'совет',
      'адвайзинг',
    ])
  ) {
    return 'consultation';
  }

  if (
    hasAny(text, [
      'analys',
      'analyze',
      'analysis',
      'valuation',
      'appraisal',
      'provenance',
      'due diligence',
      'research',
      'анализ',
      'оценк',
      'исследован',
      'провенанс',
      'экспертиз',
    ])
  ) {
    return 'analysis';
  }

  if (
    hasAny(text, [
      'acquire',
      'acquisition',
      'buy a work',
      'purchase a work',
      'collect',
      'collector',
      'подбор',
      'приобрет',
      'купить работу',
      'собрать коллекц',
    ])
  ) {
    return 'acquisition';
  }

  if (hasAny(text, ['something else', 'other', 'другое', 'иное'])) {
    return 'other';
  }

  return null;
}

export function parseServiceStage(value: string): ServiceStage | null {
  const text = lower(value);

  if (
    hasAny(text, [
      'in progress',
      'already started',
      'already working',
      'underway',
      'в процессе',
      'уже начал',
      'уже работа',
    ])
  ) {
    return 'in_progress';
  }

  if (hasAny(text, ['not sure', 'unsure', "don't know", 'do not know', 'не знаю', 'не уверен'])) {
    return 'unsure';
  }

  if (hasAny(text, ['ready to move', 'ready to proceed', 'decided', 'готов', 'решил'])) {
    return 'ready';
  }

  if (
    hasAny(text, [
      'comparing',
      'compare options',
      'shortlist',
      'several options',
      'сравнива',
      'варианты',
      'шортлист',
    ])
  ) {
    return 'comparing';
  }

  if (
    hasAny(text, [
      'exploring',
      'looking',
      'thinking',
      'early stage',
      'researching',
      'изуча',
      'присматрива',
      'в начале',
      'исследую',
    ])
  ) {
    return 'exploring';
  }

  return null;
}

export function parseServiceTimeline(value: string): ServiceTimeline | null {
  const text = lower(value);

  if (
    hasAny(text, [
      'this month',
      'as soon as possible',
      'asap',
      'urgent',
      'within weeks',
      'этот месяц',
      'срочно',
      'в течение недел',
      'как можно скорее',
    ])
  ) {
    return 'this_month';
  }

  if (
    hasAny(text, [
      'this quarter',
      'next quarter',
      'within months',
      'few months',
      'квартал',
      'в течение нескольк',
      'несколько месяц',
    ])
  ) {
    return 'this_quarter';
  }

  if (
    hasAny(text, [
      'no fixed date',
      'no timeline',
      'not urgent',
      'flexible',
      'whenever',
      'без срока',
      'не срочно',
      'гибк',
      'когда получится',
    ])
  ) {
    return 'no_fixed_date';
  }

  return null;
}

export function parseServiceInquiryAnswer(value: string): ServiceInquiryAnswer {
  return {
    needType: parseServiceNeed(value),
    stage: parseServiceStage(value),
    timeline: parseServiceTimeline(value),
  };
}

export function serviceIsQualified(
  state: Pick<ServiceInquiryState, 'needType' | 'stage'>
): boolean {
  return Boolean(state.needType && state.stage);
}

function nextMissingQuestion(
  state: Pick<ServiceInquiryState, 'needType' | 'stage' | 'timeline' | 'questionsAsked'>
): ServiceQuestion | null {
  if (state.questionsAsked >= MAX_QUALIFYING_QUESTIONS) return null;
  if (!state.needType) return 'need';
  if (!state.stage) return 'stage';
  if (!state.timeline) return 'timeline';
  return null;
}

export function advanceServiceInquiryState(
  current: ServiceInquiryState,
  message: string
): ServiceInquiryState {
  if (
    current.status === 'contact_requested' ||
    current.status === 'contacted' ||
    current.status === 'closed'
  ) {
    return current;
  }

  const parsed = parseServiceInquiryAnswer(message);
  const needType = current.needType ?? parsed.needType;
  const stage = current.stage ?? parsed.stage;
  const timeline = current.timeline ?? parsed.timeline;

  const qualified = Boolean(needType && stage);
  const nextQuestion = nextMissingQuestion({
    needType,
    stage,
    timeline,
    questionsAsked: current.questionsAsked,
  });

  return {
    ...current,
    needType,
    stage,
    timeline,
    qualified,
    status: qualified ? 'qualified' : 'new',
    nextQuestion,
    // The caller increments this only when it actually asks the question.
    questionsAsked: current.questionsAsked,
    summary: buildServiceSummary({ needType, stage, timeline }),
  };
}

export function markServiceQuestionAsked(state: ServiceInquiryState): ServiceInquiryState {
  if (!state.nextQuestion) return state;

  return {
    ...state,
    questionsAsked: state.questionsAsked + 1,
  };
}

const NEED_LABELS: Record<'ru' | 'en', Record<ServiceNeed, string>> = {
  ru: {
    acquisition: 'приобретение',
    analysis: 'анализ работы или коллекции',
    consultation: 'консультация',
    other: 'другой запрос',
  },
  en: {
    acquisition: 'acquisition',
    analysis: 'analysis of a work or collection',
    consultation: 'consultation',
    other: 'another request',
  },
};

const STAGE_LABELS: Record<'ru' | 'en', Record<ServiceStage, string>> = {
  ru: {
    exploring: 'изучаю',
    comparing: 'сравниваю варианты',
    ready: 'готова к следующему шагу',
    in_progress: 'уже в процессе',
    unsure: 'пока не уверен',
  },
  en: {
    exploring: 'exploring',
    comparing: 'comparing options',
    ready: 'ready to move',
    in_progress: 'already in progress',
    unsure: 'not sure yet',
  },
};

const TIMELINE_LABELS: Record<'ru' | 'en', Record<ServiceTimeline, string>> = {
  ru: {
    this_month: 'этот месяц',
    this_quarter: 'этот квартал',
    no_fixed_date: 'без фиксированного срока',
  },
  en: {
    this_month: 'this month',
    this_quarter: 'this quarter',
    no_fixed_date: 'no fixed date',
  },
};

export function buildServiceSummary(
  state: Pick<ServiceInquiryState, 'needType' | 'stage' | 'timeline'>
): string {
  const parts: string[] = [];

  if (state.needType) parts.push(state.needType);
  if (state.stage) parts.push(state.stage);
  if (state.timeline) parts.push(state.timeline);

  return parts.join(' / ');
}

function needActions(language: 'ru' | 'en' | 'und'): PierrotChatAction[] {
  const ru = language === 'ru';

  return [
    {
      kind: 'prompt',
      label: ru ? 'Приобретение' : 'Acquire a work',
      prompt: ru ? 'Приобретение работы' : 'Acquire a work',
    },
    {
      kind: 'prompt',
      label: ru ? 'Анализ' : 'Analyse',
      prompt: ru ? 'Анализ работы или коллекции' : 'Analyse a work or collection',
    },
    {
      kind: 'prompt',
      label: ru ? 'Консультация' : 'Consultation',
      prompt: ru ? 'Консультация' : 'A consultation',
    },
    {
      kind: 'prompt',
      label: ru ? 'Другое' : 'Something else',
      prompt: ru ? 'Другой запрос' : 'Something else',
    },
  ];
}

function stageActions(language: 'ru' | 'en' | 'und'): PierrotChatAction[] {
  const ru = language === 'ru';

  return [
    {
      kind: 'prompt',
      label: ru ? 'Изучаю' : 'Exploring',
      prompt: ru ? 'Изучаю' : 'I am exploring',
    },
    {
      kind: 'prompt',
      label: ru ? 'Сравниваю' : 'Comparing',
      prompt: ru ? 'Сравниваю варианты' : 'I am comparing options',
    },
    {
      kind: 'prompt',
      label: ru ? 'Готов двигаться' : 'Ready to move',
      prompt: ru ? 'Готова к следующему шагу' : 'Ready to move',
    },
    {
      kind: 'prompt',
      label: ru ? 'Уже в процессе' : 'In progress',
      prompt: ru ? 'Уже в процессе' : 'Already in progress',
    },
  ];
}

function timelineActions(language: 'ru' | 'en' | 'und'): PierrotChatAction[] {
  const ru = language === 'ru';

  return [
    {
      kind: 'prompt',
      label: ru ? 'Этот месяц' : 'This month',
      prompt: ru ? 'Этот месяц' : 'This month',
    },
    {
      kind: 'prompt',
      label: ru ? 'Этот квартал' : 'This quarter',
      prompt: ru ? 'Этот квартал' : 'This quarter',
    },
    {
      kind: 'prompt',
      label: ru ? 'Без срока' : 'No fixed date',
      prompt: ru ? 'Без фиксированного срока' : 'No fixed date',
    },
  ];
}

export function renderServiceInquiry(
  state: ServiceInquiryState,
  language: 'ru' | 'en' | 'und'
): ServiceInquiryRendered {
  const ru = language === 'ru';

  if (
    state.status === 'contact_requested' ||
    state.status === 'contacted' ||
    state.status === 'closed'
  ) {
    return {
      reply: ru
        ? 'Этот запрос уже отправлен. Повторно контакт отправлять не нужно.'
        : 'This request has already been sent. There is no need to submit the contact again.',
      actions: [],
      links: [],
      useExternalContact: false,
    };
  }

  if (state.nextQuestion === 'need') {
    return {
      reply: ru
        ? 'Чтобы направить запрос правильно, нужно два-три коротких вопроса. Что за задача: приобретение, анализ работы или коллекции, консультация или что-то другое?'
        : 'I can route this properly with two or three short questions. What is the task: acquiring a work, analysing a work or collection, a consultation, or something else?',
      actions: needActions(language),
      links: [],
      useExternalContact: false,
    };
  }

  if (state.nextQuestion === 'stage') {
    return {
      reply: ru
        ? 'На какой стадии задача: изучаете, сравниваете варианты, готовы двигаться дальше или уже в процессе?'
        : 'Where are you in the process: exploring, comparing options, ready to move, or already in progress?',
      actions: stageActions(language),
      links: [],
      useExternalContact: false,
    };
  }

  if (state.nextQuestion === 'timeline') {
    return {
      reply: ru
        ? 'Есть ли ориентировочный срок: этот месяц, этот квартал или без фиксированной даты?'
        : 'Is there a timeline: this month, this quarter, or no fixed date?',
      actions: timelineActions(language),
      links: [],
      useExternalContact: false,
    };
  }

  if (state.qualified) {
    const need = state.needType ? NEED_LABELS[ru ? 'ru' : 'en'][state.needType] : '—';
    const stage = state.stage ? STAGE_LABELS[ru ? 'ru' : 'en'][state.stage] : '—';
    const timeline = state.timeline
      ? TIMELINE_LABELS[ru ? 'ru' : 'en'][state.timeline]
      : ru
        ? 'срок не указан'
        : 'no timeline given';

    return {
      reply: ru
        ? `Кратко: задача — ${need}; стадия — ${stage}; срок — ${timeline}. Проверь резюме и оставь контакт только если хочешь, чтобы команда связалась с тобой.`
        : `Summary: need — ${need}; stage — ${stage}; timing — ${timeline}. Review it and leave contact details only if you want the team to follow up.`,
      actions: [],
      links: [
        {
          label: ru ? 'Проверить запрос' : 'Review the request',
          href: `/advising/request?lead=${encodeURIComponent(state.id)}${
            ru ? '&lang=ru' : '&lang=en'
          }`,
        },
      ],
      useExternalContact: false,
    };
  }

  return {
    reply: ru
      ? 'После трёх вопросов у меня всё ещё нет подтверждённой задачи и стадии, поэтому я не буду отмечать запрос как квалифицированный. Продолжить можно через существующий контакт Advising.'
      : 'After three questions I still do not have a confirmed need and stage, so I will not mark this as qualified. The existing Advising contact can continue directly.',
    actions: [],
    links: [],
    useExternalContact: true,
  };
}
