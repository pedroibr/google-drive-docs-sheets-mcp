import { Pool } from 'pg';
import type { TokenStorage } from 'fastmcp/auth';

const TABLE = 'mcp_oauth_tokens';
const DATE_MARKER = '__tokenStorageDate';

/**
 * Postgres-backed TokenStorage for FastMCP's OAuth proxy.
 * Tokens survive restarts as long as DATABASE_URL points to persistent storage.
 */
export class PostgresTokenStorage implements TokenStorage {
  private readonly pool: Pool;
  private schemaReady: Promise<void> | null = null;

  constructor(databaseUrl?: string) {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required when TOKEN_STORE=postgres');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async save(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.ensureSchema();

    const expiresAt = ttl ? new Date(Date.now() + ttl * 1000) : null;
    await this.pool.query(
      `
        INSERT INTO ${TABLE} (key, value_json, created_at, expires_at)
        VALUES ($1, $2, NOW(), $3)
        ON CONFLICT (key) DO UPDATE
        SET value_json = EXCLUDED.value_json,
            created_at = NOW(),
            expires_at = EXCLUDED.expires_at
      `,
      [key, encodeValue(value), expiresAt]
    );
  }

  async get(key: string): Promise<unknown | null> {
    await this.ensureSchema();

    const result = await this.pool.query<{ expires_at: Date | null; value_json: unknown }>(
      `
        SELECT value_json, expires_at
        FROM ${TABLE}
        WHERE key = $1
        LIMIT 1
      `,
      [key]
    );

    const row = result.rows[0];
    if (!row) return null;

    if (row.expires_at && row.expires_at.getTime() <= Date.now()) {
      await this.delete(key);
      return null;
    }

    return decodeValue(row.value_json);
  }

  async delete(key: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(`DELETE FROM ${TABLE} WHERE key = $1`, [key]);
  }

  async cleanup(): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
        DELETE FROM ${TABLE}
        WHERE expires_at IS NOT NULL
          AND expires_at <= NOW()
      `
    );
  }

  private async ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.createSchema().catch((error) => {
        this.schemaReady = null;
        throw error;
      });
    }

    await this.schemaReady;
  }

  private async createSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        key text PRIMARY KEY,
        value_json jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        expires_at timestamptz NULL
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ${TABLE}_expires_at_idx
      ON ${TABLE} (expires_at)
    `);
  }
}

function encodeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return { [DATE_MARKER]: value.toISOString() };
  }

  if (Array.isArray(value)) {
    return value.map((item) => encodeValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
  }

  return value;
}

function decodeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => decodeValue(item));
  }

  if (isPlainObject(value)) {
    if (isDateMarker(value)) {
      const date = new Date(value[DATE_MARKER]);
      return Number.isNaN(date.getTime()) ? value : date;
    }

    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeValue(item)]));
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isDateMarker(value: Record<string, unknown>): value is Record<typeof DATE_MARKER, string> {
  return Object.keys(value).length === 1 && typeof value[DATE_MARKER] === 'string';
}
