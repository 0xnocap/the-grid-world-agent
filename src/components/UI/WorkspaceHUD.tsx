import React from 'react';
import { useWorkspaceStore } from '../../store';

const WorkspaceHUD: React.FC = () => {
  const agents = useWorkspaceStore((s) => s.agents);
  const zones = useWorkspaceStore((s) => s.zones);
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);
  const cameraMode = useWorkspaceStore((s) => s.cameraMode);
  const setCameraMode = useWorkspaceStore((s) => s.setCameraMode);
  const toggleMinimap = useWorkspaceStore((s) => s.toggleMinimap);
  const showMinimap = useWorkspaceStore((s) => s.showMinimap);

  const idleCount = agents.filter((a) => a.status === 'idle').length;
  const workingCount = agents.filter((a) => a.status === 'working').length;
  const errorCount = agents.filter((a) => a.status === 'error').length;

  const cameraModes: Array<'free' | 'overview' | 'follow'> = ['free', 'overview', 'follow'];
  const cameraModeIndex = cameraModes.indexOf(cameraMode);

  const cycleCameraMode = () => {
    const next = cameraModes[(cameraModeIndex + 1) % cameraModes.length];
    setCameraMode(next);
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-40 pointer-events-none">
      <div
        className="flex items-center justify-between px-4 py-2 pointer-events-auto"
        style={{
          backgroundColor: 'rgba(15, 18, 25, 0.8)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        {/* Left: Branding + workspace path */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-violet-500 rounded-full" />
            <span className="text-xs font-bold text-white tracking-wider uppercase">
              OpGrid
            </span>
          </div>
          {workspacePath && (
            <span className="text-[10px] font-mono text-slate-500 max-w-[300px] truncate" title={workspacePath}>
              {workspacePath}
            </span>
          )}
        </div>

        {/* Center: Status badges */}
        <div className="flex items-center gap-2">
          {workingCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {workingCount} working
            </span>
          )}
          {idleCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {idleCount} idle
            </span>
          )}
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {errorCount} error
            </span>
          )}
          {agents.length === 0 && (
            <span className="text-[10px] text-slate-500">No agents connected</span>
          )}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* Zone count */}
          <span className="text-[10px] text-slate-500 mr-1">
            {zones.length} zone{zones.length !== 1 ? 's' : ''}
          </span>

          {/* Minimap toggle */}
          <button
            onClick={toggleMinimap}
            className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
              showMinimap
                ? 'bg-white/10 text-white'
                : 'bg-white/5 text-slate-500 hover:text-white'
            }`}
          >
            Map
          </button>

          {/* Camera mode cycle */}
          <button
            onClick={cycleCameraMode}
            className="text-[10px] px-2 py-1 rounded-md bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors capitalize"
          >
            {cameraMode}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceHUD;
