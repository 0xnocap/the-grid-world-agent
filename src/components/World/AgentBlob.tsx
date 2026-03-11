/// <reference types="@react-three/fiber" />
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { WorkspaceAgent } from '../../types';
import { STATUS_COLORS } from '../../constants';

interface AgentBlobProps {
  agent: WorkspaceAgent;
  onClick?: (agent: WorkspaceAgent) => void;
}

const AgentBlob: React.FC<AgentBlobProps> = ({ agent, onClick }) => {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const bodyMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const bodyColor = agent.color;
  const statusColor = STATUS_COLORS[agent.status] || STATUS_COLORS.idle;
  const agentSize = agent.size || 0.4;

  const taskPreview = agent.currentTask
    ? agent.currentTask.length > 30
      ? agent.currentTask.slice(0, 30) + '...'
      : agent.currentTask
    : null;

  useFrame((state) => {
    if (!groupRef.current || !meshRef.current) return;

    // Smooth position interpolation
    const targetX = agent.targetPosition.x;
    const targetZ = agent.targetPosition.z;

    groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, 0.15);
    groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, 0.15);

    const dx = targetX - groupRef.current.position.x;
    const dz = targetZ - groupRef.current.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const isMoving = dist > 0.05;

    // Physics-based bobbing
    const bobFreq = isMoving ? 12 : 2.0;
    const bobAmp = isMoving ? 0.06 : 0.01;
    const bob = Math.abs(Math.sin(state.clock.elapsedTime * bobFreq)) * bobAmp;

    const baseY = agent.position?.y ?? 0;
    meshRef.current.position.y = baseY + agentSize + bob;

    // Squash & Stretch
    const stretch = 1 + (isMoving ? bob * 1.5 : bob * 0.5);
    meshRef.current.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));

    // Rotation into movement
    if (isMoving) {
      meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, -dx * 0.5, 0.2);
      meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, dz * 0.5, 0.2);
    } else {
      meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, 0, 0.1);
      meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, 0.1);
    }

    // Glow ring pulse
    if (glowRef.current) {
      const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.15;
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = pulse;
    }

    // Error pulse: body material pulses red
    if (bodyMatRef.current) {
      if (agent.status === 'error') {
        const errorPulse = 0.5 + Math.sin(state.clock.elapsedTime * 6) * 0.5;
        const baseCol = new THREE.Color(bodyColor);
        const errorCol = new THREE.Color('#EF4444');
        bodyMatRef.current.color.copy(baseCol).lerp(errorCol, errorPulse);
      } else {
        bodyMatRef.current.color.set(bodyColor);
      }
    }
  });

  return (
    <group
      ref={groupRef}
      position={[agent.position.x, 0, agent.position.z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(agent);
      }}
    >
      {/* Status glow ring at feet */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} renderOrder={1}>
        <torusGeometry args={[agentSize * 1.25, 0.04, 16, 48]} />
        <meshBasicMaterial
          color={statusColor}
          transparent
          opacity={0.7}
          depthWrite={false}
        />
      </mesh>

      {/* Soft glow spill under agent */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} renderOrder={0}>
        <circleGeometry args={[agentSize * 1.4, 32]} />
        <meshBasicMaterial
          color={statusColor}
          transparent
          opacity={0.15}
          depthWrite={false}
        />
      </mesh>

      {/* Body sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[agentSize, 32, 32]} />
        <meshBasicMaterial ref={bodyMatRef} color={bodyColor} />

        {/* Eyes */}
        <group position={[0, agentSize * 0.125, agentSize * 0.875]}>
          <Sphere args={[agentSize * 0.1125, 16, 16]} position={[-agentSize * 0.375, 0, 0]}>
            <meshBasicMaterial color="#0a0a0a" />
          </Sphere>
          <Sphere args={[agentSize * 0.1125, 16, 16]} position={[agentSize * 0.375, 0, 0]}>
            <meshBasicMaterial color="#0a0a0a" />
          </Sphere>
        </group>
      </mesh>

      {/* Name label */}
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Text
          position={[0, agentSize * 2 + 0.55, 0]}
          fontSize={0.28}
          color="#cbd5e1"
          anchorX="center"
          anchorY="middle"
          renderOrder={100}
          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
        >
          {agent.name}
        </Text>

        {/* Task preview text */}
        {taskPreview && (
          <Text
            position={[0, agentSize * 2 + 0.2, 0]}
            fontSize={0.16}
            color="#94a3b8"
            anchorX="center"
            anchorY="middle"
            renderOrder={100}
            maxWidth={4}
            font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
          >
            {taskPreview}
          </Text>
        )}
      </Billboard>
    </group>
  );
};

export default AgentBlob;
