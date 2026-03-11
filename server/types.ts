import { z } from 'zod';

// ==========================================
// Core Geometry
// ==========================================

export const Vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export type Vector3 = z.infer<typeof Vector3Schema>;

// ==========================================
// Agent Types
// ==========================================

export const AGENT_TYPES = ['claude-code', 'cursor', 'aider', 'codex', 'custom'] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const AGENT_STATUSES = ['idle', 'working', 'error', 'spawning', 'done'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const WORK_MODES = ['manual', 'auto'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export interface WorkspaceAgent {
  id: string;
  name: string;
  type: AgentType;
  color: string;
  size: number; // 0.3 to 0.6 (blob radius)
  position: Vector3;
  targetPosition: Vector3;
  status: AgentStatus;
  currentTask?: string;
  currentFile?: string;
  currentZoneId?: string;
  subAgentOf?: string;
  progress?: number; // 0-100
  errorMessage?: string;
  launchCommand?: string;
  workMode: WorkMode;
  connectedAt: number;
  lastHeartbeat: number;
  pid?: number;
}

// ==========================================
// Project Zone Types
// ==========================================

export const ZONE_SIZES = ['small', 'medium', 'large'] as const;
export type ZoneSize = (typeof ZONE_SIZES)[number];

export const ZONE_STATUSES = ['idle', 'active', 'error'] as const;
export type ZoneStatus = (typeof ZONE_STATUSES)[number];

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

// ==========================================
// Task Types
// ==========================================

export const TASK_STATUSES = ['pending', 'in_progress', 'done', 'error'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

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

// ==========================================
// API Schemas
// ==========================================

export const RegisterAgentSchema = z.object({
  name: z.string().min(1).max(32),
  type: z.enum(AGENT_TYPES).default('custom'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  size: z.number().min(0.3).max(0.6).optional(),
  launchCommand: z.string().optional(),
  workMode: z.enum(WORK_MODES).default('auto'),
  pid: z.number().int().optional(),
});

export type RegisterAgentRequest = z.infer<typeof RegisterAgentSchema>;

export const UpdateAgentStatusSchema = z.object({
  status: z.enum(AGENT_STATUSES).optional(),
  currentTask: z.string().max(200).optional(),
  currentFile: z.string().max(500).optional(),
  currentZoneId: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  errorMessage: z.string().max(500).optional(),
});

export type UpdateAgentStatusRequest = z.infer<typeof UpdateAgentStatusSchema>;

export const CreateZoneSchema = z.object({
  name: z.string().min(1).max(64),
  path: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  position: Vector3Schema.optional(),
});

export type CreateZoneRequest = z.infer<typeof CreateZoneSchema>;

export const CreateTaskSchema = z.object({
  description: z.string().min(1).max(500),
  zoneId: z.string(),
  files: z.array(z.string()).default([]),
});

export type CreateTaskRequest = z.infer<typeof CreateTaskSchema>;

export const AssignAgentsSchema = z.object({
  agentIds: z.array(z.string()).min(1),
  zoneId: z.string(),
  taskId: z.string().optional(),
});

export type AssignAgentsRequest = z.infer<typeof AssignAgentsSchema>;

// ==========================================
// Socket Events
// ==========================================

export interface WorkspaceSnapshot {
  agents: WorkspaceAgent[];
  zones: ProjectZone[];
  tasks: WorkspaceTask[];
}

export interface AgentPositionUpdate {
  id: string;
  x: number;
  y: number;
  z: number;
  status?: AgentStatus;
}

export interface WorkspaceUpdate {
  tick: number;
  updates: AgentPositionUpdate[];
}

// ==========================================
// Default Colors by Agent Type
// ==========================================

export const DEFAULT_AGENT_COLORS: Record<AgentType, string> = {
  'claude-code': '#F97316',
  cursor: '#3B82F6',
  aider: '#10B981',
  codex: '#8B5CF6',
  custom: '#94A3B8',
};
