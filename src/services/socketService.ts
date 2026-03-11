import { io, Socket } from 'socket.io-client';
import { useWorkspaceStore } from '../store';
import type { WorkspaceAgent, ProjectZone, WorkspaceTask, AgentStatus } from '../types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4101';

class SocketService {
  private socket: Socket | null = null;

  connect() {
    if (this.socket?.connected) return;

    this.socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    const store = useWorkspaceStore.getState();

    this.socket.on('connect', () => {
      console.log('[Socket] Connected as spectator');
      this.socket?.emit('spectator:join');

      // Fetch workspace info (path, etc.)
      fetch(`${SERVER_URL}/api/workspace`)
        .then((res) => res.json())
        .then((data: { path: string }) => {
          useWorkspaceStore.getState().setWorkspacePath(data.path);
        })
        .catch(() => { /* non-critical */ });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    // Full snapshot on initial connection
    this.socket.on('workspace:snapshot', (snapshot: {
      agents: WorkspaceAgent[];
      zones: ProjectZone[];
      tasks: WorkspaceTask[];
    }) => {
      const s = useWorkspaceStore.getState();
      s.setAgents(snapshot.agents);
      s.setZones(snapshot.zones);
      s.setTasks(snapshot.tasks);
      s.setSnapshotLoaded(true);
    });

    // Batch position updates (high frequency)
    this.socket.on('workspace:update', (data: {
      tick: number;
      updates: Array<{ id: string; x: number; y: number; z: number; status?: AgentStatus }>;
    }) => {
      const s = useWorkspaceStore.getState();
      s.batchUpdateAgents(
        data.updates.map((u) => ({
          id: u.id,
          changes: {
            position: { x: u.x, y: u.y, z: u.z },
            ...(u.status ? { status: u.status } : {}),
          },
        }))
      );
    });

    // Individual agent events
    this.socket.on('agent:joined', (agent: WorkspaceAgent) => {
      useWorkspaceStore.getState().addAgent(agent);
    });

    this.socket.on('agent:left', (data: { id: string }) => {
      useWorkspaceStore.getState().removeAgent(data.id);
    });

    this.socket.on('agent:status', (data: {
      id: string;
      status?: AgentStatus;
      currentTask?: string;
      currentFile?: string;
      progress?: number;
      errorMessage?: string;
    }) => {
      const { id, ...updates } = data;
      useWorkspaceStore.getState().updateAgent(id, updates);
    });

    // Zone events
    this.socket.on('zone:updated', (zone: ProjectZone) => {
      useWorkspaceStore.getState().updateZone(zone);
    });

    this.socket.on('zone:removed', (data: { id: string }) => {
      useWorkspaceStore.getState().removeZone(data.id);
    });
  }

  connectSpectator() {
    this.connect();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Emit: move an agent to a new position
  moveAgent(agentId: string, x: number, z: number) {
    this.socket?.emit('agent:move', { agentId, x, z });
  }

  // Emit: assign selected agents to a zone
  assignAgents(agentIds: string[], zoneId: string) {
    this.socket?.emit('agent:assign', { agentIds, zoneId });
  }
}

export const socketService = new SocketService();
