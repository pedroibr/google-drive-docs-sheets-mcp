import type { TokenStorage } from 'fastmcp/auth';
import { FirestoreTokenStorage } from './firestoreTokenStorage.js';
import { logger } from './logger.js';
import { PostgresTokenStorage } from './postgresTokenStorage.js';

export type SupportedTokenStore = 'firestore' | 'postgres';

type LoggerLike = Pick<typeof logger, 'info' | 'warn'>;

export function getConfiguredTokenStore(
  env: NodeJS.ProcessEnv = process.env
): SupportedTokenStore | undefined {
  const tokenStore = env.TOKEN_STORE?.trim().toLowerCase();
  if (tokenStore === 'firestore' || tokenStore === 'postgres') {
    return tokenStore;
  }
  return undefined;
}

export function getRemoteAuthEnvErrors(env: NodeJS.ProcessEnv = process.env): string[] {
  const missing = ['BASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter((key) => !env[key]);
  const tokenStore = getConfiguredTokenStore(env);

  if (tokenStore === 'firestore' && !env.GCLOUD_PROJECT) {
    missing.push('GCLOUD_PROJECT');
  }

  if (tokenStore === 'postgres' && !env.DATABASE_URL) {
    missing.push('DATABASE_URL');
  }

  return missing;
}

export function createTokenStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env
): TokenStorage | undefined {
  const tokenStore = getConfiguredTokenStore(env);

  if (tokenStore === 'firestore') {
    logger.info('[token-store] Using Firestore token storage.');
    return new FirestoreTokenStorage(env.GCLOUD_PROJECT);
  }

  if (tokenStore === 'postgres') {
    logger.info('[token-store] Using Postgres token storage.');
    return new PostgresTokenStorage(env.DATABASE_URL);
  }

  logger.info('[token-store] Using in-memory token storage.');
  return undefined;
}

export function warnIfJwtSigningKeyMissing(
  env: NodeJS.ProcessEnv = process.env,
  log: LoggerLike = logger
): void {
  if (env.MCP_TRANSPORT === 'httpStream' && !env.JWT_SIGNING_KEY) {
    log.warn(
      'JWT_SIGNING_KEY is not set; OAuth sessions and refresh tokens may stop working after restarts or cold starts.'
    );
  }
}
