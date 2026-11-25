import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const file = path.join(process.cwd(), "db/changelog/changelog.sql");
const text = fs.readFileSync(file, "utf8");
const parts = text.split(/^--changeset /m).slice(1);
const databaseUrl = process.env.DATABASE_URL ?? "postgres://wedding:wedding@127.0.0.1:5433/wedding_music";
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();
await client.query(`
  CREATE TABLE IF NOT EXISTS databasechangelog (
    id text PRIMARY KEY,
    dateexecuted timestamptz NOT NULL DEFAULT now()
  )
`);
for (const part of parts) {
  const newline = part.indexOf("\n");
  const id = part.slice(0, newline).trim().split(/\s+/)[0];
  const sql = part.slice(newline + 1).trim();
  const existing = await client.query("SELECT id FROM databasechangelog WHERE id = $1", [id]);
  if (existing.rowCount) continue;
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO databasechangelog (id) VALUES ($1)", [id]);
    await client.query("COMMIT");
    console.log(`applied ${id}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`failed ${id}`);
    throw error;
  }
}
await client.end();
