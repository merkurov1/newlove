import serializeForClient from '@/lib/serializeForClient';

function testDate() {
    const d = new Date('2020-01-01T00:00:00Z');
    const out = serializeForClient({ a: d });
    if (out.a !== '2020-01-01T00:00:00.000Z') throw new Error('Date serialization failed');
}

function testCircular() {
    const a: any = { name: 'a' };
    a.self = a;
    const out = serializeForClient(a);
    if (out.self !== '[Circular]') throw new Error('Circular not handled');
}

function testPrototype() {
    const proto = Object.create(null);
    proto.x = 1;
    const out = serializeForClient(proto as any);
    if (out.x !== 1) throw new Error('Prototype copy failed');
}

function run() {
    testDate();
    testCircular();
    testPrototype();
    console.log('serializeForClient tests passed');
}

run();
