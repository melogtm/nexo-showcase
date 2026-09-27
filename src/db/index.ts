import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// DATABASE_URL set (Vercel/Neon): real Postgres, migrated at build time (`npm run db:migrate`).
// Unset: embedded PGlite (./.pglite in dev, in-memory under Vitest), migrated here.
async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) return drizzlePostgres(postgres(url, { prepare: false }), { schema }) as unknown as Db;
  const db = drizzlePglite(new PGlite(process.env.NODE_ENV === "test" ? undefined : ".pglite"), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as Db;
}

export const db = await connect();
export { schema };
