import type { Server as SocketServer } from 'socket.io';
import type { WorkspaceAgent, ProjectZone, WorkspaceTask, AgentPositionUpdate, WorkspaceSnapshot, Vector3 } from './types.js';
import { DEFAULT_AGENT_COLORS } from './types.js';
import crypto from 'crypto';

const AGENT_STALE_TIMEOUT_MS = 3 * 60_000; // 3 min no heartbeat = stale
const TICK_INTERVAL_MS = 50; // ~20 Hz

interface QueuedAction {
  agentId: string;
  action: {
    type: string;
    targetPosition?: Vector3;
  };
}

class WorkspaceManager {
  private agents: Map<string, WorkspaceAgent> = new Map();
  private zones: Map<string, ProjectZone> = new Map();
  private tasks: Map<string, WorkspaceTask> = new Map();
  private actionQueue: QueuedAction[] = [];
  private tick_: number = 0;
  private io: SocketServer | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  setSocketServer(io: SocketServer): void {
    this.io = io;
  }

  // ==========================================
  // Agent Lifecycle
  // ==========================================

  registerAgent(opts: {
    name: string;
    type: WorkspaceAgent['type'];
    color?: string;
    size?: number;
    launchCommand?: string;
    workMode?: WorkspaceAgent['workMode'];
    pid?: number;
  }): WorkspaceAgent {
    const id = crypto.randomUUID();
    const now = Date.now();
    const color = opts.color || DEFAULT_AGENT_COLORS[opts.type] || '#94A3B8';

    // Find a spawn position near origin, offset by existing agent count
    const idx = this.agents.size;
    const spawnX = (idx % 5) * 4 - 8;
    const spawnZ = Math.floor(idx / 5) * 4 - 8;

    const agent: WorkspaceAgent = {
      id,
      name: opts.name,
      type: opts.type,
      color,
      size: opts.size ?? 0.4,
      position: { x: spawnX, y: 0, z: spawnZ },
      targetPosition: { x: spawnX, y: 0, z: spawnZ },
      status: 'idle',
      workMode: opts.workMode ?? 'auto',
      launchCommand: opts.launchCommand,
      pid: opts.pid,
      connectedAt: now,
      lastHeartbeat: now,
    };

    this.agents.set(id, agent);
    this.broadcastAgentJoined(agent);
    return agent;
  }

  updateAgentStatus(agentId: string, updates: Partial<WorkspaceAgent>): WorkspaceAgent | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    Object.assign(agent, updates);
    agent.lastHeartbeat = Date.now();

    this.io?.emit('agent:status', {
      id: agent.id,
      status: agent.status,
      currentTask: agent.currentTask,
      currentFile: agent.currentFile,
      currentZoneId: agent.currentZoneId,
      progress: agent.progress,
      errorMessage: agent.errorMessage,
    });

