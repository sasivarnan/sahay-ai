import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { Pool } from "pg"
import type { PoolClient } from "pg"
import type { State } from "../domain/model"
import { emptyState } from "../domain/model"
import type { Repository } from "../domain/service"

export class DatabaseRepository implements Repository {
  private tail: Promise<unknown> = Promise.resolve()
  private connection: Promise<PGlite | Pool>
  constructor(
    databaseUrl = process.env.DATABASE_URL,
    dataDirectory = process.env.DATA_DIRECTORY ??
      resolve(process.cwd(), ".data/postgres")
  ) {
    this.connection = (async () => {
      const db = databaseUrl
        ? new Pool({ connectionString: databaseUrl, max: 5 })
        : await this.localDatabase(dataDirectory)
      await query(
        db,
        "CREATE TABLE IF NOT EXISTS sahay_state (id integer PRIMARY KEY, payload jsonb NOT NULL)"
      )
      await query(
        db,
        "INSERT INTO sahay_state (id, payload) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING",
        [JSON.stringify(emptyState())]
      )
      return db
    })()
  }
  private async localDatabase(directory: string) {
    await mkdir(directory, { recursive: true })
    return new PGlite(directory)
  }
  transact<T>(operation: (state: State) => T | Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const db = await this.connection
      const connection = db instanceof Pool ? await db.connect() : db
      try {
        await query(connection, "BEGIN")
        const result = await query<{ payload: State }>(
          connection,
          "SELECT payload FROM sahay_state WHERE id = 1 FOR UPDATE"
        )
        const state = result.rows[0].payload
        const output = await operation(state)
        await query(
          connection,
          "UPDATE sahay_state SET payload = $1::jsonb WHERE id = 1",
          [JSON.stringify(state)]
        )
        await query(connection, "COMMIT")
        return structuredClone(output)
      } catch (error) {
        await query(connection, "ROLLBACK")
        throw error
      } finally {
        if ("release" in connection) connection.release()
      }
    })
    this.tail = run.catch(() => {})
    return run
  }
  async close() {
    const db = await this.connection
    if (db instanceof Pool) await db.end()
    else await db.close()
  }
}

async function query<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  connection: PGlite | Pool | PoolClient,
  sql: string,
  parameters?: unknown[]
): Promise<{ rows: T[] }> {
  if (connection instanceof PGlite) return connection.query<T>(sql, parameters)
  return connection.query<T>(sql, parameters)
}
