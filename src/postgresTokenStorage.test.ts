import { beforeEach, describe, expect, it, vi } from 'vitest';

const { poolMock, queryMock } = vi.hoisted(() => {
  const queryMock = vi.fn();
  const poolMock = vi.fn(function MockPool(this: unknown) {
    return { query: queryMock };
  });

  return { poolMock, queryMock };
});

vi.mock('pg', () => ({
  Pool: poolMock,
}));

import { PostgresTokenStorage } from './postgresTokenStorage.js';

describe('PostgresTokenStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue({ rows: [] });
  });

  it('creates the pool from DATABASE_URL', () => {
    new PostgresTokenStorage('postgres://user:pass@localhost:5432/app');

    expect(poolMock).toHaveBeenCalledWith({
      connectionString: 'postgres://user:pass@localhost:5432/app',
    });
  });

  it('upserts rows and encodes nested Date values for jsonb storage', async () => {
    const storage = new PostgresTokenStorage('postgres://example');
    const createdAt = new Date('2026-04-02T12:34:56.000Z');

    await storage.save(
      'mapping:test',
      {
        createdAt,
        nested: { issuedAt: createdAt },
        scope: ['openid'],
      },
      60
    );

    expect(queryMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('CREATE TABLE IF NOT EXISTS mcp_oauth_tokens')
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_expires_at_idx')
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO mcp_oauth_tokens'),
      [
        'mapping:test',
        {
          createdAt: { __tokenStorageDate: '2026-04-02T12:34:56.000Z' },
          nested: {
            issuedAt: { __tokenStorageDate: '2026-04-02T12:34:56.000Z' },
          },
          scope: ['openid'],
        },
        expect.any(Date),
      ]
    );
  });

  it('decodes Date markers when reading stored values', async () => {
    const storage = new PostgresTokenStorage('postgres://example');

    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            expires_at: null,
            value_json: {
              issuedAt: { __tokenStorageDate: '2026-04-02T08:00:00.000Z' },
              nested: {
                expiresAt: { __tokenStorageDate: '2026-04-02T09:00:00.000Z' },
              },
            },
          },
        ],
      });

    const result = await storage.get('upstream:test');

    expect(result).toEqual({
      issuedAt: new Date('2026-04-02T08:00:00.000Z'),
      nested: {
        expiresAt: new Date('2026-04-02T09:00:00.000Z'),
      },
    });
  });

  it('deletes expired rows when reading them', async () => {
    const storage = new PostgresTokenStorage('postgres://example');

    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            expires_at: new Date('2026-04-01T00:00:00.000Z'),
            value_json: { token: 'expired' },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await storage.get('mapping:expired');

    expect(result).toBeNull();
    expect(queryMock).toHaveBeenNthCalledWith(
      4,
      'DELETE FROM mcp_oauth_tokens WHERE key = $1',
      ['mapping:expired']
    );
  });

  it('runs cleanup without recreating the schema after first use', async () => {
    const storage = new PostgresTokenStorage('postgres://example');

    await storage.save('mapping:test', { ok: true }, 30);
    await storage.cleanup();

    expect(
      queryMock.mock.calls.filter(([sql]) =>
        String(sql).includes('CREATE TABLE IF NOT EXISTS mcp_oauth_tokens')
      )
    ).toHaveLength(1);
    expect(
      queryMock.mock.calls.filter(([sql]) =>
        String(sql).includes('CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_expires_at_idx')
      )
    ).toHaveLength(1);
    expect(queryMock).toHaveBeenLastCalledWith(
      expect.stringContaining('DELETE FROM mcp_oauth_tokens')
    );
  });
});