    return agent;
  }

  heartbeatAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    agent.lastHeartbeat = Date.now();
    return true;
  }

  removeAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    // Remove from any zone's activeAgents
    for (const zone of this.zones.values()) {
      zone.activeAgents = zone.activeAgents.filter((id) => id !== agentId);
    }

    // Remove from any task assignments
    for (const task of this.tasks.values()) {
      task.assignedAgents = task.assignedAgents.filter((id) => id !== agentId);
    }

    this.agents.delete(agentId);
    this.io?.emit('agent:left', { id: agentId });
    return true;
  }

  getAgent(id: string): WorkspaceAgent | undefined {
    return this.agents.get(id);
  }

  getAgents(): WorkspaceAgent[] {
    return Array.from(this.agents.values());
  }

  // ==========================================
  // Zone Management
  // ==========================================

  addZone(opts: {
    name: string;
    path: string;
    color?: string;
    position?: Vector3;
    fileCount?: number;
    language?: string;
    framework?: string;
  }): ProjectZone {
    const id = crypto.randomUUID();
    const existingCount = this.zones.size;

    // Auto-layout: arrange zones in a grid pattern with spacing
    const spacing = 30;
    const cols = 4;
    const col = existingCount % cols;
    const row = Math.floor(existingCount / cols);
    const defaultPos = opts.position || {
      x: col * spacing - ((cols - 1) * spacing) / 2,
      y: 0,
      z: row * spacing + 20, // offset from origin
    };

    const fileCount = opts.fileCount ?? 0;
    const size = fileCount > 500 ? 'large' : fileCount > 100 ? 'medium' : 'small';

    const zone: ProjectZone = {
      id,
      name: opts.name,
      path: opts.path,
      position: defaultPos,
      size,
      color: opts.color || '#6366F1',
      activeAgents: [],
      fileCount: opts.fileCount,
      language: opts.language,
      framework: opts.framework,
      status: 'idle',
    };

    this.zones.set(id, zone);
    this.io?.emit('zone:updated', zone);
    return zone;
  }

  updateZone(zoneId: string, updates: Partial<ProjectZone>): ProjectZone | null {
    const zone = this.zones.get(zoneId);
    if (!zone) return null;
    Object.assign(zone, updates);
    this.io?.emit('zone:updated', zone);
    return zone;
  }

  removeZone(zoneId: string): boolean {
    if (!this.zones.delete(zoneId)) return false;
    this.io?.emit('zone:removed', { id: zoneId });
    return true;
  }

  getZone(id: string): ProjectZone | undefined {
    return this.zones.get(id);
  }

  getZones(): ProjectZone[] {
    return Array.from(this.zones.values());
  }

  // ==========================================
  // Task Management
  // ==========================================

  createTask(opts: { description: string; zoneId: string; files?: string[] }): WorkspaceTask {
    const id = crypto.randomUUID();
    const task: WorkspaceTask = {
      id,
      description: opts.description,
      zoneId: opts.zoneId,
      assignedAgents: [],
      status: 'pending',
      createdAt: Date.now(),
      files: opts.files || [],
    };
    this.tasks.set(id, task);
    return task;
  }

  getTask(id: string): WorkspaceTask | undefined {
    return this.tasks.get(id);
  }

  getTasks(): WorkspaceTask[] {
    return Array.from(this.tasks.values());
  }

  // ==========================================
  // Agent Commands
  // ==========================================

  assignAgentsToZone(agentIds: string[], zoneId: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;

    for (const agentId of agentIds) {
      const agent = this.agents.get(agentId);
      if (!agent) continue;

      // Update agent target to zone position
      agent.targetPosition = { ...zone.position };
      agent.currentZoneId = zoneId;

      // Add to zone's active agents if not already there
      if (!zone.activeAgents.includes(agentId)) {
        zone.activeAgents.push(agentId);
      }
    }

    // Update zone status
    zone.status = zone.activeAgents.length > 0 ? 'active' : 'idle';
    this.io?.emit('zone:updated', zone);
  }

  queueAction(agentId: string, action: QueuedAction['action']): void {
    this.actionQueue.push({ agentId, action });
  }

  // ==========================================
  // Tick Loop
  // ==========================================

  start(): void {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => this.runTick(), TICK_INTERVAL_MS);
    console.log('[Workspace] Tick loop started (~20 Hz)');
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  getCurrentTick(): number {
    return this.tick_;
  }

  private runTick(): void {
    this.tick_++;

    // Process action queue
    const updates: AgentPositionUpdate[] = [];
    while (this.actionQueue.length > 0) {
      const { agentId, action } = this.actionQueue.shift()!;
      const agent = this.agents.get(agentId);
      if (!agent) continue;

      if (action.type === 'MOVE' && action.targetPosition) {
        agent.targetPosition = action.targetPosition;
        agent.position = action.targetPosition; // Server canonical position
        updates.push({
          id: agentId,
          x: agent.position.x,
          y: agent.position.y,
          z: agent.position.z,
          status: agent.status,
        });
      }
    }

    // Clean up stale agents
    const now = Date.now();
    for (const [agentId, agent] of this.agents) {
      if (now - agent.lastHeartbeat > AGENT_STALE_TIMEOUT_MS) {
        console.log(`[Workspace] Removing stale agent: ${agent.name} (${agentId})`);
        this.removeAgent(agentId);
      }
    }

    // Broadcast updates
    if (updates.length > 0 && this.io) {
      this.io.emit('workspace:update', { tick: this.tick_, updates });
    }
  }

  // ==========================================
  // Snapshots
  // ==========================================

  getSnapshot(): WorkspaceSnapshot {
    return {
      agents: this.getAgents(),
      zones: this.getZones(),
      tasks: this.getTasks(),
    };
  }

  // ==========================================
  // Broadcast Helpers
  // ==========================================

  private broadcastAgentJoined(agent: WorkspaceAgent): void {
    this.io?.emit('agent:joined', agent);
  }
}

// Singleton
let instance: WorkspaceManager | null = null;

export function initWorkspaceManager(): WorkspaceManager {
  instance = new WorkspaceManager();
  return instance;
}

export function getWorkspaceManager(): WorkspaceManager {
  if (!instance) throw new Error('WorkspaceManager not initialized');
  return instance;
}
