/// <reference types="@react-three/fiber" />
import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import InfiniteGrid from './InfiniteGrid';
import AgentBlob from './AgentBlob';
import ProjectZone from './ProjectZone';
import TerminalScreen from './TerminalScreen';
import ConnectionLines from './ConnectionLines';
import { useWorkspaceStore } from '../../store';
import { COLORS } from '../../constants';
import type { WorkspaceAgent, ProjectZone as ProjectZoneType } from '../../types';
import { socketService } from '../../services/socketService';

// ---- Camera Controls ----
const CameraControls: React.FC = () => {
  const controlsRef = useRef<any>(null);
  const cameraMode = useWorkspaceStore((s) => s.cameraMode);
  const followAgentId = useWorkspaceStore((s) => s.followAgentId);
  const agents = useWorkspaceStore((s) => s.agents);

  const keysPressed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        keysPressed.current.add(e.key);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useFrame(({ camera }, delta) => {
    if (!controlsRef.current) return;

    if (cameraMode === 'follow' && followAgentId) {
      const agent = agents.find((a) => a.id === followAgentId);
      if (agent) {
        const targetVec = new THREE.Vector3(agent.targetPosition.x, 0, agent.targetPosition.z);
        controlsRef.current.target.lerp(targetVec, 0.25);
        controlsRef.current.update();
      }
    }

    if (cameraMode === 'overview') {
      const overviewPos = new THREE.Vector3(0, 150, 0);
      camera.position.lerp(overviewPos, 0.05);
      controlsRef.current.target.lerp(new THREE.Vector3(0, 0, 0), 0.05);
      controlsRef.current.update();
    }

    // Free mode: arrow keys pan camera
    if (cameraMode === 'free' && keysPressed.current.size > 0) {
      const dist = camera.position.distanceTo(controlsRef.current.target);
      const speed = dist * 0.8;
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      const move = new THREE.Vector3();
      if (keysPressed.current.has('ArrowUp')) move.addScaledVector(forward, 1.4);
      if (keysPressed.current.has('ArrowDown')) move.addScaledVector(forward, -1.4);
      if (keysPressed.current.has('ArrowRight')) move.add(right);
      if (keysPressed.current.has('ArrowLeft')) move.sub(right);

      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * delta);
        camera.position.add(move);
        controlsRef.current.target.add(move);
        controlsRef.current.update();
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      rotateSpeed={1.0}
      panSpeed={1.0}
      maxPolarAngle={Math.PI / 2.6}
      minDistance={10}
      maxDistance={1200}
      enablePan={cameraMode === 'free'}
      screenSpacePanning={false}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  );
};

// ---- First Frame Signal ----
function FirstFrameSignal({ onFirstFrame }: { onFirstFrame?: () => void }) {
  const firedRef = useRef(false);
  useFrame(() => {
    if (!onFirstFrame || firedRef.current) return;
    firedRef.current = true;
    onFirstFrame();
  });
  return null;
}

// ---- Main Scene ----
interface WorldSceneProps {
  onFirstFrameRendered?: () => void;
}

const WorldScene: React.FC<WorldSceneProps> = ({ onFirstFrameRendered }) => {
  const bgColor = COLORS.GROUND_DARK;
  const agents = useWorkspaceStore((s) => s.agents);
  const zones = useWorkspaceStore((s) => s.zones);
  const openInspector = useWorkspaceStore((s) => s.openInspector);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);
  const selectedAgentIds = useWorkspaceStore((s) => s.selectedAgentIds);

  const handleAgentClick = (agent: WorkspaceAgent) => {
    openInspector('agent', agent.id);
  };

  const handleZoneClick = (zone: ProjectZoneType) => {
    openInspector('zone', zone.id);
  };

  const handleZoneContextMenu = (zone: ProjectZoneType) => {
    // Assign selected agents to this zone
    if (selectedAgentIds.length > 0) {
      socketService.assignAgents(selectedAgentIds, zone.id);
    }
  };

  const handleGroundClick = () => {
    clearSelection();
    useWorkspaceStore.getState().closeInspector();
  };

  return (
    <div className="w-full h-full cursor-crosshair">
      <Canvas
        shadows
        camera={{ position: [60, 60, 60], fov: 20, near: 5, far: 3000 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
      >
        <color attach="background" args={[bgColor]} />
        <FirstFrameSignal onFirstFrame={onFirstFrameRendered} />

        {/* Even, flat lighting */}
        <ambientLight intensity={0.8} color="#ffffff" />

        <CameraControls />

        <Suspense fallback={null}>
          {/* Ground plane for click events */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.02, 0]}
            onClick={(e) => {
              e.stopPropagation();
              handleGroundClick();
            }}
          >
            <planeGeometry args={[4000, 4000]} />
            <meshBasicMaterial color={bgColor} />
          </mesh>

          <InfiniteGrid isDarkMode />

          {/* Project Zones */}
          {zones.map((zone) => (
            <ProjectZone
              key={zone.id}
              zone={zone}
              onClick={handleZoneClick}
              onContextMenu={handleZoneContextMenu}
            />
          ))}

          {/* Connection Lines */}
          <ConnectionLines />

          {/* Agents */}
          {agents.map((agent) => (
            <AgentBlob
              key={agent.id}
              agent={agent}
              onClick={handleAgentClick}
            />
          ))}

          {/* Terminal Screens for working agents */}
          {agents
            .filter((a) => a.status === 'working')
            .map((agent) => (
              <TerminalScreen key={`term-${agent.id}`} agent={agent} />
            ))}
        </Suspense>
      </Canvas>
    </div>
  );
};

export default React.memo(WorldScene);
