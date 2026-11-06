import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { z } from "zod";
import { decideOnboarding } from "./dedupe_decision.ts";
import { InfraiAccountIndex, InfraiError } from "./infrai_account_index.ts";

const onboardingBody = z.object({
  tenantId: z.string().min(1),
  companyName: z.string().min(2),
  website: z.string().url(),
  billingEmail: z.string().email(),
  billingAddress: z.string().min(5),
  lifecycle: z.enum(["trial", "active", "closed"]),
});

function dedupeText(account: z.infer<typeof onboardingBody>): string {
  return [account.companyName, new URL(account.website).hostname.replace(/^www\./, ""), account.billingEmail.split("@")[1], account.billingAddress].join(" | ").toLowerCase();
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const index = new InfraiAccountIndex(apiKey, process.env.INFRAI_COLLECTION ?? "saas-account-identities");
await index.createCollection();

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/onboarding/accounts") {
    response.writeHead(404).end(JSON.stringify({ error: "route_not_found" }));
    return;
  }
  try {
    const account = onboardingBody.parse(await readJson(request));
    const text = dedupeText(account);
    const embedding = await index.embed(text);
    const candidates = await index.findCandidates(embedding);
    const decision = decideOnboarding(await index.rerank(text, candidates));
    if (decision.status === "accepted") {
      const accountId = createHash("sha256").update(`${account.tenantId}:${text}`).digest("hex").slice(0, 24);
      await index.store(accountId, embedding, { ...account, dedupeText: text });
      response.writeHead(201).end(JSON.stringify({ accountId, ...decision }));
      return;
    }
    response.writeHead(202).end(JSON.stringify(decision));
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.writeHead(400).end(JSON.stringify({ error: "invalid_request", details: error.flatten() }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.code, message: error.message }));
      return;
    }
    response.writeHead(500).end(JSON.stringify({ error: "onboarding_failed" }));
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => console.log("Account onboarding listening on http://localhost:3000"));
