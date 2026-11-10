/**
 * Deterministic action-integrity guard.
 *
 * Natural language is never evidence that a write happened. This module
 * detects requests that look like configuration writes and responses that
 * claim a write, and it produces an explicit unsupported/read-only answer when
 * no verified write tool was executed.
 */

import { detectArtEngineModeCommand } from '@/lib/pierrot/artEngineMode';
import { isContextRecoveryRequest } from '@/lib/pierrot/correction';

export type ActionExecutionStatus =
  | 'requested'
  | 'started'
  | 'succeeded'
  | 'failed'
  | 'unsupported'
  | 'read_only';

export type ConfigurationWriteRequest = {
  requested: true;
  kind: 'analytics_configuration' | 'external_configuration';
  status: ActionExecutionStatus;
  writeToolAvailable: false;
  values: {
    accountId: string | null;
    propertyId: string | null;
    measurementId: string | null;
  };
};

const WRITE_VERB =
  /(вставь|вставить|вставь\s+сам|настрой|настроить|обнови|обновить|измени|изменить|сохрани|сохранить|примени|применить|подключи|подключить|установи|установить|пропиши|прописать|запиши|записать|set|insert|update|change|configure|connect|apply|save|write|enable|activate)/i;
const CONFIG_CONTEXT =
  /(конфиг|настройк|параметр|переменн|env\b|account\s*id|property\s*id|measurement\s*id|ga4|google\s+analytics|аналитик|analytics|measurement|property|account|интеграц|integration|credential|токен|token)/i;
const GA_MEASUREMENT = /\bG-[A-Z0-9]{6,}\b/i;
const GA_NUMERIC_ID = /\b\d{6,12}\b/;

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

export function detectConfigurationWriteRequest(
  message: string
): ConfigurationWriteRequest | null {
  const text = normalize(message);
  if (!text) return null;

  const hasIds = GA_MEASUREMENT.test(message) || GA_NUMERIC_ID.test(message);
  const hasWrite = WRITE_VERB.test(text);
  const hasConfig = CONFIG_CONTEXT.test(text);

  if (!hasWrite || (!hasConfig && !hasIds)) return null;
  if (!hasConfig && !hasIds) return null;

  // Reading status is not a write request.
  if (/(покажи|проверь|какой|какие|статус|status|show|check|read)/i.test(text) && !/(вставь|настрой|обнови|измени|примени|подключи)/i.test(text)) {
    return null;
  }

  const account = message.match(/(?:account\s*id|аккаунт[а-яё]*\s*(?:id|ид)?)\D{0,12}(\d{6,16})/i);
  const property = message.match(/(?:property\s*id|ресурс[а-яё]*\s*(?:id|ид)?)\D{0,12}(\d{6,16})/i);
  const measurement = message.match(/\bG-[A-Z0-9]{6,}\b/i);

  return {
    requested: true,
    kind: 'analytics_configuration',
    status: 'unsupported',
    writeToolAvailable: false,
    values: {
      accountId: account?.[1] ?? null,
      propertyId: property?.[1] ?? null,
      measurementId: measurement?.[0] ?? null,
    },
  };
}

/**
 * Uses bounded prior user turns when the current message is a vague
 * "вставь сам"/"apply it" after the IDs were supplied earlier.
 */
export function detectConfigurationWriteRequestWithContext(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): ConfigurationWriteRequest | null {
  const direct = detectConfigurationWriteRequest(message);
  if (direct) return direct;

  const isVagueApply =
    /(вставь|настрой|примени|сделай|запиши|обнови)\s+сам|(apply|set|insert|configure)\s+(it|them|this|that)/i.test(
      message
    );
  if (!isVagueApply) return null;

  const context = [...history]
    .reverse()
    .filter((item) => item.role === 'user' && item.content.trim())
    .slice(0, 2)
    .map((item) => item.content)
    .join('\n');

  if (!GA_MEASUREMENT.test(context) && !/(account\s*id|property\s*id|measurement\s*id)/i.test(context)) {
    return null;
  }

  return detectConfigurationWriteRequest(`${context}\n${message}`);
}

