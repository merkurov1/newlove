/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  PERSONAL_ASSISTANT_GREETING,
  PERSONAL_ASSISTANT_TELEGRAM_USER_ID,
  inspectPersonalAssistantUpdate,
  isPersonalAssistantContext,
  isPersonalAssistantSenderId,
} from '../identity';

function privateMessage(fromId: number | string, chatType = 'private') {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      from: { id: fromId },
      chat: { id: fromId, type: chatType },
      text: 'hello',
    },
  };
}

describe('personal assistant identity', () => {
  it('exposes the exact agreed greeting', () => {
    expect(PERSONAL_ASSISTANT_GREETING).toBe('Здравствуйте, Светлана Георгиевна! Чем могу помочь?');
  });

  it('resolves the allowlisted sender in a private chat', () => {
    expect(
      isPersonalAssistantContext({
        fromId: PERSONAL_ASSISTANT_TELEGRAM_USER_ID,
        chatType: 'private',
      })
    ).toBe(true);
    expect(
      inspectPersonalAssistantUpdate(privateMessage(PERSONAL_ASSISTANT_TELEGRAM_USER_ID))
    ).toEqual({ kind: 'profile', senderId: PERSONAL_ASSISTANT_TELEGRAM_USER_ID });
  });

  it('does not resolve any other sender', () => {
    expect(isPersonalAssistantSenderId(12345)).toBe(false);
    expect(isPersonalAssistantContext({ fromId: 12345, chatType: 'private' })).toBe(false);
    expect(inspectPersonalAssistantUpdate(privateMessage(12345))).toEqual({ kind: 'unrelated' });
  });

  it('rejects a private chat whose id does not match the sender', () => {
    expect(
      isPersonalAssistantContext({
        fromId: PERSONAL_ASSISTANT_TELEGRAM_USER_ID,
        chatId: 999,
        chatType: 'private',
      })
    ).toBe(false);

    expect(
      inspectPersonalAssistantUpdate({
        update_id: 3,
        message: {
          message_id: 12,
          from: { id: PERSONAL_ASSISTANT_TELEGRAM_USER_ID },
          chat: { id: 999, type: 'private' },
          text: 'hello',
        },
      })
    ).toEqual({
      kind: 'forbidden',
      senderId: PERSONAL_ASSISTANT_TELEGRAM_USER_ID,
      chatType: 'private',
    });
  });

  it('rejects group, supergroup and channel contexts for the allowlisted sender', () => {
    for (const chatType of ['group', 'supergroup', 'channel']) {
      expect(
        isPersonalAssistantContext({
          fromId: PERSONAL_ASSISTANT_TELEGRAM_USER_ID,
          chatType,
        })
      ).toBe(false);

      expect(
        inspectPersonalAssistantUpdate(
          privateMessage(PERSONAL_ASSISTANT_TELEGRAM_USER_ID, chatType)
        )
      ).toEqual({ kind: 'forbidden', senderId: PERSONAL_ASSISTANT_TELEGRAM_USER_ID, chatType });
    }
  });

  it('resolves callback queries from the allowlisted private chat', () => {
    const update = {
      update_id: 2,
      callback_query: {
        id: 'cb',
        from: { id: PERSONAL_ASSISTANT_TELEGRAM_USER_ID },
        data: 'p:hello',
        message: {
          message_id: 11,
          chat: { id: PERSONAL_ASSISTANT_TELEGRAM_USER_ID, type: 'private' },
        },
      },
    };

    expect(inspectPersonalAssistantUpdate(update)).toEqual({
      kind: 'profile',
      senderId: PERSONAL_ASSISTANT_TELEGRAM_USER_ID,
    });
  });

  it('ignores forged body-style claims that are not part of a Telegram update', () => {
    expect(
      inspectPersonalAssistantUpdate({
        is_owner: true,
        user_id: PERSONAL_ASSISTANT_TELEGRAM_USER_ID,
        profile_id: '00000000-0000-4000-8000-000000000000',
        identity_type: 'owner',
      })
    ).toEqual({ kind: 'unrelated' });
  });
});
