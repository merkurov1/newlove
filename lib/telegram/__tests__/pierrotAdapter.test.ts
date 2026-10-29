import {
  buildTelegramButtons,
  createPromptCallbackData,
  createTelegramPierrotIds,
  telegramSiteUrl,
} from '../pierrotAdapter';

describe('Telegram Pierrot adapter', () => {
  it('derives stable, valid and distinct ids', () => {
    const first = createTelegramPierrotIds(123456, 10);
    const retry = createTelegramPierrotIds(123456, 10);
    const otherMessage = createTelegramPierrotIds(123456, 11);

    expect(first).toEqual(retry);
    expect(first.userMessageId).not.toBe(otherMessage.userMessageId);
    for (const id of Object.values(first)) {
      expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    }
  });

  it('builds absolute URLs for internal routes and keeps external URLs', () => {
    expect(telegramSiteUrl('https://www.merkurov.love/', '/lobby')).toBe(
      'https://www.merkurov.love/lobby'
    );
    expect(telegramSiteUrl('https://www.merkurov.love', 'https://wa.me/1')).toBe('https://wa.me/1');
  });

  it('maps navigate, prompt, links and CTA to Telegram buttons', () => {
    const prompt = 'Tell me more about the Lobby.';
    const buttons = buildTelegramButtons(
      {
        actions: [
          { kind: 'navigate', label: 'Enter the Lobby', sectionId: 'lobby' },
          { kind: 'prompt', label: 'Tell me more', prompt },
        ],
        links: [{ label: 'Journal', href: '/journal' }],
        cta: {
          offerId: 'advising',
          label: 'Contact',
          href: 'https://wa.me/16467270865',
          kind: 'external',
          purpose: 'contact',
        },
      },
      'https://www.merkurov.love'
    );

    expect(buttons).toEqual([
      { text: 'Enter the Lobby', url: 'https://www.merkurov.love/lobby' },
      { text: 'Tell me more', callbackData: createPromptCallbackData(prompt) },
      { text: 'Journal', url: 'https://www.merkurov.love/journal' },
      { text: 'Contact', url: 'https://wa.me/16467270865' },
    ]);
    expect(createPromptCallbackData(prompt)).toMatch(/^p:[A-Za-z0-9_-]+$/);
  });

  it('skips prompt payloads above the Telegram callback limit', () => {
    expect(createPromptCallbackData('x'.repeat(100))).toBeNull();
  });
});
