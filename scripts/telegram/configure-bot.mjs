#!/usr/bin/env node
/**
 * Configure the Pierrot Telegram bot through the Bot API.
 *
 * Run locally with server-side env variables. The script never prints or
 * accepts the bot token as a command-line argument, and it never changes a
 * webhook. Webhook re-registration is a separate, explicit owner action.
 */

const TOKEN = process.env.PIERROT_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://www.merkurov.love'
).replace(/\/+$/, '');
const MINI_APP_URL = process.env.TELEGRAM_MINI_APP_URL || `${APP_URL}/lobby`;

const SHORT_DESCRIPTION =
  "Meet Pierrot, Anton Merkurov's digital assistant. Explore art, ideas, projects and Flow on merkurov.love.";

if (!TOKEN) {
  console.error('PIERROT_BOT_TOKEN (or TELEGRAM_BOT_TOKEN) is not set.');
  process.exit(1);
}

function ownerId() {
  const direct = process.env.PIERROT_OWNER_TELEGRAM_ID || process.env.MY_TELEGRAM_ID;

  if (direct && /^\d+$/.test(direct.trim())) return direct.trim();

  return (
    (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .find((value) => /^\d+$/.test(value)) || null
  );
}

const PUBLIC_COMMANDS = [
  { command: 'start', description: 'Open Pierrot' },
  { command: 'help', description: 'Show help and doors' },
  { command: 'privacy', description: 'Manage transcript saving' },
  { command: 'delete', description: 'Delete the saved transcript' },
  { command: 'flow', description: 'Publish directly to Flow' },
  { command: 'cancel', description: 'Leave the current Flow mode' },
];

const OWNER_COMMANDS = [
  ...PUBLIC_COMMANDS,
  { command: 'status', description: 'Current human conversation' },
  { command: 'end', description: 'End the human conversation' },
  { command: 'human', description: 'Human presence commands' },
  { command: 'settings', description: 'Notification settings' },
];

async function api(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || data?.ok !== true) {
    throw new Error(
      `${method} failed: ${
        typeof data?.description === 'string' ? data.description : `HTTP ${response.status}`
      }`
    );
  }

  return data.result;
}

async function main() {
  const owner = ownerId();

  await api('setMyDescription', {
    description: SHORT_DESCRIPTION,
    language_code: 'en',
  });
  await api('setMyShortDescription', {
    short_description: 'Pierrot — art, ideas and the world of Anton Merkurov.',
    language_code: 'en',
  });
  await api('setMyShortDescription', {
    short_description: 'Пьеро — искусство, идеи и мир Антона Меркурова.',
  });

  await api('setMyCommands', {
    commands: PUBLIC_COMMANDS,
    scope: { type: 'default' },
    language_code: 'en',
  });
  await api('setMyCommands', {
    commands: PUBLIC_COMMANDS,
    language_code: 'en',
  });

  if (owner) {
    await api('setMyCommands', {
      commands: OWNER_COMMANDS,
      scope: { type: 'chat', chat_id: Number(owner) },
      language_code: 'en',
    });
  }

  await api('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: 'Open Pierrot',
      web_app: { url: MINI_APP_URL },
    },
  });

  console.log('Telegram bot profile and commands configured.');
  console.log(`Main Mini App / Menu Button: ${MINI_APP_URL}`);
  console.log(
    owner
      ? `Owner commands registered for chat ${owner}.`
      : 'Owner chat id not found; owner-only commands were not registered.'
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Telegram setup failed.');
  process.exit(1);
});
