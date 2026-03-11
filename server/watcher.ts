import { watch, readdir, stat, readFile, access } from 'fs/promises';
import { join, basename } from 'path';
import { constants } from 'fs';
import { execSync } from 'child_process';
import { getWorkspaceManager } from './workspace.js';

// Project detection markers
const PROJECT_MARKERS = [
  'package.json',
  'Cargo.toml',
  'pyproject.toml',
  'go.mod',
  'Gemfile',
  'pom.xml',
  'build.gradle',
  'CMakeLists.txt',
  'Makefile',
];

// Framework detection from package.json
function detectFramework(pkg: any): string | undefined {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps['next']) return 'Next.js';
  if (deps['vite']) return 'Vite';
  if (deps['react']) return 'React';
  if (deps['vue']) return 'Vue';
  if (deps['svelte'] || deps['@sveltejs/kit']) return 'Svelte';
  if (deps['express']) return 'Express';
  if (deps['fastify']) return 'Fastify';
  if (deps['@nestjs/core']) return 'NestJS';
  return undefined;
}

// Language detection from project markers
function detectLanguage(marker: string, pkg?: any): string {
  if (marker === 'Cargo.toml') return 'Rust';
  if (marker === 'pyproject.toml') return 'Python';
  if (marker === 'go.mod') return 'Go';
  if (marker === 'Gemfile') return 'Ruby';
  if (marker === 'pom.xml' || marker === 'build.gradle') return 'Java';
  if (marker === 'CMakeLists.txt') return 'C/C++';
  if (marker === 'package.json') {
    if (pkg?.devDependencies?.typescript || pkg?.dependencies?.typescript) return 'TypeScript';
    return 'JavaScript';
  }
  return 'Unknown';
}

// Count files in a directory (non-recursive, quick estimate)
async function countFiles(dirPath: string): Promise<number> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
      if (entry.isFile()) count++;
      if (entry.isDirectory()) {
        // One level deep count
        try {
          const subEntries = await readdir(join(dirPath, entry.name));
          count += subEntries.filter((e) => !e.startsWith('.')).length;
        } catch {
          // Skip inaccessible dirs
        }
      }
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Scan a workspace directory for sub-projects and register them as zones.
 */
export async function scanWorkspace(workspacePath: string): Promise<void> {
  const workspace = getWorkspaceManager();
  console.log(`[Watcher] Scanning workspace: ${workspacePath}`);

  try {
    const entries = await readdir(workspacePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;

      const projectPath = join(workspacePath, entry.name);

      // Check for project markers
      for (const marker of PROJECT_MARKERS) {
        try {
          const markerPath = join(projectPath, marker);
          await stat(markerPath);

          // Found a project!
          let pkg: any = undefined;
          let framework: string | undefined;
          let language = detectLanguage(marker);

          if (marker === 'package.json') {
            try {
              const content = await readFile(markerPath, 'utf-8');
              pkg = JSON.parse(content);
              framework = detectFramework(pkg);
              language = detectLanguage(marker, pkg);
            } catch {
              // Malformed package.json
            }
          }

          const fileCount = await countFiles(projectPath);

          workspace.addZone({
            name: entry.name,
            path: projectPath,
            fileCount,
            language,
            framework,
          });

          console.log(`[Watcher] Found project: ${entry.name} (${language}${framework ? ` / ${framework}` : ''}, ~${fileCount} files)`);
          break; // Only match first marker per directory
        } catch {
          // Marker not found, try next
        }
      }
    }

    // Also check if the workspace root itself is a project
    for (const marker of PROJECT_MARKERS) {
      try {
        const markerPath = join(workspacePath, marker);
        await stat(markerPath);

        let pkg: any = undefined;
        let framework: string | undefined;
        let language = detectLanguage(marker);

        if (marker === 'package.json') {
          try {
            const content = await readFile(markerPath, 'utf-8');
            pkg = JSON.parse(content);
            framework = detectFramework(pkg);
            language = detectLanguage(marker, pkg);
          } catch {}
        }

        const fileCount = await countFiles(workspacePath);

        workspace.addZone({
          name: basename(workspacePath),
          path: workspacePath,
          fileCount,
          language,
          framework,
        });

        console.log(`[Watcher] Root is also a project: ${basename(workspacePath)} (${language})`);
        break;
      } catch {
        // Not a project root
      }
    }
  } catch (err) {
    console.error(`[Watcher] Failed to scan workspace:`, err);
  }
}

