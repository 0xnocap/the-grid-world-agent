
/// <reference types="@react-three/fiber" />
import React from 'react';
import { Grid } from '@react-three/drei';
import { COLORS } from '../../constants';
import '../../types';

interface InfiniteGridProps {
  isDarkMode?: boolean;
}

const InfiniteGrid: React.FC<InfiniteGridProps> = ({ isDarkMode }) => {
  const gridColor = isDarkMode ? COLORS.GRID_DARK : COLORS.GRID;

  return (
    <group>
      <Grid
        infiniteGrid
        followCamera

        cellSize={2}
        cellThickness={0.8}
        cellColor={gridColor}

        sectionSize={10}
        sectionThickness={1.2}
        sectionColor={isDarkMode ? COLORS.GRID_SECTION_DARK : COLORS.GRID_SECTION}

        fadeDistance={400}
        fadeStrength={1.5}

        renderOrder={-1}
        position={[0, -0.01, 0]}
      />
    </group>
  );
};

export default InfiniteGrid;
