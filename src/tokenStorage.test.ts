import { beforeEach, describe, expect, it, vi } from 'vitest';

const { firestoreCtor, postgresCtor } = vi.hoisted(() => ({
  firestoreCtor: vi.fn(),
  postgresCtor: vi.fn(),
}));

vi.mock('./firestoreTokenStorage.js', () => ({
  FirestoreTokenStorage: firestoreCtor,
}));

vi.mock('./postgresTokenStorage.js', () => ({
  PostgresTokenStorage: postgresCtor,
}));

import {
  createTokenStorageFromEnv,
  getConfiguredTokenStore,
  getRemoteAuthEnvErrors,
  warnIfTokenEncryptionKeyMissing,
  warnIfJwtSigningKeyMissing,
} from './tokenStorage.js';

describe('tokenStorage environment helpers', () => {
  const remoteEnv: NodeJS.ProcessEnv = {
    BASE_URL: 'https://example.up.railway.app',
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    MCP_TRANSPORT: 'httpStream',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    firestoreCtor.mockImplementation(function MockFirestoreTokenStorage(
      this: unknown,
      projectId?: string
    ) {
      return { backend: 'firestore', projectId };
    });
    postgresCtor.mockImplementation(function MockPostgresTokenStorage(
      this: unknown,
      databaseUrl?: string
    ) {
      return { backend: 'postgres', databaseUrl };
    });
  });

  it('detects supported token stores', () => {
    expect(getConfiguredTokenStore({ TOKEN_STORE: 'postgres' })).toBe('postgres');
    expect(getConfiguredTokenStore({ TOKEN_STORE: 'firestore' })).toBe('firestore');
    expect(getConfiguredTokenStore({ TOKEN_STORE: 'memory' })).toBeUndefined();
  });

  it('requires DATABASE_URL when postgres storage is selected remotely', () => {
    expect(
      getRemoteAuthEnvErrors({
        ...remoteEnv,
        TOKEN_STORE: 'postgres',
      })
    ).toEqual(['DATABASE_URL']);
  });

  it('requires GCLOUD_PROJECT when firestore storage is selected remotely', () => {
    expect(
      getRemoteAuthEnvErrors({
        ...remoteEnv,
        TOKEN_STORE: 'firestore',
      })
    ).toEqual(['GCLOUD_PROJECT']);
  });

  it('creates Postgres storage from the environment', () => {
    const storage = createTokenStorageFromEnv({
      ...remoteEnv,
      DATABASE_URL: 'postgres://db',
      TOKEN_STORE: 'postgres',
    });

    expect(postgresCtor).toHaveBeenCalledWith('postgres://db');
    expect(storage).toEqual({ backend: 'postgres', databaseUrl: 'postgres://db' });
  });

  it('creates Firestore storage from the environment', () => {
    const storage = createTokenStorageFromEnv({
      ...remoteEnv,
      GCLOUD_PROJECT: 'my-project-id',
      TOKEN_STORE: 'firestore',
    });

    expect(firestoreCtor).toHaveBeenCalledWith('my-project-id');
    expect(storage).toEqual({ backend: 'firestore', projectId: 'my-project-id' });
  });

  it('warns when JWT_SIGNING_KEY is missing in remote mode', () => {
    const warn = vi.fn();

    warnIfJwtSigningKeyMissing(remoteEnv, { warn });

    expect(warn).toHaveBeenCalledWith(
      'JWT_SIGNING_KEY is not set; OAuth sessions and refresh tokens may stop working after restarts or cold starts.'
    );
  });

  it('does not warn when JWT_SIGNING_KEY is present', () => {
    const warn = vi.fn();

    warnIfJwtSigningKeyMissing({ ...remoteEnv, JWT_SIGNING_KEY: 'fixed-secret' }, { warn });

    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when TOKEN_ENCRYPTION_KEY is missing with persistent remote storage', () => {
    const warn = vi.fn();

    warnIfTokenEncryptionKeyMissing({ ...remoteEnv, TOKEN_STORE: 'postgres' }, { warn });

    expect(warn).toHaveBeenCalledWith(
      'TOKEN_ENCRYPTION_KEY is not set; persisted OAuth tokens may become unreadable after restarts or cold starts.'
    );
  });

  it('does not warn when TOKEN_ENCRYPTION_KEY is present', () => {
    const warn = vi.fn();

    warnIfTokenEncryptionKeyMissing(
      {
        ...remoteEnv,
        TOKEN_ENCRYPTION_KEY: 'fixed-encryption-key',
        TOKEN_STORE: 'postgres',
      },
      { warn }
    );

    expect(warn).not.toHaveBeenCalled();
  });
});
