import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { access, readFile, stat } from 'fs/promises';
import { join, dirname, resolve, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { constants } from 'fs';
import { initWorkspaceManager, getWorkspaceManager } from './workspace.js';
import { setupSocketServer } from './socket.js';
import { registerAgentRoutes } from './api/agents.js';
import { registerZoneRoutes } from './api/zones.js';
import { registerTaskRoutes } from './api/tasks.js';
import { scanWorkspace, watchWorkspace, detectAgentsInWorkspace } from './watcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || '4101', 10);

// Resolve workspace path: CLI arg > env var > cwd
// Usage: npx tsx server/index.ts /absolute/path/to/workspace
function resolveWorkspacePath(): string {
  const cliArg = process.argv[2];
  const envPath = process.env.WORKSPACE_PATH;
  const raw = cliArg || envPath || process.cwd();

  // Resolve to absolute
  const resolved = isAbsolute(raw) ? raw : resolve(raw);
  return resolved;
}

const WORKSPACE_PATH = resolveWorkspacePath();

async function main() {
  console.log('[Server] Starting OpGrid Workspace...');

  // Validate workspace path exists and is a directory
  try {
    const stats = await stat(WORKSPACE_PATH);
    if (!stats.isDirectory()) {
      console.error(`[Server] Error: ${WORKSPACE_PATH} is not a directory`);
      process.exit(1);
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.error(`[Server] Error: workspace path does not exist: ${WORKSPACE_PATH}`);
    } else {
      console.error(`[Server] Error: cannot access workspace path: ${WORKSPACE_PATH}`, err.message);
    }
    process.exit(1);
  }

  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  });

  // CORS for local dev
  await fastify.register(cors, {
    origin: [
      'http://localhost:5173',
      'http://localhost:4100',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:4100',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Health check
  fastify.get('/health', async () => {
    const workspace = getWorkspaceManager();
    return {
      status: 'ok',
      agents: workspace.getAgents().length,
      zones: workspace.getZones().length,
      tick: workspace.getCurrentTick(),
      timestamp: Date.now(),
    };
  });

  // Workspace info — returns the watched path + stats
  fastify.get('/api/workspace', async () => {
    const workspace = getWorkspaceManager();
    return {
      path: WORKSPACE_PATH,
      agents: workspace.getAgents().length,
      zones: workspace.getZones().length,
      tasks: workspace.getTasks().length,
      tick: workspace.getCurrentTick(),
    };
  });

  // Rescan workspace — re-detect projects without restarting
  fastify.post('/api/rescan', async () => {
    const workspace = getWorkspaceManager();
    // Clear existing zones from scanner (keep manually created ones)
    const existingZones = workspace.getZones();
    for (const zone of existingZones) {
      // Only remove auto-detected zones (those with a path)
      if (zone.path) {
        workspace.removeZone(zone.id);
      }
    }
    await scanWorkspace(WORKSPACE_PATH);
    await detectAgentsInWorkspace();
    return {
      status: 'ok',
      zones: workspace.getZones().length,
      agents: workspace.getAgents().length,
      path: WORKSPACE_PATH,
    };
  });

  // Register API routes
  await registerAgentRoutes(fastify);
  await registerZoneRoutes(fastify);
  await registerTaskRoutes(fastify);

  // Serve static frontend in production
  const distPath = join(__dirname, '..', 'dist');
  try {
    await access(distPath, constants.R_OK);
    await fastify.register(fastifyStatic, {
      root: distPath,
      prefix: '/',
      decorateReply: false,
    });

    fastify.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      const html = await readFile(join(distPath, 'index.html'), 'utf-8');
      return reply.type('text/html').send(html);
    });
    console.log('[Server] Serving static frontend from dist/');
  } catch {
    // No dist — dev mode, frontend served by vite
  }

  // Initialize workspace manager (in-memory, no DB)
  const workspace = initWorkspaceManager();

  // Start HTTP server
  await fastify.listen({ port: PORT, host: '::' });

  // Attach Socket.io
  const io = setupSocketServer(fastify.server);

  // Start tick loop
  workspace.start();

  // Scan workspace for projects, then detect agents
  await scanWorkspace(WORKSPACE_PATH);
  await detectAgentsInWorkspace();

  // Watch for file changes (non-blocking)
  watchWorkspace(WORKSPACE_PATH).catch((err) => {
    console.warn('[Server] Filesystem watching unavailable:', err.message);
  });

  console.log('');
  console.log('  ┌──────────────────────────────────────────────┐');
  console.log('  │            OpGrid Workspace                  │');
  console.log('  └──────────────────────────────────────────────┘');
  console.log(`  → Server:    http://localhost:${PORT}`);
  console.log(`  → Workspace: ${WORKSPACE_PATH}`);
  console.log(`  → Zones:     ${workspace.getZones().length} projects detected`);
  console.log(`  → Agents:    ${workspace.getAgents().length} detected`);
  console.log(`  → API:       /api/agents, /api/zones, /api/tasks, /api/workspace`);
  console.log('');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] Received ${signal}, shutting down...`);
    workspace.stop();
    io.close();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});
