/// <reference types="@react-three/fiber" />
import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { useWorkspaceStore } from '../../store';
import * as THREE from 'three';

const ConnectionLines: React.FC = () => {
  const agents = useWorkspaceStore((s) => s.agents);
  const zones = useWorkspaceStore((s) => s.zones);

  const lines = useMemo(() => {
    const result: Array<{
      key: string;
      points: [number, number, number][];
      color: string;
      opacity: number;
    }> = [];

    const zoneMap = new Map(zones.map((z) => [z.id, z]));
    const agentMap = new Map(agents.map((a) => [a.id, a]));

    for (const agent of agents) {
      // Agent-to-zone connection line
      if (agent.currentZoneId) {
        const zone = zoneMap.get(agent.currentZoneId);
        if (zone) {
          result.push({
            key: `zone-${agent.id}-${zone.id}`,
            points: [
              [agent.position.x, 0.1, agent.position.z],
              [zone.position.x, 0.1, zone.position.z],
            ],
            color: agent.color,
            opacity: 0.3,
          });
        }
      }

      // Sub-agent-to-parent connection line
      if (agent.subAgentOf) {
        const parent = agentMap.get(agent.subAgentOf);
        if (parent) {
          result.push({
            key: `sub-${agent.id}-${parent.id}`,
            points: [
              [agent.position.x, 0.3, agent.position.z],
              [parent.position.x, 0.3, parent.position.z],
            ],
            color: agent.color,
            opacity: 0.6,
          });
        }
      }
    }

    return result;
  }, [agents, zones]);

  return (
    <group>
      {lines.map((line) => (
        <Line
          key={line.key}
          points={line.points}
          color={line.color}
          lineWidth={1.5}
          transparent
          opacity={line.opacity}
          depthWrite={false}
        />
      ))}
    </group>
  );
};

export default ConnectionLines;
