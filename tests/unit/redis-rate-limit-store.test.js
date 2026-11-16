import assert from 'node:assert/strict';
import test from 'node:test';

import { createRedisRateLimitStore } from '../../src/shared/http/redis-rate-limit-store.js';

test('incrementa en Redis con prefijo por limitador', async () => {
  const calls = [];
  const store = createRedisRateLimitStore({
    prefix: 'zl:rl:login',
    client: {
      async eval(_script, { keys, arguments: args }) {
        calls.push({ keys, args });

        return [3, 120000];
      },
      async decr() {},
      async del() {},
    },
  });

  store.init({ windowMs: 60000 });

  const result = await store.increment('1.2.3.4');

  assert.equal(result.totalHits, 3);
  assert.ok(result.resetTime instanceof Date);
  assert.deepEqual(calls[0].keys, ['zl:rl:login:1.2.3.4']);
  assert.deepEqual(calls[0].args, ['60000']);
});

test('usa memoria local si Redis falla', async () => {
  const store = createRedisRateLimitStore({
    prefix: 'zl:rl:contact',
    client: {
      async eval() {
        throw new Error('redis down');
      },
      async decr() {},
      async del() {},
    },
  });

  store.init({ windowMs: 60000 });

  const first = await store.increment('1.2.3.4');
  const firstHits = first.totalHits;
  const second = await store.increment('1.2.3.4');

  assert.equal(firstHits, 1);
  assert.equal(second.totalHits, 2);
  assert.equal(store.localKeys, false);
});

test('decrementa y resetea claves en Redis', async () => {
  const operations = [];
  const store = createRedisRateLimitStore({
    prefix: 'zl:rl:reviews',
    client: {
      async eval() {
        return [1, 60000];
      },
      async decr(key) {
        operations.push(['decr', key]);
      },
      async del(key) {
        operations.push(['del', key]);
      },
    },
  });

  await store.decrement('1.2.3.4');
  await store.resetKey('1.2.3.4');

  assert.deepEqual(operations, [
    ['decr', 'zl:rl:reviews:1.2.3.4'],
    ['del', 'zl:rl:reviews:1.2.3.4'],
  ]);
});
