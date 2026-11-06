export {};

const response = await fetch("http://localhost:3000/onboarding/accounts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    tenantId: "shop-eu-42",
    companyName: "Northwind Outfitters Limited",
    website: "https://northwind-outfitters.example",
    billingEmail: "checkout@northwind-outfitters.example",
    billingAddress: "18 Market Street, Bristol BS1 1AA",
    lifecycle: "trial",
  }),
});

console.log(response.status, await response.json());
