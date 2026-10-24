/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  extractLinks,
  mergeMessages,
  normalizeHistoryPage,
  peerToMarkedId,
  sortMessages,
} from '../normalize';
import { rawMessage } from '../testing';

const context = {
  chatId: 42,
  chatType: 'private',
  selfId: 1,
  page: 1,
};

const users = [
  { _: 'user', id: 42, firstName: 'Анна', lastName: 'Тестова', username: 'test_contact' },
  { _: 'user', id: 1, firstName: 'Я', username: 'me' },
];

describe('normalizeHistoryPage', () => {
  it('сохраняет подпись, медиа-метаданные, reply, forward и edit', () => {
    const page = normalizeHistoryPage(
      {
        users,
        chats: [{ _: 'channel', id: 777, title: 'Редакция', username: 'redakcia' }],
        messages: [
          rawMessage(10, 1_700_000_000, 'Подпись к фото https://example.com/a.', {
            media: {
              _: 'messageMediaPhoto',
              photo: { _: 'photo', id: '123456' },
            },
            entities: [
              { _: 'messageEntityTextUrl', offset: 0, length: 7, url: 'https://hidden.example/x' },
            ],
            replyTo: { _: 'messageReplyHeader', replyToMsgId: 9, replyToTopId: 9 },
            fwdFrom: {
              _: 'messageFwdHeader',
              fromId: { _: 'peerChannel', channelId: 777 },
              date: 1_600_000_000,
              channelPost: 55,
            },
            editDate: 1_700_000_100,
            out: true,
            fromId: { _: 'peerUser', userId: 1 },
          }),
        ],
      },
      context
    );

    expect(page.messages).toHaveLength(1);
    const message = page.messages[0];
    expect(message.text).toBe('Подпись к фото https://example.com/a.');
    expect(message.isCaption).toBe(true);
    expect(message.media?.kind).toBe('messageMediaPhoto');
    expect(message.media?.photoId).toBe('123456');
    expect(message.reply).toEqual({ toMessageId: 9, threadId: 9, quote: null });
    expect(message.forward?.fromId).toBe(-1_000_000_000_777);
    expect(message.forward?.fromName).toBe('Редакция');
    expect(message.forward?.fromUsername).toBe('redakcia');
    expect(message.forward?.channelPostId).toBe(55);
    expect(message.isEdited).toBe(true);
    expect(message.editDate).toBe('2023-11-14T22:15:00.000Z');
    expect(message.sender.id).toBe(1);
    expect(message.isOutgoing).toBe(true);
    expect(message.links).toContain('https://example.com/a');
    expect(message.links).toContain('https://hidden.example/x');
    expect(message.links).toHaveLength(2);
  });

  it('различает пустой текст, отсутствие текста и media-only', () => {
    const page = normalizeHistoryPage(
      {
        users,
        messages: [
          rawMessage(1, 1_700_000_000, ''),
          rawMessage(2, 1_700_000_001, null, {
            media: {
              _: 'messageMediaDocument',
              document: {
                _: 'document',
                id: '9',
                mimeType: 'video/mp4',
                size: '1000',
                attributes: [],
              },
            },
          }),
          {
            _: 'messageService',
            id: 3,
            date: 1_700_000_002,
            peerId: { _: 'peerUser', userId: 42 },
            action: { _: 'messageActionPinMessage' },
          },
          { _: 'messageEmpty', id: 4 },
        ],
      },
      context
    );

    expect(page.messages).toHaveLength(3);
    expect(page.messages[0].text).toBe('');
    expect(page.messages[0].textLength).toBe(0);
    expect(page.messages[1].text).toBeNull();
    expect(page.messages[1].hasMedia).toBe(true);
    expect(page.messages[1].media?.mimeType).toBe('video/mp4');
    expect(page.messages[2].isService).toBe(true);
    expect(page.emptyRecords).toBe(1);
    expect(page.minMessageId).toBe(1);
    expect(page.maxMessageId).toBe(4);
  });

  it('не падает на сообщениях без ID и неизвестных типах', () => {
    const page = normalizeHistoryPage(
      {
        users,
        messages: [
          { _: 'message', date: 1_700_000_000, message: 'no id' },
          { _: 'message', id: 5, date: 1_700_000_001, message: 'ok' },
          { _: 'messageStory', id: 6, date: 1_700_000_002, message: 'story' },
        ],
      },
      context
    );

    expect(page.messages.map((message) => message.id)).toEqual([5, 6]);
    expect(page.skippedRecords).toBe(1);
    expect(page.unsupportedKinds.messageStory).toBe(1);
  });
});

describe('dedupe and order', () => {
  it('дедуплицирует по chatId:messageId и оставляет последнюю версию', () => {
    const first = normalizeHistoryPage(
      {
        users,
        messages: [rawMessage(1, 1_700_000_000, 'old'), rawMessage(2, 1_700_000_001, 'two')],
      },
      context
    );
    const second = normalizeHistoryPage(
      { users, messages: [rawMessage(1, 1_700_000_000, 'edited')] },
      context
    );
    const messages = new Map<string, (typeof first.messages)[number]>();
    expect(mergeMessages(messages, first.messages)).toBe(0);
    expect(mergeMessages(messages, second.messages)).toBe(1);
    const sorted = sortMessages(messages.values());
    expect(sorted).toHaveLength(2);
    expect(sorted[0].text).toBe('edited');
    expect(sorted.map((message) => message.id)).toEqual([1, 2]);
  });

  it('сортирует по времени, затем по ID', () => {
    const messages = [
      normalizeHistoryPage({ users, messages: [rawMessage(3, 1_700_000_000, 'b')] }, context)
        .messages[0],
      normalizeHistoryPage({ users, messages: [rawMessage(2, 1_700_000_000, 'a')] }, context)
        .messages[0],
      normalizeHistoryPage({ users, messages: [rawMessage(1, 1_699_999_999, 'c')] }, context)
        .messages[0],
    ];
    expect(sortMessages(messages).map((message) => message.id)).toEqual([1, 2, 3]);
  });
});

describe('links and peer ids', () => {
  it('извлекает ссылки из текста и entities без дублей', () => {
    const links = extractLinks('Смотри https://a.test/x, и https://b.test/y.', [
      { _: 'messageEntityTextUrl', offset: 0, length: 1, url: 'https://a.test/x' },
      { _: 'messageEntityUrl', offset: 7, length: 16 },
    ]);
    expect(links).toEqual(['https://a.test/x', 'https://b.test/y']);
  });

  it('преобразует peer в marked id', () => {
    expect(peerToMarkedId({ _: 'peerUser', userId: 42 })).toBe(42);
    expect(peerToMarkedId({ _: 'peerChat', chatId: 7 })).toBe(-7);
    expect(peerToMarkedId({ _: 'peerChannel', channelId: 7 })).toBe(-1_000_000_000_007);
    expect(peerToMarkedId(null)).toBeNull();
  });
});
