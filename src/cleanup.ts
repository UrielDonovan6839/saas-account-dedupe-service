import { InfraiAccountIndex } from "./infrai_account_index.ts";

const apiKey = process.env.INFRAI_API_KEY;
const collection = process.env.INFRAI_COLLECTION;
if (!apiKey || !collection) throw new Error("Set INFRAI_API_KEY and INFRAI_COLLECTION to explicitly select the collection to delete");

await new InfraiAccountIndex(apiKey, collection).deleteCollection();
console.log(`Deleted collection and verified absence: ${collection}`);
