import net from "node:net";
import fs from "node:fs";

let redisConfigOverride: { host: string; port: number } | null = null;

export function setRedisConfigOverride(override: { host: string; port: number } | null): void {
  redisConfigOverride = override;
}

function getRedisConfig(): { host: string; port: number } {
  if (redisConfigOverride) return redisConfigOverride;
  const raw = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  const inDocker = Boolean(process.env["IN_DOCKER"]) || fs.existsSync("/.dockerenv");
  let host = "localhost";
  let port = 6379;
  try {
    const url = new URL(raw);
    host = url.hostname || "localhost";
    if (!inDocker && host === "redis") {
      host = "localhost";
    }
    port = url.port ? Number(url.port) : 6379;
  } catch {
    // defaults
  }
  return { host, port };
}

/**
 * Execute atomic rate limit increment in Redis using RESP protocol over net.Socket.
 * If Redis is unavailable, logs a warning and fails open.
 */
export async function redisRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ current: number; ttl: number; allowed: boolean }> {
  try {
    const { host, port } = getRedisConfig();
    return await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port, timeout: 1500 });
      let buffer = "";

      socket.on("connect", () => {
        // Atomic Lua script: INCR and EXPIRE if 1, return current count and remaining TTL
        const script =
          "local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return {c, redis.call('TTL', KEYS[1])}";
        const scriptLen = Buffer.byteLength(script);
        const keyLen = Buffer.byteLength(key);
        const winStr = String(windowSeconds);
        const winLen = Buffer.byteLength(winStr);

        const resp =
          `*5\r\n$4\r\nEVAL\r\n$${scriptLen}\r\n${script}\r\n$1\r\n1\r\n` +
          `$${keyLen}\r\n${key}\r\n$${winLen}\r\n${winStr}\r\n`;

        socket.write(resp);
      });

      socket.on("data", (data) => {
        buffer += data.toString();
        // Parse array response: *2\r\n:count\r\n:ttl\r\n
        const match = /\*2\r\n:(-?\d+)\r\n:(-?\d+)\r\n/.exec(buffer);
        if (match) {
          socket.destroy();
          const current = Number(match[1]);
          const ttl = Math.max(1, Number(match[2]));
          resolve({
            current,
            ttl,
            allowed: current <= limit,
          });
        }
      });

      socket.on("error", (err) => {
        socket.destroy();
        reject(err);
      });

      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("Redis timeout"));
      });
    });
  } catch (err) {
    // If Redis is down, log a warning and let the request through (fail-open)
    console.warn(
      `[RateLimiter] Redis is down (${(err as Error)?.message ?? String(err)}), allowing request for '${key}'`
    );
    return { current: 0, ttl: 0, allowed: true };
  }
}

/**
 * Reset all rate limit keys (for tests).
 */
export async function resetRedisRateLimits(): Promise<void> {
  try {
    const { host, port } = getRedisConfig();
    await new Promise<void>((resolve) => {
      const socket = net.createConnection({ host, port, timeout: 1500 });
      socket.on("connect", () => {
        socket.write("*1\r\n$7\r\nFLUSHDB\r\n");
      });
      socket.on("data", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        resolve();
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve();
      });
    });
  } catch {
    // ignore
  }
}
