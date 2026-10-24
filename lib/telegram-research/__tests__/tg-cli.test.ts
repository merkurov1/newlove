import { TgClient } from '../tg-cli';

type TgClientInternals = {
  runJson: (args: string[]) => Promise<unknown>;
};

function makeClient() {
  const client = new TgClient({ bin: 'tg' });
  const calls: string[][] = [];

  const internals = client as unknown as TgClientInternals;

  internals.runJson = async (args: string[]) => {
    calls.push(args);

    if (args[0] === 'messages') {
      return {
        success: true,
        data: {
          chatId: 42,
          count: 2,
          items: [
            {
              chatId: 42,
              messageId: 2,
              fromId: 42,
              text: 'raw page message',
              messageType: 'text',
              hasMedia: false,
              replyToId: null,
              forwardFromId: null,
              editDate: null,
              date: 1_700_000_000,
              isOutgoing: false,
              isDeleted: false,
              sender: {
                id: 42,
                username: 'peer',
                firstName: 'Peer',
                lastName: 'Name',
              },
              chat: {
                id: 42,
                title: 'Peer Name',
                username: 'peer',
                type: 'private',
              },
            },
            {
              chatId: 42,
              messageId: 3,
              fromId: 42,
              text: 'caption without raw row',
              messageType: 'photo',
              hasMedia: true,
              replyToId: 2,
              forwardFromId: 7,
              editDate: 1_700_000_100,
              date: 1_700_000_050,
              isOutgoing: false,
              isDeleted: false,
              sender: {
                id: 42,
                username: 'peer',
                firstName: 'Peer',
                lastName: 'Name',
              },
              chat: {
                id: 42,
                title: 'Peer Name',
                username: 'peer',
                type: 'private',
              },
            },
          ],
        },
      };
    }

    if (args[0] === 'sql') {
      return {
        success: true,
        data: {
          rows: [
            {
              message_id: 2,
              raw_json: JSON.stringify({
                _: 'message',
                id: 2,
                date: 1_700_000_000,
                message: 'raw page message',
                fromId: { _: 'peerUser', userId: 42 },
              }),
            },
          ],
        },
      };
    }

    throw new Error(`Unexpected tg args: ${args.join(' ')}`);
  };

  return { client, calls };
}

describe('TgClient.historyPage', () => {
  it('reads messages list pages and original raw_json from the cache', async () => {
    const { client, calls } = makeClient();
    const page = await client.historyPage('@peer', 0, 2);

    expect(page.messages).toHaveLength(2);
    expect(page.messages[0]).toMatchObject({
      _: 'message',
      id: 2,
      message: 'raw page message',
    });
    expect(page.messages[1]).toMatchObject({
      _: 'message',
      id: 3,
      message: 'caption without raw row',
      replyTo: { replyToMsgId: 2 },
      fwdFrom: { fromId: { _: 'peerUser', userId: 7 } },
      editDate: 1_700_000_100,
    });
    expect(page.users).toEqual([
      {
        _: 'user',
        id: 42,
        username: 'peer',
        firstName: 'Peer',
        lastName: 'Name',
      },
    ]);
    expect(page.chats).toEqual([]);

    expect(calls[0]).toEqual(
      expect.arrayContaining([
        'messages',
        'list',
        '--chat=@peer',
        '--limit=2',
        '--fresh',
        '--format=json',
      ])
    );
    expect(calls[0]).not.toEqual(expect.arrayContaining(['--before=0']));
    expect(calls[1]?.[2]).toContain('message_id IN (2, 3)');
  });

  it('uses --before for older pages and preserves the requested offset', async () => {
    const { client, calls } = makeClient();
    await client.historyPage('@peer', 50, 100);

    expect(calls[0]).toEqual(expect.arrayContaining(['--before=50']));
  });
});
