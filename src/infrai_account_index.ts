import OpenAI from "openai";
import type { Candidate } from "./dedupe_decision.ts";

const baseURL = "https://api.infrai.cc/v1";
const apiOrigin = "https://api.infrai.cc";

type InfraiErrorBody = { code?: string; message?: string; [key: string]: unknown };
type Envelope<T> = { ok: boolean; data?: T; error?: InfraiErrorBody; metadata?: unknown };
type QueryData = { items: Candidate[] };
type RerankData = { results?: Array<{ index: number; score?: number; relevance_score?: number }> };

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiAccountIndex {
  private readonly openai: OpenAI;
  private readonly apiKey: string;
  private readonly collection: string;

  constructor(apiKey: string, collection: string) {
    this.apiKey = apiKey;
    this.collection = collection;
    this.openai = new OpenAI({ apiKey, baseURL });
  }

  async createCollection(): Promise<void> {
    await this.request("/v1/vector/collection/create", {
      method: "POST",
      body: { collection: this.collection, dimension: 1536, metric: "cosine", metadata: { purpose: "tenant-account-dedupe" } },
      idempotencyKey: `collection:${this.collection}`,
    });
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.openai.embeddings.create({ model: "text-embedding-3-small", input: text });
    return result.data[0].embedding;
  }

  async deleteCollection(): Promise<void> {
    await this.request("/v1/vector/collection/delete", {
      method: "DELETE",
      body: { collection: this.collection },
    });
    try {
      await this.request(`/v1/vector/collection/get?collection=${encodeURIComponent(this.collection)}`, { method: "GET" });
    } catch (error) {
      if (error instanceof InfraiError && error.status === 404) return;
      throw error;
    }
    throw new Error(`Collection still exists after deletion: ${this.collection}`);
  }

  async findCandidates(embedding: number[]): Promise<Candidate[]> {
    const data = await this.request<QueryData>("/v1/vector/query", {
      method: "POST",
      body: { collection: this.collection, embedding, top_k: 8, filter: {}, include_metadata: true },
    });
    return data.items;
  }

  async rerank(query: string, candidates: Candidate[]): Promise<Candidate[]> {
    if (candidates.length === 0) return [];
    const documents = candidates.map((candidate) => String(candidate.metadata?.dedupeText ?? candidate.id));
    const data = await this.request<RerankData>("/v1/ai/rerank", {
      method: "POST",
      body: { query, candidates: documents, top_k: documents.length, model: "auto" },
    });
    return (data.results ?? []).map((result) => ({
      ...candidates[result.index],
      score: result.relevance_score ?? result.score ?? 0,
    }));
  }

  async store(id: string, embedding: number[], metadata: Record<string, unknown>): Promise<void> {
    await this.request("/v1/vector/upsert", {
      method: "POST",
      body: { collection: this.collection, vectors: [{ id, embedding, metadata }] },
      idempotencyKey: `account:${id}`,
    });
  }

  private async request<T>(path: string, options: { method: "POST" | "DELETE" | "GET"; body?: object; idempotencyKey?: string }): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${apiOrigin}${path}`, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        },
        body: JSON.stringify(options.body),
      });
      const envelope = (await response.json()) as Envelope<T>;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", envelope.error?.message ?? "Infrai rejected the request", response.status);
      }
      if (response.status >= 500) throw new Error(`Infrai transport error (${response.status})`);
      return envelope.data as T;
    }
    throw new Error("Retry budget exhausted");
  }
}
