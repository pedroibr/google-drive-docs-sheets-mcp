import http from 'node:http';
import { logger } from './logger.js';
import { runServer } from './runServer.js';
import type { ToolsetId } from './serverToolsets.js';

type PrefixedToolsetId = Exclude<ToolsetId, 'workspace'>;

const PREFIXED_TOOLSETS: PrefixedToolsetId[] = ['docs', 'drive', 'gmail', 'sheets', 'slides'];
const WORKSPACE_PORT_OFFSET = 0;
const TOOLSET_PORT_OFFSETS: Record<PrefixedToolsetId, number> = {
  docs: 1,
  drive: 2,
  gmail: 3,
  sheets: 4,
  slides: 5,
};

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function joinUrl(baseUrl: string, segment: string): string {
  return `${stripTrailingSlash(baseUrl)}/${segment}`;
}

function rewritePath(originalPath: string, prefix: string): string {
  const stripped = originalPath.slice(prefix.length);
  return stripped.length > 0 ? stripped : '/';
}

function rewriteHtmlForPrefixedToolset(html: string, toolsetId: PrefixedToolsetId): string {
  const prefix = `/${toolsetId}`;

  return html
    .replace(/(["'])\/oauth\//g, `$1${prefix}/oauth/`)
    .replace(/(["'])\/\.well-known\/oauth-/g, `$1${prefix}/.well-known/oauth-`);
}

function resolveTarget(pathname: string, internalBasePort: number) {
  for (const toolsetId of PREFIXED_TOOLSETS) {
    const prefix = `/${toolsetId}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return {
        internalPort: internalBasePort + TOOLSET_PORT_OFFSETS[toolsetId],
        rewrittenPath: rewritePath(pathname, prefix),
        toolsetId,
      };
    }
  }

  return {
    internalPort: internalBasePort + WORKSPACE_PORT_OFFSET,
    rewrittenPath: pathname,
    toolsetId: 'workspace' as const,
  };
}

function buildOverviewPage(baseUrl: string): string {
  const links = [
    { label: 'Workspace', url: `${stripTrailingSlash(baseUrl)}/mcp` },
    ...PREFIXED_TOOLSETS.map((toolsetId) => ({
      label: toolsetId[0].toUpperCase() + toolsetId.slice(1),
      url: `${joinUrl(baseUrl, toolsetId)}/mcp`,
    })),
  ];

  const items = links
    .map((link) => `<li><a href="${link.url}">${link.label}</a> <code>${link.url}</code></li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Google Workspace MCP Endpoints</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 820px; padding: 0 1rem; color: #111827; }
    h1 { margin-bottom: 0.5rem; }
    p { color: #4b5563; }
    ul { padding-left: 1.25rem; }
    li { margin: 0.75rem 0; }
    code { background: #f3f4f6; padding: 0.1rem 0.35rem; border-radius: 4px; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Google Workspace MCP Endpoints</h1>
  <p>Single deployed service exposing separate MCP URLs for each Google product surface.</p>
  <ul>${items}</ul>
</body>
</html>`;
}

async function startInternalServers(baseUrl: string, internalBasePort: number): Promise<void> {
  await runServer('workspace', {
    baseUrlOverride: stripTrailingSlash(baseUrl),
    hostOverride: '127.0.0.1',
    portOverride: internalBasePort + WORKSPACE_PORT_OFFSET,
  });

  for (const toolsetId of PREFIXED_TOOLSETS) {
    await runServer(toolsetId, {
      baseUrlOverride: joinUrl(baseUrl, toolsetId),
      hostOverride: '127.0.0.1',
      portOverride: internalBasePort + TOOLSET_PORT_OFFSETS[toolsetId],
    });
  }
}

export async function startMultiEndpointGateway(): Promise<void> {
  const publicPort = parseInt(process.env.PORT || '8080', 10);
  const publicBaseUrl = process.env.BASE_URL;
  const internalBasePort = parseInt(process.env.INTERNAL_MCP_BASE_PORT || '9100', 10);

  if (!publicBaseUrl) {
    throw new Error('BASE_URL is required to start the multi-endpoint gateway.');
  }

  await startInternalServers(publicBaseUrl, internalBasePort);

  const server = http.createServer((req, res) => {
    const method = req.method || 'GET';
    const url = new URL(req.url || '/', 'http://localhost');

    if (method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildOverviewPage(publicBaseUrl));
      return;
    }

    const target = resolveTarget(url.pathname, internalBasePort);
    const upstreamPath = `${target.rewrittenPath}${url.search}`;

    const upstream = http.request(
      {
        hostname: '127.0.0.1',
        port: target.internalPort,
        path: upstreamPath,
        method,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${target.internalPort}`,
        },
      },
      (upstreamRes) => {
        const contentType = upstreamRes.headers['content-type'];
        const isHtmlResponse =
          typeof contentType === 'string' &&
          contentType.toLowerCase().includes('text/html') &&
          target.toolsetId !== 'workspace';

        if (!isHtmlResponse) {
          res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
          upstreamRes.pipe(res);
          return;
        }

        const bodyChunks: Buffer[] = [];
        upstreamRes.on('data', (chunk) => bodyChunks.push(Buffer.from(chunk)));
        upstreamRes.on('end', () => {
          const originalHtml = Buffer.concat(bodyChunks).toString('utf8');
          const rewrittenHtml = rewriteHtmlForPrefixedToolset(
            originalHtml,
            target.toolsetId as PrefixedToolsetId
          );

          const headers = { ...upstreamRes.headers };
          delete headers['content-length'];

          res.writeHead(upstreamRes.statusCode || 502, headers);
          res.end(rewrittenHtml);
        });
      }
    );

    upstream.on('error', (error) => {
      logger.error(`Gateway proxy error for ${target.toolsetId}:`, error);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Bad gateway');
    });

    req.pipe(upstream);
  });

  await new Promise<void>((resolve) => server.listen(publicPort, '0.0.0.0', resolve));

  logger.info(`Multi-endpoint gateway running at ${publicBaseUrl}`);
  logger.info(`Workspace MCP: ${stripTrailingSlash(publicBaseUrl)}/mcp`);
  for (const toolsetId of PREFIXED_TOOLSETS) {
    logger.info(`${toolsetId} MCP: ${joinUrl(publicBaseUrl, toolsetId)}/mcp`);
  }
}
