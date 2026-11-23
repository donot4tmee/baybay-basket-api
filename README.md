# Baybay Basket API

This package contains the server-side boundary for Baybay Basket. It keeps
authentication, authorization, and request validation independent from the
Supabase adapter so clients cannot become a security boundary.

## Development

```text
npm install
npm test
```

The current core exposes:

- bearer-token authentication through an `AccessTokenVerifier` interface;
- role and business-ownership guards;
- strict product and order input validation;
- private delivery details that are required only for delivery orders.
- a Node HTTP boundary with JSON response envelopes;
- public discovery, product management, orders, reports, and sync routes;
- one-business order validation, server-created snapshots, and order transitions.

## Route inventory

| Method | Route | Access |
|---|---|---|
| GET | `/health` | Public |
| GET | `/v1/businesses` | Public, verified businesses only |
| GET | `/v1/businesses/:uuid/products` | Public, live products only |
| PATCH | `/v1/businesses/:uuid/profile` | Business owner or administrator |
| POST | `/v1/businesses/:uuid/verify` | Platform or system administrator |
| POST | `/v1/businesses/:uuid/products` | Business owner or administrator |
| PATCH | `/v1/products/:uuid` | Product owner or administrator |
| DELETE | `/v1/products/:uuid` | Product owner or administrator; creates a tombstone |
| POST | `/v1/orders` | Customer or administrator |
| GET | `/v1/orders` | Owning customer, business owner, or administrator |
| GET | `/v1/orders/:uuid` | Owning customer, business owner, or administrator |
| PATCH | `/v1/orders/:uuid/status` | Business owner, administrator, or owning customer cancellation |
| POST | `/v1/reports` | Authenticated actor |
| GET | `/v1/reports` | Platform or system administrator |
| PATCH | `/v1/reports/:uuid/status` | Platform or system administrator |
| GET | `/v1/categories` | Platform or system administrator |
| POST | `/v1/categories` | Platform or system administrator |
| GET | `/v1/analytics/product-categories` | Platform or system administrator; minimum group size enforced |
| POST | `/v1/sync/push` | Authenticated actor |
| GET | `/v1/sync/pull` | Authenticated actor |

The HTTP server is created with `createApiServer` and receives both the
repository and token verifier through dependency injection. This keeps secrets,
Supabase credentials, and provider-specific SDK code outside the route layer.

The remaining production integration is a Supabase-backed implementation of
`ApiRepository` and a verifier backed by Supabase Auth/Google Sign-In. Never
accept client-supplied roles, ownership, snapshot prices, server-only
identifiers, or attribution actors.
