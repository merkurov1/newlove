/**
 * Simple Telegram bot (node) to receive notifications and handle callback buttons.
 * Uses native fetch to keep dependencies minimal. Run separately (e.g. on a small VPS or local machine).
 * Environment variables required:
 * - TELEGRAM_BOT_TOKEN
 * - TELEGRAM_ADMIN_CHAT_ID
 *
 * This bot will poll updates and handle callback_data with prefixes:
 * - transcribe:<whisperId>
 * - reply:<whisperId>
 */

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN not set');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

let offset = 0;

async function poll() {
  try {
    const r = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
    const j = await r.json();
    if (!j.ok) return;
    for (const upd of j.result) {
      offset = upd.update_id + 1;
      if (upd.callback_query) {
        handleCallback(upd.callback_query);
      }
    }
  } catch (e) {
    console.error('poll error', e);
  } finally {
    setTimeout(poll, 1000);
  }
}

async function handleCallback(cb) {
  try {
    const data = cb.data || '';
    const from = cb.from;
    const [cmd, id] = data.split(':');
    if (cmd === 'transcribe') {
      // call Vercel serverless to transcribe
      await fetch(process.env.TRANSCRIBE_ENDPOINT || 'http://localhost:3000/api/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whisperId: id, url: null })
      });
      // acknowledge
      await fetch(`${API}/answerCallbackQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: cb.id, text: 'Запрос на транскрипцию отправлен.' }) });
    } else if (cmd === 'reply') {
      // we will open a prompt flow offline — just acknowledge
      await fetch(`${API}/answerCallbackQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: cb.id, text: 'Отправьте ответ через /reply команда (еще не реализовано в polling).' }) });
    }
  } catch (e) {
    console.error('handleCallback', e);
  }
}

poll();
