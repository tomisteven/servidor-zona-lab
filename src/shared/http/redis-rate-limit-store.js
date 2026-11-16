import { MemoryStore } from 'express-rate-limit';

const INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

function buildKey(prefix, key) {
  return `${prefix}:${key}`;
}

export function createRedisRateLimitStore({ client, prefix }) {
  const memory = new MemoryStore();
  let windowMs = 60_000;

  return {
    localKeys: false,
    init(options) {
      windowMs = options.windowMs;
      memory.init(options);
    },
    async increment(key) {
      try {
        const result = await client.eval(INCREMENT_SCRIPT, {
          keys: [buildKey(prefix, key)],
          arguments: [String(windowMs)],
        });
        const totalHits = Number(result?.[0] ?? 1);
        const ttl = Number(result?.[1] ?? 0);
        const resetTime = new Date(Date.now() + (ttl > 0 ? ttl : windowMs));

        return { totalHits, resetTime };
      } catch {
        return memory.increment(key);
      }
    },
    async decrement(key) {
      try {
        await client.decr(buildKey(prefix, key));
      } catch {
        await memory.decrement(key);
      }
    },
    async resetKey(key) {
      try {
        await client.del(buildKey(prefix, key));
      } catch {
        await memory.resetKey(key);
      }
    },
    async shutdown() {
      await memory.shutdown?.();
    },
  };
}
