export const COLORS = {
  // Dark Mode (default for workspace)
  GROUND_DARK: '#0F1219',
  GRID_DARK: '#1E2433',
  GRID_SECTION_DARK: '#2A3346',

  // Light Mode
  GROUND: '#E8EBF0',
  GRID: '#C4CAD6',
  GRID_SECTION: '#A8B0C0',

  // Agent Type Colors
  CLAUDE: '#F97316',
  CURSOR: '#3B82F6',
  AIDER: '#10B981',
  CODEX: '#8B5CF6',
  CUSTOM: '#94A3B8',

  // Status Colors
  STATUS_IDLE: '#F59E0B',
  STATUS_WORKING: '#22C55E',
  STATUS_ERROR: '#EF4444',
  STATUS_SPAWNING: '#3B82F6',
  STATUS_DONE: '#6B7280',

  // Zone Colors
  ZONE_DEFAULT: '#6366F1',
  ZONE_ACTIVE: '#8B5CF6',
  ZONE_BORDER: '#4F46E5',
};

export const AGENT_TYPE_COLORS: Record<string, string> = {
  'claude-code': COLORS.CLAUDE,
  cursor: COLORS.CURSOR,
  aider: COLORS.AIDER,
  codex: COLORS.CODEX,
  custom: COLORS.CUSTOM,
};

export const STATUS_COLORS: Record<string, string> = {
  idle: COLORS.STATUS_IDLE,
  working: COLORS.STATUS_WORKING,
  error: COLORS.STATUS_ERROR,
  spawning: COLORS.STATUS_SPAWNING,
  done: COLORS.STATUS_DONE,
};
