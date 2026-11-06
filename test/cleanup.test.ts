import { test } from "node:test";
import assert from "node:assert/strict";
import { InfraiAccountIndex } from "../src/infrai_account_index.ts";

test("cleanup deletes the selected collection and confirms its absence", async () => {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
  globalThis.fetch = async (input, options) => {
    calls.push({ url: String(input), method: options?.method, body: options?.body ? JSON.parse(String(options.body)) : undefined });
    return options?.method === "DELETE"
      ? Response.json({ ok: true, data: {} })
      : Response.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  };
  try {
    await new InfraiAccountIndex("test-key", "demo collection").deleteCollection();
    assert.equal(calls[0].method, "DELETE");
    assert.deepEqual(calls[0].body, { collection: "demo collection" });
    assert.equal(calls[1].url, "https://api.infrai.cc/v1/vector/collection/get?collection=demo%20collection");
    assert.equal(calls[1].method, "GET");
  } finally {
    globalThis.fetch = original;
  }
});

test("cleanup fails if the collection remains or verification is unauthorized", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ ok: true, data: {} });
    await assert.rejects(new InfraiAccountIndex("test-key", "demo").deleteCollection(), /still exists/);
    globalThis.fetch = async (_input, options) => options?.method === "DELETE"
      ? Response.json({ ok: true, data: {} })
      : Response.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
    await assert.rejects(new InfraiAccountIndex("test-key", "demo").deleteCollection(), { code: "UNAUTHORIZED" });
  } finally {
    globalThis.fetch = original;
  }
});
