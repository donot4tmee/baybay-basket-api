import {
  createApiServer,
  createSupabaseClient,
  createSupabaseServiceClient,
  SupabaseAccessTokenVerifier,
  SupabaseRepository,
} from "./index.js";

const port = Number(process.env.PORT ?? 3000);
const anonClient = createSupabaseClient();
const serviceClient = createSupabaseServiceClient();

const server = createApiServer({
  repository: new SupabaseRepository(serviceClient),
  verifier: new SupabaseAccessTokenVerifier(anonClient),
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Baybay Basket API listening on port ${port}`);
});
