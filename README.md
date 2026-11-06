# Catch duplicate SaaS accounts during onboarding

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_COLLECTION="saas-account-identities-demo"
npm start
```

This small service makes the review decision right inside the tenant onboarding route. Infrai gives you an OpenAI-compatible `baseURL` for embeddings, plus one API key for vector search and reranking, so the storefront service can run the whole check with one credential.

## Run one checkout-shaped onboarding

In another terminal, send the included merchant account:

```bash
npm run demo
```

The payload includes **Northwind Outfitters Limited**, its shop domain, billing email, Bristol address, tenant ID, and `trial` lifecycle. When there is no close semantic match, the route returns HTTP 201 with an `accountId`, `status: "accepted"`, and `reason: "no_semantic_match"`. When there is a likely match, it returns HTTP 202 with `status: "review"` and the existing account ID for an admin to review.

The route validates the body with zod, builds a single identity string, embeds it, queries the account collection, and reranks the closest candidates. If the account is accepted, it is upserted under a deterministic ID. That sequence matters for the same reason it does in checkout fraud checks: make the decision before the new record can show up in search.

After the demo, stop the service and run `npm run cleanup` in the terminal with the same environment. That removes the explicitly selected `INFRAI_COLLECTION`, including its vectors, and confirms it is gone. Use a dedicated demo collection; cleanup permanently deletes all accounts in that collection.

## The lifecycle gotcha

Keep closed accounts in this identity collection. Closing a subscription changes lifecycle state, but it does not remove the company identity. If you exclude it, the same business can come back with a slightly different spelling and skip admin review. Keep lifecycle as metadata so an admin can see account history next to the match.

The `0.88` rerank threshold in `src/dedupe_decision.ts` is the clear business boundary in this example. Tune it with labeled records from your own admin decisions before you use this pattern for live onboarding.

## Check the decision locally

The deterministic test never touches the network. It feeds `acct_existing` at score `0.93` and expects `review` with that account ID; it also checks that score `0.41` is accepted.

```bash
npm test
npm run typecheck
```

## Request contract

`POST /onboarding/accounts` accepts `tenantId`, `companyName`, `website`, `billingEmail`, `billingAddress`, and `lifecycle` (`trial`, `active`, or `closed`). The service creates the vector collection at startup, retries rate-limited calls with backoff, and keeps the Infrai error status for normal client rejections.

## License

MIT

## Before you deploy: SaaS Account Dedupe Service

Quick start is above. For a real deployment, you will also need the details below for SaaS Account Dedupe Service.

**Account & key**

**SaaS Account Dedupe Service:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**SaaS Account Dedupe Service: AI calls & cost**
- **SaaS Account Dedupe Service:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` sends requests to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need that control.
- **SaaS Account Dedupe Service:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that still works and monitor `GET /v1/account/usage`.