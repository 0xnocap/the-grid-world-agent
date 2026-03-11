import React, { useEffect, useRef, useCallback, useState } from 'react';
import WorldScene from './components/World/WorldScene';
import WorkspaceHUD from './components/UI/WorkspaceHUD';
import CommandBar from './components/UI/CommandBar';
import AgentInspector from './components/UI/AgentInspector';
import ZoneInspector from './components/UI/ZoneInspector';
import SelectionBox from './components/UI/SelectionBox';
import Minimap from './components/UI/Minimap';
import { socketService } from './services/socketService';
import { useWorkspaceStore } from './store';

const App: React.FC = () => {
  const snapshotLoaded = useWorkspaceStore((s) => s.snapshotLoaded);
  const setSelectionBox = useWorkspaceStore((s) => s.setSelectionBox);
  const setSelectedAgentIds = useWorkspaceStore((s) => s.setSelectedAgentIds);
  const agents = useWorkspaceStore((s) => s.agents);

  const [sceneRendered, setSceneRendered] = useState(false);
  const isDragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  // Connect socket on mount
  useEffect(() => {
    socketService.connectSpectator();
    return () => {
      socketService.disconnect();
    };
  }, []);

  // Reset scene rendered state when snapshot is not loaded
  useEffect(() => {
    if (!snapshotLoaded) {
      setSceneRendered(false);
    }
  }, [snapshotLoaded]);

  // Drag-select mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only left button, and not when clicking on UI elements
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // Skip if clicking on a UI overlay (anything inside .pointer-events-auto)
      if (target.closest('.pointer-events-auto') && !target.closest('.cursor-crosshair')) return;

      dragStart.current = { x: e.clientX, y: e.clientY };
      isDragging.current = false;
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragStart.current) return;

      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;

      // Threshold to start drag selection (avoid accidental drags)
      if (!isDragging.current && Math.abs(dx) + Math.abs(dy) > 8) {
        isDragging.current = true;
      }

      if (isDragging.current) {
        setSelectionBox({
          startX: dragStart.current.x,
          startY: dragStart.current.y,
          endX: e.clientX,
          endY: e.clientY,
        });
      }
    },
    [setSelectionBox]
  );

  const handleMouseUp = useCallback(
    (_e: React.MouseEvent) => {
      if (isDragging.current) {
        // Selection box was active -- compute selected agents
        const box = useWorkspaceStore.getState().selectionBox;
        if (box) {
          const left = Math.min(box.startX, box.endX);
          const right = Math.max(box.startX, box.endX);
          const top = Math.min(box.startY, box.endY);
          const bottom = Math.max(box.startY, box.endY);

          // For simplicity, use a heuristic: map agent world positions to screen
          // This is a rough 2D selection using the agent positions projected
          // into a simplified screen space. A full solution would use the Three.js
          // camera projection, but that requires access to the camera from the Canvas.
          // Here we do a simple approximate selection.
          const selectedIds: string[] = [];
          const currentAgents = useWorkspaceStore.getState().agents;

          // Approximate screen mapping: we treat the canvas as the full viewport
          // and roughly project based on the initial camera orientation.
          // This is a placeholder that selects agents whose screen-space coordinates
          // fall within the drag box. In production, you would use camera.project().
          for (const agent of currentAgents) {
            // Rough orthographic projection estimate (camera at 60,60,60 looking at origin)
            // This will work reasonably for overview-style cameras
            const screenX = window.innerWidth / 2 + (agent.position.x - agent.position.z) * 4;
            const screenY = window.innerHeight / 2 - (agent.position.y * 8 - (agent.position.x + agent.position.z) * 2);

            if (screenX >= left && screenX <= right && screenY >= top && screenY <= bottom) {
              selectedIds.push(agent.id);
            }
          }

          setSelectedAgentIds(selectedIds);
        }
      }

      isDragging.current = false;
      dragStart.current = null;
      setSelectionBox(null);
    },
    [setSelectedAgentIds, setSelectionBox]
  );

  return (
    <div
      className="w-screen h-screen overflow-hidden relative dark"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Loading overlay */}
      <div
        className={`fixed inset-0 z-[100] flex flex-col items-center justify-center
          transition-opacity duration-700
          ${snapshotLoaded && sceneRendered ? 'opacity-0 pointer-events-none' : 'opacity-100'}
          bg-[#070B18]`}
      >
        <div className="flex flex-col items-center gap-6">
          <div className="w-1 h-6 bg-violet-500 rounded-full shadow-lg shadow-violet-500/50" />
          <h1 className="text-sm font-black uppercase tracking-[0.4em] text-slate-100">
            OpGrid Workspace
          </h1>
          <div className="w-5 h-5 border-2 rounded-full animate-spin border-slate-700 border-t-violet-500" />
          <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
            Connecting to workspace...
          </p>
        </div>
      </div>

      {/* 3D World Scene */}
      <WorldScene onFirstFrameRendered={() => setSceneRendered(true)} />

      {/* UI Overlays */}
      <WorkspaceHUD />
      <CommandBar />
      <AgentInspector />
      <ZoneInspector />
      <SelectionBox />
      <Minimap />
    </div>
  );
};

export default App;
