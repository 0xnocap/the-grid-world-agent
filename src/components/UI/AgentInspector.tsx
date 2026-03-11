import React from 'react';
import { useWorkspaceStore } from '../../store';
import { AGENT_TYPE_COLORS, STATUS_COLORS } from '../../constants';

const AgentInspector: React.FC = () => {
  const inspectorPanel = useWorkspaceStore((s) => s.inspectorPanel);
  const inspectorTargetId = useWorkspaceStore((s) => s.inspectorTargetId);
  const agents = useWorkspaceStore((s) => s.agents);
  const closeInspector = useWorkspaceStore((s) => s.closeInspector);

  if (inspectorPanel !== 'agent' || !inspectorTargetId) return null;

  const agent = agents.find((a) => a.id === inspectorTargetId);
  if (!agent) return null;

  const statusColor = STATUS_COLORS[agent.status] || STATUS_COLORS.idle;
  const typeColor = AGENT_TYPE_COLORS[agent.type] || agent.color;

  const formatTime = (ts: number) => {
    if (!ts) return '--';
    const d = new Date(ts);
    return d.toLocaleTimeString();
  };

  return (
    <div className="fixed top-14 right-4 z-40 w-72 pointer-events-auto">
      <div
        className="rounded-xl p-4 shadow-xl"
        style={{
          backgroundColor: 'rgba(15, 18, 25, 0.9)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: typeColor }}
            />
            <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
          </div>
          <button
            onClick={closeInspector}
            className="text-slate-500 hover:text-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Status & Type */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: statusColor + '20',
              color: statusColor,
            }}
          >
            {agent.status}
          </span>
          <span className="text-[10px] text-slate-400 font-medium uppercase">
            {agent.type}
          </span>
        </div>

        {/* Details */}
        <div className="space-y-2 text-xs">
          {/* Color swatch */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Color</span>
            <div className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: agent.color }}
              />
              <span className="text-slate-400 font-mono text-[10px]">{agent.color}</span>
            </div>
          </div>

          {/* Current Task */}
          {agent.currentTask && (
            <div>
              <span className="text-slate-500">Task</span>
              <p className="text-slate-300 mt-0.5 leading-relaxed">{agent.currentTask}</p>
            </div>
          )}

          {/* Current File */}
          {agent.currentFile && (
            <div>
              <span className="text-slate-500">File</span>
              <p className="text-slate-300 mt-0.5 font-mono text-[10px] break-all">{agent.currentFile}</p>
            </div>
          )}

          {/* Progress */}
          {agent.progress != null && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-500">Progress</span>
                <span className="text-slate-400">{Math.round(agent.progress * 100)}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${agent.progress * 100}%`,
                    backgroundColor: statusColor,
                  }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {agent.errorMessage && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2">
              <span className="text-red-400 text-[10px] font-medium">Error</span>
              <p className="text-red-300 text-[10px] mt-0.5">{agent.errorMessage}</p>
            </div>
          )}

          <div className="border-t border-white/5 pt-2 mt-2 space-y-1.5">
            {/* Work Mode */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Mode</span>
              <span className="text-slate-400 capitalize">{agent.workMode}</span>
            </div>

            {/* Connected At */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Connected</span>
              <span className="text-slate-400">{formatTime(agent.connectedAt)}</span>
            </div>

            {/* Last Heartbeat */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Heartbeat</span>
              <span className="text-slate-400">{formatTime(agent.lastHeartbeat)}</span>
            </div>

            {/* PID */}
            {agent.pid != null && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">PID</span>
                <span className="text-slate-400 font-mono text-[10px]">{agent.pid}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentInspector;
