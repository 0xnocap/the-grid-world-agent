import React, { useMemo, useCallback } from 'react';
import { useWorkspaceStore } from '../../store';
import { AGENT_TYPE_COLORS } from '../../constants';

const MINIMAP_SIZE = 200;
const PADDING = 20;

const Minimap: React.FC = () => {
  const agents = useWorkspaceStore((s) => s.agents);
  const zones = useWorkspaceStore((s) => s.zones);
  const showMinimap = useWorkspaceStore((s) => s.showMinimap);
  const setCameraTarget = useWorkspaceStore((s) => s.setCameraTarget);
  const isDarkMode = useWorkspaceStore((s) => s.isDarkMode);

  // Calculate bounds and scale for all entities
  const { scale, offsetX, offsetZ, centerX, centerZ } = useMemo(() => {
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
      return { scale: 1, offsetX: 0, offsetZ: 0, centerX: 0, centerZ: 0 };
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
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
    };
  }, [agents, zones]);

  // Convert minimap click to world coordinates and move camera there
  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Reverse the toMinimapX/Y formulas
      const worldX = (clickX - MINIMAP_SIZE / 2) / scale - offsetX;
      const worldZ = (clickY - MINIMAP_SIZE / 2) / scale - offsetZ;

      setCameraTarget({ x: worldX, z: worldZ });
    },
    [scale, offsetX, offsetZ, setCameraTarget]
  );

  if (!showMinimap) return null;

  const toMinimapX = (worldX: number) => MINIMAP_SIZE / 2 + (worldX + offsetX) * scale;
  const toMinimapY = (worldZ: number) => MINIMAP_SIZE / 2 + (worldZ + offsetZ) * scale;

  return (
    <div
      className="fixed bottom-4 left-4 z-40 pointer-events-auto"
      style={{
        width: MINIMAP_SIZE,
        height: MINIMAP_SIZE,
        backgroundColor: isDarkMode ? 'rgba(24, 29, 47, 0.75)' : 'rgba(255, 255, 255, 0.75)',
        border: isDarkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
        borderRadius: '8px',
        backdropFilter: 'blur(8px)',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      <svg width={MINIMAP_SIZE} height={MINIMAP_SIZE} onClick={handleClick}>
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
