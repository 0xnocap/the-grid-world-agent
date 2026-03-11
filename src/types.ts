import { ThreeElements } from '@react-three/fiber';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export type AgentType = 'claude-code' | 'cursor' | 'aider' | 'codex' | 'custom';
export type AgentStatus = 'idle' | 'working' | 'error' | 'spawning' | 'done';
export type WorkMode = 'manual' | 'auto';

export interface WorkspaceAgent {
  id: string;
  name: string;
  type: AgentType;
  color: string;
  size: number;
  position: Vector3;
  targetPosition: Vector3;
  status: AgentStatus;
  currentTask?: string;
  currentFile?: string;
  currentZoneId?: string;
  subAgentOf?: string;
  progress?: number;
  errorMessage?: string;
  launchCommand?: string;
  workMode: WorkMode;
  connectedAt: number;
  lastHeartbeat: number;
  pid?: number;
}

export type ZoneSize = 'small' | 'medium' | 'large';
export type ZoneStatus = 'idle' | 'active' | 'error';

export interface ProjectZone {
  id: string;
  name: string;
  path: string;
  position: Vector3;
  size: ZoneSize;
  color: string;
  activeAgents: string[];
  fileCount?: number;
  language?: string;
  framework?: string;
  status: ZoneStatus;
}

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'error';

export interface WorkspaceTask {
  id: string;
  description: string;
  zoneId: string;
  assignedAgents: string[];
  status: TaskStatus;
  createdAt: number;
  completedAt?: number;
  files: string[];
}

export interface WorkspaceSnapshot {
  agents: WorkspaceAgent[];
  zones: ProjectZone[];
  tasks: WorkspaceTask[];
}

export interface WorkspaceUpdate {
  tick: number;
  updates: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    status?: AgentStatus;
  }>;
}

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
