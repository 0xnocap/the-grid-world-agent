import React from 'react';
import { useWorkspaceStore } from '../../store';

const SelectionBox: React.FC = () => {
  const selectionBox = useWorkspaceStore((s) => s.selectionBox);

  if (!selectionBox) return null;

  const left = Math.min(selectionBox.startX, selectionBox.endX);
  const top = Math.min(selectionBox.startY, selectionBox.endY);
  const width = Math.abs(selectionBox.endX - selectionBox.startX);
  const height = Math.abs(selectionBox.endY - selectionBox.startY);

  return (
    <div
      className="fixed pointer-events-none z-50"
      style={{
        left,
        top,
        width,
        height,
        border: '1px solid rgba(34, 197, 94, 0.5)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderRadius: '2px',
      }}
    />
  );
};

export default SelectionBox;
