import { FastMCP, GoogleProvider } from 'fastmcp';
import { GOOGLE_API_SCOPES } from './auth.js';
import {
  buildCachedToolsListPayload,
  collectToolsWhileRegistering,
  installCachedToolsListHandler,
} from './cachedToolsList.js';
import { initializeGoogleClient } from './clients.js';
import { registerLandingPage } from './landingPage.js';
import { logger } from './logger.js';
import { wrapServerForRemote } from './remoteWrapper.js';
import { SERVER_TOOLSETS, type ToolsetId } from './serverToolsets.js';
import {
  createTokenStorageFromEnv,
  getRemoteAuthEnvErrors,
  warnIfTokenEncryptionKeyMissing,
  warnIfJwtSigningKeyMissing,
} from './tokenStorage.js';

export interface RunServerOptions {
  baseUrlOverride?: string;
  endpointOverride?: `/${string}`;
  hostOverride?: string;
  portOverride?: number;
}

let processHandlersConfigured = false;

function installProcessErrorHandlers(): void {
  if (processHandlersConfigured) return;
  processHandlersConfigured = true;

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
  });

  process.on('unhandledRejection', (reason, _promise) => {
    logger.error('Unhandled Promise Rejection:', reason);
  });
}

export async function runServer(toolsetId: ToolsetId, options: RunServerOptions = {}): Promise<void> {
  const toolset = SERVER_TOOLSETS[toolsetId];

  if (process.argv[2] === 'auth') {
    const { runAuthFlow } = await import('./auth.js');
    try {
      await runAuthFlow();
      logger.info('Authorization complete. You can now start the MCP server.');
      process.exit(0);
    } catch (error: any) {
      logger.error('Authorization failed:', error.message || error);
      process.exit(1);
    }
  }

  installProcessErrorHandlers();

  const isRemote = process.env.MCP_TRANSPORT === 'httpStream';
  const baseUrl = options.baseUrlOverride ?? process.env.BASE_URL;
  const endpoint = options.endpointOverride ?? '/mcp';
  const host = options.hostOverride ?? '0.0.0.0';
  const port = options.portOverride ?? parseInt(process.env.PORT || '8080', 10);

  if (isRemote) {
    const missing = getRemoteAuthEnvErrors(process.env);
    if (missing.length > 0) {
      logger.error(`FATAL: Missing required env vars for httpStream mode: ${missing.join(', ')}`);
      process.exit(1);
    }

    warnIfJwtSigningKeyMissing(process.env);
    warnIfTokenEncryptionKeyMissing(process.env);
  }

  const tokenStorage = isRemote ? createTokenStorageFromEnv(process.env) : undefined;

  const server = new FastMCP({
    name: toolset.serverName,
    version: '1.0.0',
    ...(isRemote && {
      auth: new GoogleProvider({
        allowedRedirectUriPatterns: ['http://localhost:*', `${baseUrl}/*`, 'cursor://*'],
        baseUrl: baseUrl!,
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        scopes: ['openid', 'email', ...GOOGLE_API_SCOPES],
        ...(process.env.TOKEN_ENCRYPTION_KEY && {
          encryptionKey: process.env.TOKEN_ENCRYPTION_KEY,
        }),
        ...(process.env.JWT_SIGNING_KEY && { jwtSigningKey: process.env.JWT_SIGNING_KEY }),
        ...(process.env.REFRESH_TOKEN_TTL && {
          refreshTokenTtl: parseInt(process.env.REFRESH_TOKEN_TTL, 10),
        }),
        ...(tokenStorage && { tokenStorage }),
      }),
    }),
  });

  const registeredTools: Parameters<FastMCP['addTool']>[0][] = [];
  collectToolsWhileRegistering(server, registeredTools);
  if (isRemote) wrapServerForRemote(server);
  toolset.registerTools(server);

  try {
    if (isRemote) {
      logger.info(`Starting ${toolset.serverName} in remote mode (httpStream + MCP OAuth 2.1)...`);
      registerLandingPage(server, {
        toolCount: registeredTools.length,
        title: toolset.landingTitle,
        subtitle: toolset.landingSubtitle,
        configKey: toolset.configKey,
      });

      await server.start({
        transportType: 'httpStream',
        httpStream: {
          port,
          host,
          endpoint,
        },
      });

      logger.info(`MCP Server running at ${baseUrl || `http://${host}:${port}`}${endpoint}`);
    } else {
      await initializeGoogleClient();
      logger.info(`Starting ${toolset.serverName}...`);

      const cachedToolsList = await buildCachedToolsListPayload(registeredTools);
      await server.start({ transportType: 'stdio' as const });
      installCachedToolsListHandler(server, cachedToolsList);
      logger.info('MCP Server running using stdio. Awaiting client connection...');
    }
    logger.info('Process-level error handling configured to prevent crashes from timeout errors.');
  } catch (startError: any) {
    logger.error('FATAL: Server failed to start:', startError.message || startError);
    process.exit(1);
  }
}
