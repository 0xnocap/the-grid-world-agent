import React, { useMemo } from 'react';
import { useWorkspaceStore } from '../../store';
import { AGENT_TYPE_COLORS } from '../../constants';

const MINIMAP_SIZE = 200;
const PADDING = 20;

const Minimap: React.FC = () => {
  const agents = useWorkspaceStore((s) => s.agents);
  const zones = useWorkspaceStore((s) => s.zones);
  const showMinimap = useWorkspaceStore((s) => s.showMinimap);

  // Calculate bounds and scale for all entities
  const { scale, offsetX, offsetZ } = useMemo(() => {
    const allX: number[] = [];
    const allZ: number[] = [];

    for (const a of agents) {
      allX.push(a.position.x);
      allZ.push(a.position.z);
    }
    for (const z of zones) {
      allX.push(z.position.x);
      allZ.push(z.position.z);
    }

    if (allX.length === 0) {
      return { scale: 1, offsetX: 0, offsetZ: 0 };
    }

    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minZ = Math.min(...allZ);
    const maxZ = Math.max(...allZ);

    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;
    const maxRange = Math.max(rangeX, rangeZ);
    const s = (MINIMAP_SIZE - PADDING * 2) / maxRange;

    return {
      scale: s,
      offsetX: -(minX + maxX) / 2,
      offsetZ: -(minZ + maxZ) / 2,
    };
  }, [agents, zones]);

  if (!showMinimap) return null;

  const toMinimapX = (worldX: number) => MINIMAP_SIZE / 2 + (worldX + offsetX) * scale;
  const toMinimapY = (worldZ: number) => MINIMAP_SIZE / 2 + (worldZ + offsetZ) * scale;

  return (
    <div
      className="fixed bottom-4 left-4 z-40 pointer-events-auto"
      style={{
        width: MINIMAP_SIZE,
        height: MINIMAP_SIZE,
        backgroundColor: 'rgba(15, 18, 25, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        backdropFilter: 'blur(8px)',
        overflow: 'hidden',
      }}
    >
      <svg width={MINIMAP_SIZE} height={MINIMAP_SIZE}>
        {/* Zone diamonds */}
        {zones.map((zone) => {
          const cx = toMinimapX(zone.position.x);
          const cy = toMinimapY(zone.position.z);
          const size = 6;
          return (
            <polygon
              key={zone.id}
              points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
              fill={zone.color}
              opacity={0.6}
            />
          );
        })}

        {/* Agent dots */}
        {agents.map((agent) => {
          const cx = toMinimapX(agent.position.x);
          const cy = toMinimapY(agent.position.z);
          const color = AGENT_TYPE_COLORS[agent.type] || agent.color;
          return (
            <circle
              key={agent.id}
              cx={cx}
              cy={cy}
              r={3}
              fill={color}
              opacity={0.9}
            />
          );
        })}
      </svg>
    </div>
  );
};

export default Minimap;
