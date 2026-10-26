// Ordered registry schema migrations; each version is applied once against the connection's search_path.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client, Pool } from "pg";

export interface RunRegistryMigrationsOptions {
  readonly migrationsDirectory?: string;
  readonly now?: () => Date;
}

export async function runRegistryMigrations(
  target: Client | Pool,
  options: RunRegistryMigrationsOptions = {}
): Promise<readonly string[]> {
  const directory = options.migrationsDirectory ?? defaultMigrationsDirectory();
  const now = options.now ?? (() => new Date());
  await target.query(
    "CREATE TABLE IF NOT EXISTS zhixu_registry_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL)"
  );

  const applied: string[] = [];
  for (const version of migrationVersions(directory)) {
    const existing = await target.query<{ version: string }>(
      "SELECT version FROM zhixu_registry_migrations WHERE version = $1",
      [version]
    );
    if (existing.rows.length > 0) {
      continue;
    }
    await target.query(readFileSync(join(directory, version), "utf8"));
    await target.query(
      "INSERT INTO zhixu_registry_migrations (version, applied_at) VALUES ($1, $2)",
      [version, now().toISOString()]
    );
    applied.push(version);
  }
  return applied;
}

function migrationVersions(directory: string): readonly string[] {
  return readdirSync(directory)
    .filter((entry) => entry.endsWith(".sql"))
    .sort();
}

function defaultMigrationsDirectory(): string {
  return fileURLToPath(new URL("../../migrations", import.meta.url));
}
