/// <reference types="@react-three/fiber" />
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { ProjectZone as ProjectZoneType } from '../../types';

interface ProjectZoneProps {
  zone: ProjectZoneType;
  onClick?: (zone: ProjectZoneType) => void;
  onContextMenu?: (zone: ProjectZoneType) => void;
}

const ZONE_SIZES: Record<string, number> = {
  small: 8,
  medium: 12,
  large: 16,
};

const ProjectZone: React.FC<ProjectZoneProps> = ({ zone, onClick, onContextMenu }) => {
  const borderRef = useRef<THREE.Mesh>(null);
  const worldSize = ZONE_SIZES[zone.size] || ZONE_SIZES.medium;

  useFrame((state) => {
    if (borderRef.current && zone.status === 'active') {
      const pulse = 0.4 + Math.sin(state.clock.elapsedTime * 2.5) * 0.25;
      const mat = borderRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = pulse;
    }
  });

  const subtitleParts: string[] = [];
  if (zone.language) subtitleParts.push(zone.language);
  if (zone.framework) subtitleParts.push(zone.framework);
  const subtitle = subtitleParts.join(' / ');

  return (
    <group
      position={[zone.position.x, 0, zone.position.z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(zone);
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
        onContextMenu?.(zone);
      }}
    >
      {/* Diamond platform fill - rotated 45 degrees on Y */}
      <mesh rotation={[-Math.PI / 2, Math.PI / 4, 0]} position={[0, 0.07, 0]}>
        <planeGeometry args={[worldSize, worldSize]} />
        <meshBasicMaterial
          color={zone.color}
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Diamond border edges - slightly raised */}
      <mesh
        ref={borderRef}
        rotation={[-Math.PI / 2, Math.PI / 4, 0]}
        position={[0, 0.08, 0]}
      >
        <ringGeometry args={[worldSize * 0.48, worldSize * 0.5, 4]} />
        <meshBasicMaterial
          color={zone.color}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Raised platform edge - thin box for depth */}
      <mesh rotation={[0, Math.PI / 4, 0]} position={[0, 0.075, 0]}>
        <boxGeometry args={[worldSize * 0.98, 0.15, worldSize * 0.98]} />
        <meshBasicMaterial
          color={zone.color}
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>

      {/* Zone name text */}
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Text
          position={[0, 3.5, 0]}
          fontSize={1.2}
          color="#e2e8f0"
          anchorX="center"
          anchorY="middle"
          renderOrder={100}
          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
        >
          {zone.name}
        </Text>

        {/* Language / Framework subtitle */}
        {subtitle && (
          <Text
            position={[0, 2.4, 0]}
            fontSize={0.7}
            color="#94a3b8"
            anchorX="center"
            anchorY="middle"
            renderOrder={100}
            font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
          >
            {subtitle}
          </Text>
        )}

        {/* File count badge */}
        {zone.fileCount != null && (
          <Text
            position={[0, 1.6, 0]}
            fontSize={0.5}
            color="#64748b"
            anchorX="center"
            anchorY="middle"
            renderOrder={100}
            font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
          >
            {zone.fileCount} files
          </Text>
        )}
      </Billboard>
    </group>
  );
};

export default ProjectZone;