export function configurationWriteRefusal(
  request: ConfigurationWriteRequest,
  language: 'ru' | 'en'
): string {
  const values = [
    request.values.accountId ? `Account ID: ${request.values.accountId}` : null,
    request.values.propertyId ? `Property ID: ${request.values.propertyId}` : null,
    request.values.measurementId ? `Measurement ID: ${request.values.measurementId}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  if (language === 'en') {
    return [
      'I have not changed the configuration.',
      `The values were received${values ? ` (${values})` : ''}, but receiving parameters is not the same as applying them.`,
      'Pierrot has no verified write tool for GA4 account/property/measurement configuration. The available analytics integration is read-only discovery/OAuth; it cannot insert these IDs into the site configuration.',
      'Nothing was written. If you want, I can show the current read-only connection status or the exact manual steps that remain.',
    ].join('\n');
  }

  return [
    'Я не изменял конфигурацию.',
    `Значения получены${values ? ` (${values})` : ''}, но получить параметры — не значит применить их.`,
    'В Pierrot нет проверенного write-инструмента для конфигурации GA4 (Account / Property / Measurement ID). Доступная интеграция аналитики работает в режиме read-only discovery/OAuth и не может вставить эти ID в конфигурацию сайта.',
    'Ничего не записано. Могу показать текущий read-only статус подключения или точные ручные шаги, которые остались.',
  ].join('\n');
}

const ACTION_SUCCESS_CLAIM =
  /(обновил|обновила|изменил|изменила|настроил|настроила|подключил|подключила|сохранил|сохранила|записал|записала|закоммитил|запушил|применил|применила|включил|включила|установил|установила)\s+(конфиг|настройк|параметр|account|property|measurement|ga4|analytics|баз|таблиц|файл|репозитор|github|art\s*engine|интеграц)/i;

const ACTION_SUCCESS_CLAIM_EN =
  /(updated|changed|configured|connected|saved|committed|pushed|applied|enabled|set\s+up)\s+(the\s+)?(config|configuration|settings|account|property|measurement|ga4|analytics|database|table|file|repo|github|art\s*engine|integration)/i;

const PASSIVE_WRITE_CLAIM =
  /(конфигурац|настройк|параметр|account|property|measurement|ga4|analytics|баз[аы]|таблиц|файл|репозитор|github|интеграц)[^.\n]{0,60}(обновлен|обновлён|изменен|изменён|настроен|подключен|подключён|сохранен|сохранён|применен|применён|записан|закоммичен|запушен|updated|changed|configured|connected|saved|applied|committed|pushed)/i;

const DONE_WRITE_CLAIM =
  /(готово|сделано|done)[.,!]?\s*(я\s+)?(обновил|обновила|настроил|настроила|изменил|изменила|подключил|подключила|сохранил|сохранила|закоммитил|запушил|применил|applied|updated|configured|committed|pushed)/i;

export function guardUnverifiedActionClaims(input: {
  reply: string;
  verifiedWrite: boolean;
  request: string;
  language: 'ru' | 'en';
}): { reply: string; blocked: boolean; reason: string | null } {
  const reply = (input.reply || '').trim();
  if (!reply || input.verifiedWrite) {
    return { reply, blocked: false, reason: null };
  }

  const configRequest = detectConfigurationWriteRequest(input.request);
  const claimsWrite =
    ACTION_SUCCESS_CLAIM.test(reply) ||
    ACTION_SUCCESS_CLAIM_EN.test(reply) ||
    PASSIVE_WRITE_CLAIM.test(reply) ||
    DONE_WRITE_CLAIM.test(reply);

  if (!configRequest && !claimsWrite) {
    return { reply, blocked: false, reason: null };
  }

  const safe =
    input.language === 'en'
      ? [
          'I did not perform or verify that change, so I will not confirm it.',
          'No successful write operation was executed in this turn. Receiving parameters or describing a configuration is not evidence that it was applied.',
          'If the integration is read-only, the change remains outstanding.',
        ].join(' ')
      : [
          'Я не выполнял и не подтверждал это изменение.',
          'В этом запросе не было успешной write-операции. Получение параметров или описание конфигурации не доказывает, что изменение применено.',
          'Если интеграция работает в режиме read-only, изменение остаётся невыполненным.',
        ].join(' ');

  return {
    reply: safe,
    blocked: true,
    reason: configRequest ? 'configuration_write_without_tool' : 'unverified_action_claim',
  };
}

export type RecoveredClientAction =
  | {
      kind: 'art_engine_enter';
      text: string;
      clientAction: { type: 'enter_art_engine' };
    }
  | null;

/**
 * Recovers an explicit Art Engine action after a correction/repeat request.
 * The actual mode switch is client-side; the server never claims it performed
 * the UI change. The client may consume `clientAction` to execute it.
 */
export function recoverArtEngineAction(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  language: 'ru' | 'en'
): RecoveredClientAction {
  if (!isContextRecoveryRequest(message)) return null;

  const lastUser = [...history]
    .reverse()
    .find((item) => item.role === 'user' && item.content.trim());

  if (!lastUser || detectArtEngineModeCommand(lastUser.content) !== 'enter') return null;

  return {
    kind: 'art_engine_enter',
    text:
      language === 'en'
        ? 'Your previous request was to turn on Art Engine. It is a client-side interface mode, not a server write. If it is not active, use the Art Engine control in the chat header; I will not describe Art Engine instead of executing the request.'
        : 'Ваш предыдущий запрос — включить Art Engine. Это клиентский режим интерфейса, а не серверная запись. Если он не активен, включите Art Engine в шапке чата; я не буду описывать Art Engine вместо выполнения просьбы.',
    clientAction: { type: 'enter_art_engine' },
  };
}
