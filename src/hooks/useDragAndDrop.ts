import { useState, useCallback } from 'react';

interface DragItem {
  id: string | number;
  stage: string;
}

export function useDragAndDrop(onMove: (itemId: string | number, fromStage: string, toStage: string) => void) {
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(item));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragOverStage(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverStage(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    
    if (!draggedItem) return;
    
    if (draggedItem.stage !== toStage) {
      onMove(draggedItem.id, draggedItem.stage, toStage);
    }
    
    setDraggedItem(null);
  }, [draggedItem, onMove]);

  return {
    draggedItem,
    dragOverStage,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}