import { create } from 'zustand';
import type { WorkspaceAgent, ProjectZone, WorkspaceTask } from './types';

interface WorkspaceStore {
  agents: WorkspaceAgent[];
  setAgents: (agents: WorkspaceAgent[]) => void;
  addAgent: (agent: WorkspaceAgent) => void;
  removeAgent: (id: string) => void;
  updateAgent: (id: string, updates: Partial<WorkspaceAgent>) => void;
  batchUpdateAgents: (updates: Array<{ id: string; changes: Partial<WorkspaceAgent> }>) => void;

  zones: ProjectZone[];
  setZones: (zones: ProjectZone[]) => void;
  updateZone: (zone: ProjectZone) => void;
  removeZone: (id: string) => void;

  tasks: WorkspaceTask[];
  setTasks: (tasks: WorkspaceTask[]) => void;

  selectedAgentIds: string[];
  setSelectedAgentIds: (ids: string[]) => void;
  toggleAgentSelection: (id: string) => void;
  clearSelection: () => void;
  selectionBox: { startX: number; startY: number; endX: number; endY: number } | null;
  setSelectionBox: (box: WorkspaceStore['selectionBox']) => void;

  hoveredAgentId: string | null;
  setHoveredAgentId: (id: string | null) => void;
  hoveredZoneId: string | null;
  setHoveredZoneId: (id: string | null) => void;

  cameraMode: 'free' | 'follow' | 'overview';
  setCameraMode: (mode: WorkspaceStore['cameraMode']) => void;
  followAgentId: string | null;
  setFollowAgentId: (id: string | null) => void;

  inspectorPanel: 'agent' | 'zone' | 'task' | null;
  inspectorTargetId: string | null;
  openInspector: (panel: 'agent' | 'zone' | 'task', targetId: string) => void;
  closeInspector: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  showMinimap: boolean;
  toggleMinimap: () => void;
  showCommandBar: boolean;
  toggleCommandBar: () => void;

  cameraTarget: { x: number; z: number } | null;
  setCameraTarget: (target: { x: number; z: number } | null) => void;
  workspacePath: string | null;
  setWorkspacePath: (path: string) => void;

  snapshotLoaded: boolean;
  setSnapshotLoaded: (loaded: boolean) => void;
  reset: () => void;
}

const initialState = {
  agents: [] as WorkspaceAgent[],
  zones: [] as ProjectZone[],
  tasks: [] as WorkspaceTask[],
  selectedAgentIds: [] as string[],
  selectionBox: null as WorkspaceStore['selectionBox'],
  hoveredAgentId: null as string | null,
  hoveredZoneId: null as string | null,
  cameraMode: 'free' as const,
  followAgentId: null as string | null,
  inspectorPanel: null as WorkspaceStore['inspectorPanel'],
  inspectorTargetId: null as string | null,
  isDarkMode: typeof window !== 'undefined'
    ? (localStorage.getItem('theme') ?? 'dark') === 'dark'
    : true,
  showMinimap: true,
  showCommandBar: true,
  cameraTarget: null as { x: number; z: number } | null,
  workspacePath: null as string | null,
  snapshotLoaded: false,
};

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  ...initialState,

  setAgents: (agents) => set({ agents }),
  addAgent: (agent) =>
    set((s) => ({
      agents: s.agents.some((a) => a.id === agent.id) ? s.agents : [...s.agents, agent],
    })),
  removeAgent: (id) =>
    set((s) => ({
      agents: s.agents.filter((a) => a.id !== id),
      selectedAgentIds: s.selectedAgentIds.filter((sid) => sid !== id),
    })),
  updateAgent: (id, updates) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),
  batchUpdateAgents: (updates) =>
    set((s) => {
      const map = new Map(updates.map((u) => [u.id, u.changes]));
      return { agents: s.agents.map((a) => { const c = map.get(a.id); return c ? { ...a, ...c } : a; }) };
    }),

  setZones: (zones) => set({ zones }),
  updateZone: (zone) => set((s) => ({ zones: s.zones.map((z) => (z.id === zone.id ? zone : z)) })),
  removeZone: (id) => set((s) => ({ zones: s.zones.filter((z) => z.id !== id) })),

  setTasks: (tasks) => set({ tasks }),

  setSelectedAgentIds: (ids) => set({ selectedAgentIds: ids }),
  toggleAgentSelection: (id) =>
    set((s) => ({
      selectedAgentIds: s.selectedAgentIds.includes(id)
        ? s.selectedAgentIds.filter((sid) => sid !== id)
        : [...s.selectedAgentIds, id],
    })),
  clearSelection: () => set({ selectedAgentIds: [] }),
  setSelectionBox: (box) => set({ selectionBox: box }),

  setHoveredAgentId: (id) => set({ hoveredAgentId: id }),
  setHoveredZoneId: (id) => set({ hoveredZoneId: id }),

  setCameraMode: (mode) => set({ cameraMode: mode }),
  setFollowAgentId: (id) => set({ followAgentId: id }),

  openInspector: (panel, targetId) => set({ inspectorPanel: panel, inspectorTargetId: targetId }),
  closeInspector: () => set({ inspectorPanel: null, inspectorTargetId: null }),
  toggleDarkMode: () =>
    set((s) => {
      const next = !s.isDarkMode;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return { isDarkMode: next };
    }),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  toggleCommandBar: () => set((s) => ({ showCommandBar: !s.showCommandBar })),

  setCameraTarget: (target) => set({ cameraTarget: target }),
  setWorkspacePath: (path) => set({ workspacePath: path }),
  setSnapshotLoaded: (loaded) => set({ snapshotLoaded: loaded }),
  reset: () => set(initialState),
}));
