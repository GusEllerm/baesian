import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";

// The accounts database's migrations (service/migrations), applied before each test file, as `wrangler d1 migrations
// apply` applies them. Applied migrations are recorded, so applying them again does nothing.
await applyD1Migrations(env.ACCOUNTS, (env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }).TEST_MIGRATIONS);
