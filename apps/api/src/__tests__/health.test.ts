import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { app } from "../app.js";

describe("GET /healthz", () => {
  it("returns 200 with status ok", async () => {
    const server = createServer(app);
    await new Promise<void>((res) => {
      server.listen(0, res);
    });
    const { port } = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${String(port)}/healthz`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("ok");

    await new Promise<void>((res, rej) => {
      server.close((e) => {
        if (e) {
          rej(e);
        } else {
          res();
        }
      });
    });
  });
});
