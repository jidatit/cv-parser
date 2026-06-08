import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, User, Folder, X, Link } from "lucide-react";
import { format } from "date-fns";
import { de, enUS, fr, es, it } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface CandidateOption {
  id: string;
  name: string;
}

interface TaskFolder {
  id: string;
  name: string;
  color: string;
}

interface TaskData {
  id?: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  candidate_id: string | null;
  job_id: string | null;
  deadline: string | null;
  folder_id: string | null;
}

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTitle?: string;
  candidateId?: string;
  jobId?: string;
  onTaskCreated?: () => void;
  editTask?: TaskData | null;
  selectedFolderId?: string | null;
  folders?: TaskFolder[];
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  initialTitle = "",
  candidateId,
  jobId,
  onTaskCreated,
  editTask,
  selectedFolderId,
  folders = [],
}: CreateTaskDialogProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allCandidates, setAllCandidates] = useState<CandidateOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [detectedCandidateId, setDetectedCandidateId] = useState<string | null>(null);
  const [manualCandidateId, setManualCandidateId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    title: initialTitle,
    description: "",
    assigned_to: "",
    deadline: undefined as Date | undefined,
    folder_id: selectedFolderId || "",
  });
  const { toast } = useToast();
  const { t, currentLanguage } = useLanguage();

  const getLocale = () => {
    switch (currentLanguage) {
      case "de": return de;
      case "fr": return fr;
      case "es": return es;
      case "it": return it;
      default: return enUS;
    }
  };

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (open) {
      fetchProfiles();
      fetchCandidates();
      if (editTask) {
        setNewTask({
          title: editTask.title,
          description: editTask.description || "",
          assigned_to: editTask.assigned_to || "",
          deadline: editTask.deadline ? new Date(editTask.deadline) : undefined,
          folder_id: editTask.folder_id || "",
        });
        setManualCandidateId(editTask.candidate_id || null);
        setDetectedCandidateId(null);
      } else {
        setNewTask({
          title: initialTitle,
          description: "",
          assigned_to: "",
          deadline: undefined,
          folder_id: selectedFolderId || "",
        });
        setManualCandidateId(candidateId || null);
        setDetectedCandidateId(null);
      }
    }
  }, [open, initialTitle, editTask, selectedFolderId, candidateId]);

  const fetchProfiles = async () => {
    const { data, error } = await supabase.from("profiles").select("id, full_name, email");
    if (!error) {
      setProfiles(data || []);
    }
  };

  const fetchCandidates = async () => {
    const { data, error } = await supabase.from("candidates").select("id, name");
    if (!error) {
      setAllCandidates(data || []);
    }
  };

  // Sort candidates by name length descending so longest match wins
  const sortedCandidates = useMemo(() => {
    return [...allCandidates].sort((a, b) => b.name.length - a.name.length);
  }, [allCandidates]);

  const detectCandidate = useCallback((title: string) => {
    if (!title.trim() || manualCandidateId) return;
    const titleLower = title.toLowerCase();
    for (const candidate of sortedCandidates) {
      if (titleLower.includes(candidate.name.toLowerCase())) {
        setDetectedCandidateId(candidate.id);
        return;
      }
    }
    setDetectedCandidateId(null);
  }, [sortedCandidates, manualCandidateId]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTitleChange = (value: string) => {
    setNewTask({ ...newTask, title: value });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      detectCandidate(value);
    }, 600);
  };

  const effectiveCandidateId = manualCandidateId || detectedCandidateId;
  const detectedCandidateName = effectiveCandidateId
    ? allCandidates.find(c => c.id === effectiveCandidateId)?.name
    : null;

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getProfileName = (userId: string | null) => {
    if (!userId) return t("tasks.assignedTo");
    const profile = profiles.find((p) => p.id === userId);
    return profile?.full_name || profile?.email || t("dashboard.unknown");
  };

  const saveTask = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast({
        title: t("toast.error"),
        description: t("toast.notLoggedIn"),
        variant: "destructive",
      });
      return;
    }

    if (!newTask.title.trim()) {
      toast({
        title: t("toast.error"),
        description: t("toast.requiredFieldsMissing"),
        variant: "destructive",
      });
      return;
    }

    // Auto-assign to current user if not assigned
    const assignedTo = newTask.assigned_to || user.id;

    if (editTask?.id) {
      // Update existing task
      const { error } = await supabase
        .from("tasks")
        .update({
          title: newTask.title,
          description: newTask.description || null,
          assigned_to: assignedTo,
          deadline: newTask.deadline ? newTask.deadline.toISOString() : null,
          folder_id: newTask.folder_id || null,
        })
        .eq("id", editTask.id);

      if (error) {
        toast({
          title: t("toast.updateError"),
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: t("toast.updateSuccess"),
        });
        onOpenChange(false);
        onTaskCreated?.();
      }
    } else {
      // Create new task
      const { error } = await supabase.from("tasks").insert({
        title: newTask.title,
        description: newTask.description || null,
        assigned_to: assignedTo,
        candidate_id: effectiveCandidateId || candidateId || null,
        job_id: jobId || null,
        deadline: newTask.deadline ? newTask.deadline.toISOString() : null,
        folder_id: newTask.folder_id || null,
        user_id: user.id,
      });

      if (error) {
        toast({
          title: t("toast.createError"),
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: t("toast.createSuccess"),
          description: t("tasks.newTask"),
        });
        onOpenChange(false);
        onTaskCreated?.();
      }
    }
  };

  const isEditMode = !!editTask?.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? t("tasks.editTask") : t("tasks.newTask")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium mb-2 block">{t("tasks.title")}</Label>
            <Input
              value={newTask.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder={t("tasks.taskNamePlaceholder")}
            />
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">{t("common.description")}</Label>
            <RichTextEditor
              content={newTask.description}
              onChange={(content) => setNewTask({ ...newTask, description: content })}
              placeholder={t("tasks.descriptionPlaceholder")}
            />
          </div>

          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={newTask.deadline ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <CalendarIcon className="h-4 w-4" />
                  {newTask.deadline
                    ? format(newTask.deadline, "MMM d", { locale: getLocale() })
                    : t("common.date")}
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-auto p-0" 
                align="start"
                sideOffset={4}
                avoidCollisions={false}
              >
                <Calendar
                  mode="single"
                  selected={newTask.deadline}
                  onSelect={(date) => setNewTask({ ...newTask, deadline: date })}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            <Select
              value={newTask.assigned_to || "none"}
              onValueChange={(value) =>
                setNewTask({ ...newTask, assigned_to: value === "none" ? "" : value })
              }
            >
              <SelectTrigger
                className={cn(
                  "h-9 gap-2 border-0 shadow-none hover:bg-accent px-3 w-auto",
                  newTask.assigned_to ? "bg-secondary" : "bg-transparent"
                )}
              >
                <User className="h-4 w-4" />
                <SelectValue>
                  {newTask.assigned_to ? getProfileName(newTask.assigned_to) : t("tasks.assignedTo")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("tasks.assignedTo")}</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[10px]">
                          {getInitials(profile.full_name || profile.email)}
                        </AvatarFallback>
                      </Avatar>
                      {profile.full_name || profile.email}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {folders.length > 0 && (
              <Select
                value={newTask.folder_id || "none"}
                onValueChange={(value) =>
                  setNewTask({ ...newTask, folder_id: value === "none" ? "" : value })
                }
              >
                <SelectTrigger
                  className={cn(
                    "h-9 gap-2 border-0 shadow-none hover:bg-accent px-3 w-auto",
                    newTask.folder_id ? "bg-secondary" : "bg-transparent"
                  )}
                >
                  <Folder className="h-4 w-4" />
                  <SelectValue>
                    {newTask.folder_id 
                      ? folders.find(f => f.id === newTask.folder_id)?.name || t("tasks.folder")
                      : t("tasks.folder")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("tasks.noFolder")}</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4" style={{ color: folder.color }} />
                        {folder.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center justify-end border-t pt-4">
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={saveTask}>{t("common.save")}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
