import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Pencil, Trash2, Check, X, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface Status {
  id: string;
  label: string;
}

interface StatusManagerProps {
  title: string;
  description: string;
  statuses: Status[];
  onUpdate: (statuses: Status[], changeInfo?: { oldValue: string; newValue: string; id: string }) => void;
  allowAdd?: boolean;
}

export function StatusManager({ title, description, statuses, onUpdate, allowAdd = true }: StatusManagerProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [originalValue, setOriginalValue] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [newItemValue, setNewItemValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleStartEdit = (status: Status) => {
    setEditingId(status.id);
    setEditValue(status.label);
    setOriginalValue(status.label);
  };

  const handleSaveEdit = (id: string) => {
    if (!editValue.trim()) return;
    
    const updatedStatuses = statuses.map(s => 
      s.id === id ? { ...s, label: editValue } : s
    );
    
    // Pass both old and new value for database updates
    onUpdate(updatedStatuses, originalValue !== editValue ? { oldValue: originalValue, newValue: editValue, id } : undefined);
    setEditingId(null);
    setEditValue("");
    setOriginalValue("");
    
    toast({
      title: t("status.updated"),
      description: t("status.updatedDesc"),
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const handleDelete = (id: string) => {
    const updatedStatuses = statuses.filter(s => s.id !== id);
    onUpdate(updatedStatuses);
    
    toast({
      title: t("status.deleted"),
      description: t("status.deletedDesc"),
    });
  };

  const handleAddNew = () => {
    if (!newItemValue.trim()) return;
    
    // Generate ID from label (snake_case)
    const newId = newItemValue.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    
    // Check if ID already exists
    if (statuses.some(s => s.id === newId)) {
      toast({
        title: t("toast.error"),
        description: t("status.alreadyExists") || "Eintrag existiert bereits",
        variant: "destructive",
      });
      return;
    }
    
    const newStatus: Status = {
      id: newId,
      label: newItemValue.trim()
    };
    
    const updatedStatuses = [...statuses, newStatus];
    onUpdate(updatedStatuses);
    setNewItemValue("");
    setIsAdding(false);
    
    toast({
      title: t("status.added") || "Hinzugefügt",
      description: t("status.addedDesc") || "Neuer Eintrag wurde hinzugefügt",
    });
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === index) return;

    const newStatuses = [...statuses];
    const draggedItem = newStatuses[draggedIndex];
    
    newStatuses.splice(draggedIndex, 1);
    newStatuses.splice(index, 0, draggedItem);
    
    onUpdate(newStatuses);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {statuses.map((status, index) => (
            <div
              key={status.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-2 p-2 rounded-lg border bg-card ${
                draggedIndex === index ? 'opacity-50' : ''
              } hover:bg-muted/50 transition-colors cursor-move`}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              
              {editingId === status.id ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(status.id);
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleSaveEdit(status.id)}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleCancelEdit}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Badge variant="secondary" className="flex-1">
                    {status.label}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleStartEdit(status)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(status.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          ))}
          
          {/* Add new item */}
          {allowAdd && (
            isAdding ? (
              <div className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                <Input
                  value={newItemValue}
                  onChange={(e) => setNewItemValue(e.target.value)}
                  placeholder={t("status.newEntryPlaceholder") || "Neuen Eintrag eingeben..."}
                  className="flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddNew();
                    if (e.key === 'Escape') {
                      setIsAdding(false);
                      setNewItemValue("");
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleAddNew}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setIsAdding(false);
                    setNewItemValue("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={() => setIsAdding(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("common.add") || "Hinzufügen"}
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
