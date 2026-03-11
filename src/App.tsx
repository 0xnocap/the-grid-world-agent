import React, { useEffect, useState } from 'react';
import WorldScene from './components/World/WorldScene';
import WorkspaceHUD from './components/UI/WorkspaceHUD';
import CommandBar from './components/UI/CommandBar';
import AgentInspector from './components/UI/AgentInspector';
import ZoneInspector from './components/UI/ZoneInspector';
import Minimap from './components/UI/Minimap';
import { socketService } from './services/socketService';
import { useWorkspaceStore } from './store';

const App: React.FC = () => {
  const snapshotLoaded = useWorkspaceStore((s) => s.snapshotLoaded);
  const isDarkMode = useWorkspaceStore((s) => s.isDarkMode);

  const [sceneRendered, setSceneRendered] = useState(false);

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

  return (
    <div className={`w-screen h-screen overflow-hidden relative transition-colors duration-1000 ${isDarkMode ? 'dark' : ''}`}>
      {/* Loading overlay */}
      <div
        className={`fixed inset-0 z-[100] flex flex-col items-center justify-center
          transition-opacity duration-700
          ${snapshotLoaded && sceneRendered ? 'opacity-0 pointer-events-none' : 'opacity-100'}
          ${isDarkMode ? 'bg-[#070B18]' : 'bg-white'}`}
      >
        <div className="flex flex-col items-center gap-6">
          <div className="w-1 h-6 bg-violet-500 rounded-full shadow-lg shadow-violet-500/50" />
          <h1 className={`text-sm font-black uppercase tracking-[0.4em] ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
            OpGrid Workspace
          </h1>
          <div className={`w-5 h-5 border-2 rounded-full animate-spin ${isDarkMode ? 'border-slate-700 border-t-violet-500' : 'border-slate-200 border-t-violet-500'}`} />
          <p className={`text-[10px] font-mono uppercase tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
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
      <Minimap />
    </div>
  );
};

export default App;