// Agent presence markers — directories/files that indicate an AI coding agent
const AGENT_MARKERS: Array<{ marker: string; type: 'claude-code' | 'cursor' | 'aider' | 'codex' | 'custom'; name: string }> = [
  { marker: '.claude', type: 'claude-code', name: 'Claude Code' },
  { marker: '.cursor', type: 'cursor', name: 'Cursor' },
  { marker: '.aider.conf.yml', type: 'aider', name: 'Aider' },
  { marker: '.aider.chat.history.md', type: 'aider', name: 'Aider' },
  { marker: '.codex', type: 'codex', name: 'Codex' },
];

/**
 * Check if a process is likely running for a given agent type in a project directory.
 * Uses lsof/fuser to check for open files in the marker directory.
 */
function isAgentProcessRunning(projectPath: string, marker: string): boolean {
  const markerPath = join(projectPath, marker);
  try {
    // Check if any process has files open in the marker directory
    const result = execSync(`lsof +D "${markerPath}" 2>/dev/null || true`, {
      encoding: 'utf-8',
      timeout: 3000,
    });
    // If there's output beyond the header, a process has the directory open
    const lines = result.trim().split('\n').filter(Boolean);
    return lines.length > 1; // First line is the header
  } catch {
    return false;
  }
}

/**
 * Scan a project directory for AI agent presence markers and register detected agents.
 */
async function detectAgentsInProject(projectPath: string, zoneName: string): Promise<void> {
  const workspace = getWorkspaceManager();
  const seenTypes = new Set<string>();

  for (const { marker, type, name } of AGENT_MARKERS) {
    // Skip if we already registered this agent type for this project
    if (seenTypes.has(type)) continue;

    try {
      const markerPath = join(projectPath, marker);
      await access(markerPath, constants.F_OK);

      // Marker exists — check if the agent process is currently running
      const running = isAgentProcessRunning(projectPath, marker);
      seenTypes.add(type);

      // Find the zone for this project
      const zones = workspace.getZones();
      const zone = zones.find((z) => z.path === projectPath);

      const agentName = `${name} (${zoneName})`;

      // Check if this agent is already registered (by name match)
      const existingAgents = workspace.getAgents();
      const alreadyRegistered = existingAgents.some((a) => a.name === agentName);
      if (alreadyRegistered) continue;

      const agent = workspace.registerAgent({
        name: agentName,
        type,
      });

      // Set status based on whether the process is running
      workspace.updateAgentStatus(agent.id, {
        status: running ? 'working' : 'idle',
        currentZoneId: zone?.id,
      });

      // If there's a zone, assign the agent to it
      if (zone) {
        workspace.assignAgentsToZone([agent.id], zone.id);
      }

      console.log(`[Watcher] Detected agent: ${agentName} (${running ? 'active' : 'idle'})`);
    } catch {
      // Marker not found — no agent of this type
    }
  }
}

/**
 * Scan all zones for agent markers and register detected agents.
 */
export async function detectAgentsInWorkspace(): Promise<void> {
  const workspace = getWorkspaceManager();
  const zones = workspace.getZones();

  for (const zone of zones) {
    if (zone.path) {
      await detectAgentsInProject(zone.path, zone.name);
    }
  }

  const agents = workspace.getAgents();
  console.log(`[Watcher] Agent detection complete: ${agents.length} agent(s) found`);
}

/**
 * Watch workspace directory for file changes.
 * Currently logs changes — future: correlate with agent activity.
 */
export async function watchWorkspace(workspacePath: string): Promise<void> {
  console.log(`[Watcher] Watching for changes in: ${workspacePath}`);

  try {
    const watcher = watch(workspacePath, { recursive: true });
    for await (const event of watcher) {
      // Skip node_modules, .git, dist changes
      if (
        event.filename?.includes('node_modules') ||
        event.filename?.includes('.git') ||
        event.filename?.includes('dist/')
      ) {
        continue;
      }
      // Detect new agent sessions appearing
      const fname = event.filename || '';
      if (event.eventType === 'rename') {
        for (const { marker, name } of AGENT_MARKERS) {
          if (fname.includes(marker)) {
            console.log(`[Watcher] ${name} session activity detected: ${fname}`);
            // Re-scan agents for this workspace
            detectAgentsInWorkspace().catch(() => {});
            break;
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[Watcher] Filesystem watching not supported or failed:`, err);
  }
}
