/// <reference types="@react-three/fiber" />
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { WorkspaceAgent } from '../../types';

interface TerminalScreenProps {
  agent: WorkspaceAgent;
}

const TerminalScreen: React.FC<TerminalScreenProps> = ({ agent }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  // Only render when agent is working
  if (agent.status !== 'working') return null;

  const tint = '#22C55E';

  const fileDisplay = agent.currentFile
    ? agent.currentFile.length > 40
      ? '...' + agent.currentFile.slice(-37)
      : agent.currentFile
    : 'working...';

  useFrame((state) => {
    if (meshRef.current) {
      // Slow bobbing (slower than agent)
      const bob = Math.sin(state.clock.elapsedTime * 1.2) * 0.03;
      meshRef.current.position.y = (agent.position?.y ?? 0) + 1.2 + bob;
    }
    if (matRef.current) {
      // Subtle opacity pulse
      const pulse = 0.12 + Math.sin(state.clock.elapsedTime * 1.5) * 0.03;
      matRef.current.opacity = pulse;
    }
  });

  return (
    <group position={[agent.position.x, 0, agent.position.z - 1.5]}>
      {/* Transparent screen plane */}
      <mesh ref={meshRef} position={[0, 1.2, 0]}>
        <planeGeometry args={[2, 1.5]} />
        <meshBasicMaterial
          ref={matRef}
          color={tint}
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* File header text */}
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Text
          position={[0, 1.5, 0.05]}
          fontSize={0.14}
          color={tint}
          anchorX="center"
          anchorY="middle"
          renderOrder={101}
          maxWidth={2.5}
          font="https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.woff2"
        >
          {fileDisplay}
        </Text>
      </Billboard>
    </group>
  );
};

export default TerminalScreen;
