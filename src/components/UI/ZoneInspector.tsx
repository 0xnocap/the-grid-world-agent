import React from 'react';
import { useWorkspaceStore } from '../../store';
import { AGENT_TYPE_COLORS } from '../../constants';

const ZoneInspector: React.FC = () => {
  const inspectorPanel = useWorkspaceStore((s) => s.inspectorPanel);
  const inspectorTargetId = useWorkspaceStore((s) => s.inspectorTargetId);
  const zones = useWorkspaceStore((s) => s.zones);
  const agents = useWorkspaceStore((s) => s.agents);
  const closeInspector = useWorkspaceStore((s) => s.closeInspector);
  const openInspector = useWorkspaceStore((s) => s.openInspector);

  if (inspectorPanel !== 'zone' || !inspectorTargetId) return null;

  const zone = zones.find((z) => z.id === inspectorTargetId);
  if (!zone) return null;

  const activeAgents = agents.filter((a) => zone.activeAgents.includes(a.id));

  const statusLabel: Record<string, string> = {
    idle: 'Idle',
    active: 'Active',
    error: 'Error',
  };

  const statusDotColor: Record<string, string> = {
    idle: '#F59E0B',
    active: '#22C55E',
    error: '#EF4444',
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
              className="w-4 h-4 rounded-sm"
              style={{ backgroundColor: zone.color }}
            />
            <h3 className="text-sm font-semibold text-white">{zone.name}</h3>
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

        {/* Status */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: statusDotColor[zone.status] || '#6B7280' }}
          />
          <span className="text-[10px] font-medium text-slate-400 uppercase">
            {statusLabel[zone.status] || zone.status}
          </span>
        </div>

        <div className="space-y-2 text-xs">
          {/* Path */}
          <div>
            <span className="text-slate-500">Path</span>
            <p className="text-slate-300 mt-0.5 font-mono text-[10px] break-all">{zone.path}</p>
          </div>

          {/* Size */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Size</span>
            <span className="text-slate-400 capitalize">{zone.size}</span>
          </div>

          {/* Color */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Color</span>
            <div className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: zone.color }}
              />
              <span className="text-slate-400 font-mono text-[10px]">{zone.color}</span>
            </div>
          </div>

          {/* Language & Framework */}
          <div className="flex items-center gap-1.5">
            {zone.language && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 font-medium">
                {zone.language}
              </span>
            )}
            {zone.framework && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-medium">
                {zone.framework}
              </span>
            )}
          </div>

          {/* File Count */}
          {zone.fileCount != null && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Files</span>
              <span className="text-slate-400">{zone.fileCount}</span>
            </div>
          )}

          {/* Active Agents */}
          <div className="border-t border-white/5 pt-2 mt-2">
            <span className="text-slate-500 text-[10px]">
              Active Agents ({activeAgents.length})
            </span>
            {activeAgents.length > 0 ? (
              <div className="mt-1.5 space-y-1">
                {activeAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => openInspector('agent', agent.id)}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors text-left"
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: AGENT_TYPE_COLORS[agent.type] || agent.color }}
                    />
                    <span className="text-slate-300 text-[10px] truncate">{agent.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 text-[10px] mt-1">No agents in this zone</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZoneInspector;
