import React, { useState } from 'react';
import { useWorkspaceStore } from '../../store';
import { socketService } from '../../services/socketService';
import { AGENT_TYPE_COLORS } from '../../constants';

const CommandBar: React.FC = () => {
  const selectedAgentIds = useWorkspaceStore((s) => s.selectedAgentIds);
  const agents = useWorkspaceStore((s) => s.agents);
  const zones = useWorkspaceStore((s) => s.zones);
  const showCommandBar = useWorkspaceStore((s) => s.showCommandBar);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);

  const [showZoneDropdown, setShowZoneDropdown] = useState(false);

  const isVisible = showCommandBar && selectedAgentIds.length > 0;
  if (!isVisible) return null;

  const selectedAgents = agents.filter((a) => selectedAgentIds.includes(a.id));

  const handleAssignToZone = (zoneId: string) => {
    socketService.assignAgents(selectedAgentIds, zoneId);
    setShowZoneDropdown(false);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
      <div
        className="flex items-center gap-3 px-5 py-3 rounded-xl"
        style={{
          backgroundColor: 'rgba(15, 18, 25, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Agent count badge */}
        <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
          <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
            {selectedAgentIds.length}
          </span>
          selected
        </div>

        {/* Selected agent dots */}
        <div className="flex items-center gap-1.5 border-l border-white/10 pl-3">
          {selectedAgents.slice(0, 6).map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-1"
              title={agent.name}
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: AGENT_TYPE_COLORS[agent.type] || agent.color }}
              />
              <span className="text-[10px] text-slate-400 max-w-[60px] truncate">
                {agent.name}
              </span>
            </div>
          ))}
          {selectedAgents.length > 6 && (
            <span className="text-[10px] text-slate-500">+{selectedAgents.length - 6}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-l border-white/10 pl-3">
          {/* Send to Zone dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowZoneDropdown(!showZoneDropdown)}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              Send to Zone
            </button>
            {showZoneDropdown && (
              <div
                className="absolute bottom-full mb-2 left-0 min-w-[160px] rounded-lg py-1 shadow-xl"
                style={{
                  backgroundColor: 'rgba(15, 18, 25, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                {zones.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-slate-500">No zones</div>
                ) : (
                  zones.map((zone) => (
                    <button
                      key={zone.id}
                      onClick={() => handleAssignToZone(zone.id)}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-slate-300 hover:bg-white/10 flex items-center gap-2"
                    >
                      <div
                        className="w-2 h-2 rounded-sm"
                        style={{ backgroundColor: zone.color }}
                      />
                      {zone.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Deselect All */}
          <button
            onClick={() => clearSelection()}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            Deselect All
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommandBar;
