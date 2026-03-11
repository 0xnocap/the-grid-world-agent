import { watch, readdir, stat, readFile } from 'fs/promises';
import { join, basename } from 'path';
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
      // Future: correlate file changes with active agents
      // For now, just detect new .claude/ directories (Claude Code sessions)
      if (event.filename?.includes('.claude/') && event.eventType === 'rename') {
        console.log(`[Watcher] Claude Code session detected: ${event.filename}`);
      }
    }
  } catch (err) {
    console.warn(`[Watcher] Filesystem watching not supported or failed:`, err);
  }
}
