import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, CalendarIcon, Filter, ArrowUpDown, MoreVertical, Pencil, FolderPlus, Folder, X, ChevronDown } from "lucide-react";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { de, enUS, fr, es, it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Task {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  assigned_to: string | null;
  candidate_id: string | null;
  job_id: string | null;
  deadline: string | null;
  user_id: string;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskFolder {
  id: string;
  name: string;
  color: string;
  user_id: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Candidate {
  id: string;
  name: string;
}

interface Job {
  id: string;
  title: string;
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [folders, setFolders] = useState<TaskFolder[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "pending">("all");
  const [sortBy, setSortBy] = useState<"deadline" | "created">("deadline");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isEditFolderOpen, setIsEditFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#3B82F6");
  const [editFolderName, setEditFolderName] = useState("");
  const [editFolderColor, setEditFolderColor] = useState("#3B82F6");
  const { toast } = useToast();
  const { t, currentLanguage } = useLanguage();
  const navigate = useNavigate();

  const folderColors = [
    "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"
  ];

  const getLocale = () => {
    switch (currentLanguage) {
      case 'de': return de;
      case 'fr': return fr;
      case 'es': return es;
      case 'it': return it;
      default: return enUS;
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchFolders();
    fetchProfiles();
    fetchCandidates();
    fetchJobs();
  }, []);

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: t("toast.error"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      setTasks(data || []);
    }
  };

  const fetchFolders = async () => {
    const { data, error } = await supabase
      .from("task_folders")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching folders:", error);
    } else {
      setFolders(data || []);
    }
  };

  const fetchProfiles = async () => {
    const { data, error } = await supabase.from("profiles").select("id, full_name, email");

    if (error) {
      console.error("Error fetching profiles:", error);
    } else {
      setProfiles(data || []);
    }
  };

  const fetchCandidates = async () => {
    const { data, error } = await supabase.from("candidates").select("id, name");

    if (error) {
      console.error("Error fetching candidates:", error);
    } else {
      setCandidates(data || []);
    }
  };

  const fetchJobs = async () => {
    const { data, error } = await supabase.from("jobs").select("id, title");

    if (error) {
      console.error("Error fetching jobs:", error);
    } else {
      setJobs(data || []);
    }
  };

  const toggleTaskCompletion = async (taskId: string, completed: boolean) => {
    const { error } = await supabase
      .from("tasks")
      .update({ completed: !completed })
      .eq("id", taskId);

    if (error) {
      toast({
        title: t("toast.error"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      fetchTasks();
    }
  };

  const deleteTask = async (taskId: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);

    if (error) {
      toast({
        title: t("toast.deleteError"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: t("toast.deleteSuccess"),
      });
      fetchTasks();
    }
  };

  const getProfileName = (userId: string | null) => {
    if (!userId) return t("tasks.assignedTo");
    const profile = profiles.find((p) => p.id === userId);
    return profile?.full_name || profile?.email || t("dashboard.unknown");
  };

  const getCandidateName = (candidateId: string | null) => {
    if (!candidateId) return null;
    const candidate = candidates.find((c) => c.id === candidateId);
    return candidate?.name;
  };

  const getJobTitle = (jobId: string | null) => {
    if (!jobId) return null;
    const job = jobs.find((j) => j.id === jobId);
    return job?.title;
  };

  const updateTaskField = async (taskId: string, field: string, value: any) => {
    const { error } = await supabase
      .from("tasks")
      .update({ [field]: value })
      .eq("id", taskId);

    if (error) {
      toast({
        title: t("toast.updateError"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      fetchTasks();
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    const { error } = await supabase.from("task_folders").insert({
      name: newFolderName.trim(),
      color: newFolderColor,
      user_id: session.user.id,
    });

    if (error) {
      toast({
        title: t("toast.error"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: t("toast.success") });
      setNewFolderName("");
      setNewFolderColor("#3B82F6");
      setIsCreateFolderOpen(false);
      fetchFolders();
    }
  };

  const deleteFolder = async (folderId: string) => {
    const { error } = await supabase.from("task_folders").delete().eq("id", folderId);

    if (error) {
      toast({
        title: t("toast.error"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
      fetchFolders();
    }
  };

  const updateFolder = async () => {
    if (!selectedFolderId || !editFolderName.trim()) return;

    const { error } = await supabase
      .from("task_folders")
      .update({ name: editFolderName.trim(), color: editFolderColor })
      .eq("id", selectedFolderId);

    if (error) {
      toast({
        title: t("toast.error"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: t("toast.success") });
      setIsEditFolderOpen(false);
      fetchFolders();
    }
  };

  const openEditFolder = () => {
    const folder = folders.find(f => f.id === selectedFolderId);
    if (folder) {
      setEditFolderName(folder.name);
      setEditFolderColor(folder.color);
      setIsEditFolderOpen(true);
    }
  };

  const selectedFolder = folders.find(f => f.id === selectedFolderId);

  const filteredTasks = tasks.filter((task) => {
    // First filter by folder
    if (selectedFolderId !== null && task.folder_id !== selectedFolderId) {
      return false;
    }
    // Then filter by status
    if (filterStatus === "completed") return task.completed;
    if (filterStatus === "pending") return !task.completed;
    return true;
  });

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (sortBy === "deadline") {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Split into pending and completed for collapsible display
  const showCollapsible = filterStatus === "all" || filterStatus === "pending";
  const pendingTasks = showCollapsible ? sortedTasks.filter(t => !t.completed) : sortedTasks;
  const completedTasks = showCollapsible ? sortedTasks.filter(t => t.completed) : [];

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getFolderName = (folderId: string | null) => {
    if (!folderId) return null;
    const folder = folders.find(f => f.id === folderId);
    return folder?.name;
  };

  const renderTaskTitle = (task: Task) => {
    const candidateName = getCandidateName(task.candidate_id);
    if (!candidateName || !task.title.toLowerCase().includes(candidateName.toLowerCase())) {
      return <>{task.title}</>;
    }
    const idx = task.title.toLowerCase().indexOf(candidateName.toLowerCase());
    const before = task.title.slice(0, idx);
    const match = task.title.slice(idx, idx + candidateName.length);
    const after = task.title.slice(idx + candidateName.length);
    // Check if there's already an @ right before the name
    const hasAtPrefix = before.endsWith("@");
    const displayBefore = hasAtPrefix ? before.slice(0, -1) : before;
    return (
      <>
        {displayBefore}
        <span
          className="cursor-pointer hover:text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/candidates/${task.candidate_id}`, { state: { from: '/tasks' } });
          }}
        >
          @{match}
        </span>
        {after}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ArrowUpDown className="mr-2 h-4 w-4" />
                {sortBy === "deadline" ? t("tasks.deadline") : t("common.date")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSortBy("deadline")}>
                {t("tasks.deadline")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("created")}>
                {t("common.date")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                {t("common.filter")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setFilterStatus("all")}>
                {t("common.all")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterStatus("pending")}>
                {t("tasks.pending")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterStatus("completed")}>
                {t("tasks.completed")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-6" />

          {/* Folder buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant={selectedFolderId === null ? "default" : "ghost"}
              size="sm"
              onClick={() => setSelectedFolderId(null)}
              className="h-7 px-2 text-xs"
            >
              {t("common.all") || "Alle"}
            </Button>
            {folders.map((folder) => (
              <Button
                key={folder.id}
                variant={selectedFolderId === folder.id ? "default" : "ghost"}
                size="sm"
                onClick={() => setSelectedFolderId(folder.id)}
                className="h-7 px-2 text-xs gap-1.5"
                style={{
                  backgroundColor: selectedFolderId === folder.id ? folder.color : undefined,
                  borderColor: folder.color,
                }}
              >
                <Folder className="h-3 w-3" style={{ color: selectedFolderId === folder.id ? 'white' : folder.color }} />
                {folder.name}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCreateFolderOpen(true)}
              className="h-7 w-7 p-0"
              title={t("tasks.createFolder") || "Ordner erstellen"}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <Button size="sm" onClick={() => { setEditingTask(null); setIsDialogOpen(true); }}>
          <Plus className="h-4 w-4" />
        </Button>
        
        <CreateTaskDialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setEditingTask(null);
          }}
          editTask={editingTask ? {
            id: editingTask.id,
            title: editingTask.title,
            description: editingTask.description,
            assigned_to: editingTask.assigned_to,
            candidate_id: editingTask.candidate_id,
            job_id: editingTask.job_id,
            deadline: editingTask.deadline,
            folder_id: editingTask.folder_id,
          } : null}
          selectedFolderId={selectedFolderId}
          folders={folders}
          onTaskCreated={fetchTasks}
        />

        {/* Create Folder Dialog */}
        <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
          <DialogContent className="sm:max-w-[360px]">
            <DialogHeader>
              <DialogTitle>{t("tasks.createFolder") || "Ordner erstellen"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Input
                placeholder={t("tasks.folderName") || "Ordnername"}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t("common.color") || "Farbe"}:</span>
                <div className="flex gap-1">
                  {folderColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewFolderColor(color)}
                      className={cn(
                        "w-6 h-6 rounded-full border-2 transition-all",
                        newFolderColor === color ? "border-foreground scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateFolderOpen(false)}>
                {t("common.cancel") || "Abbrechen"}
              </Button>
              <Button onClick={createFolder} disabled={!newFolderName.trim()}>
                {t("common.create") || "Erstellen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Folder Dialog */}
        <Dialog open={isEditFolderOpen} onOpenChange={setIsEditFolderOpen}>
          <DialogContent className="sm:max-w-[360px]">
            <DialogHeader>
              <DialogTitle>{t("tasks.editFolder") || "Ordner bearbeiten"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Input
                placeholder={t("tasks.folderName") || "Ordnername"}
                value={editFolderName}
                onChange={(e) => setEditFolderName(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t("common.color") || "Farbe"}:</span>
                <div className="flex gap-1">
                  {folderColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setEditFolderColor(color)}
                      className={cn(
                        "w-6 h-6 rounded-full border-2 transition-all",
                        editFolderColor === color ? "border-foreground scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditFolderOpen(false)}>
                {t("common.cancel") || "Abbrechen"}
              </Button>
              <Button onClick={updateFolder} disabled={!editFolderName.trim()}>
                {t("common.save") || "Speichern"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Folder Info Bar */}
      {selectedFolder && (
        <div 
          className="flex items-center justify-between px-4 py-2 rounded-lg border"
          style={{ borderColor: selectedFolder.color, backgroundColor: `${selectedFolder.color}10` }}
        >
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4" style={{ color: selectedFolder.color }} />
            <span className="font-medium">{selectedFolder.name}</span>
            <span className="text-sm text-muted-foreground">
              ({filteredTasks.length} {filteredTasks.length === 1 ? 'Task' : 'Tasks'})
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openEditFolder}>
                <Pencil className="h-4 w-4 mr-2" />
                {t("common.edit") || "Bearbeiten"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => deleteFolder(selectedFolder.id)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t("common.delete") || "Löschen"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>{t("tasks.title")}</TableHead>
              <TableHead className="w-[180px]">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {t("tasks.deadline")}
                </div>
              </TableHead>
              <TableHead className="w-[200px]">{t("tasks.record")}</TableHead>
              <TableHead className="w-[180px]">{t("tasks.assignedTo")}</TableHead>
              <TableHead className="w-[180px]">{t("tasks.assignedBy")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingTasks.length === 0 && completedTasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  {t("tasks.noTasksYet")} {t("tasks.noTasksYetDesc")}
                </TableCell>
              </TableRow>
            ) : pendingTasks.length === 0 && !showCollapsible ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  {t("tasks.noTasksYet")} {t("tasks.noTasksYetDesc")}
                </TableCell>
              </TableRow>
            ) : (
              pendingTasks.map((task) => (
                <TableRow key={task.id} className="group">
                  <TableCell>
                    <Checkbox
                      checked={task.completed}
                      onCheckedChange={() => toggleTaskCompletion(task.id, task.completed)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className={cn(
                        "font-medium",
                        task.completed && "line-through text-muted-foreground"
                      )}>
                        {renderTaskTitle(task)}
                      </div>
                      {task.description && (
                        <div 
                          className="text-xs text-muted-foreground line-clamp-2 [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-1 [&_strong]:font-semibold"
                          dangerouslySetInnerHTML={{ __html: task.description }}
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 px-2">
                          {task.deadline ? (
                            <span className={cn(
                              "text-sm",
                              new Date(task.deadline) < new Date() && !task.completed
                                ? "text-destructive font-medium"
                                : "text-muted-foreground"
                            )}>
                              {format(new Date(task.deadline), "MMM d, yyyy", { locale: getLocale() })}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">{t("tasks.setDate")}</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={task.deadline ? new Date(task.deadline) : undefined}
                          onSelect={(date) => updateTaskField(task.id, "deadline", date?.toISOString() || null)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {task.candidate_id && (
                        <Badge 
                          variant="secondary" 
                          className="w-fit text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
                          onClick={() => navigate(`/candidates/${task.candidate_id}`, { state: { from: '/tasks' } })}
                        >
                          {getCandidateName(task.candidate_id)}
                        </Badge>
                      )}
                      {task.job_id && (
                        <Badge 
                          variant="outline" 
                          className="w-fit text-xs cursor-pointer hover:bg-accent transition-colors"
                          onClick={() => navigate(`/jobs/${task.job_id}`, { state: { from: '/tasks' } })}
                        >
                          {getJobTitle(task.job_id)}
                        </Badge>
                      )}
                      {!task.candidate_id && !task.job_id && (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={task.assigned_to || "none"}
                      onValueChange={(value) => 
                        updateTaskField(task.id, "assigned_to", value === "none" ? null : value)
                      }
                    >
                      <SelectTrigger className="h-8 border-none shadow-none hover:bg-accent">
                        <SelectValue>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">
                                {getInitials(getProfileName(task.assigned_to))}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{getProfileName(task.assigned_to)}</span>
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("common.notAssigned")}</SelectItem>
                        {profiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs">
                                  {getInitials(profile.full_name || profile.email)}
                                </AvatarFallback>
                              </Avatar>
                              {profile.full_name || profile.email}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {getInitials(getProfileName(task.user_id))}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground">
                        {getProfileName(task.user_id)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingTask(task);
                            setIsDialogOpen(true);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {t("common.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteTask(task.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Collapsible completed tasks section */}
      {showCollapsible && completedTasks.length > 0 && (
        <Collapsible open={showCompleted} onOpenChange={setShowCompleted}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground">
              <ChevronDown className={cn("h-4 w-4 transition-transform", showCompleted && "rotate-180")} />
              {completedTasks.length} {completedTasks.length === 1 ? "erledigter Task" : "erledigte Tasks"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border rounded-lg mt-2">
              <Table>
                <TableBody>
                  {completedTasks.map((task) => (
                    <TableRow key={task.id} className="group opacity-60">
                      <TableCell className="w-12">
                        <Checkbox
                          checked={task.completed}
                          onCheckedChange={() => toggleTaskCompletion(task.id, task.completed)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium line-through text-muted-foreground">
                            {renderTaskTitle(task)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="w-[180px]">
                        {task.deadline && (
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(task.deadline), "MMM d, yyyy", { locale: getLocale() })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="w-[200px]">
                        <div className="flex flex-col gap-1">
                          {task.candidate_id && (
                            <Badge variant="secondary" className="w-fit text-xs cursor-pointer" onClick={() => navigate(`/candidates/${task.candidate_id}`, { state: { from: '/tasks' } })}>
                              {getCandidateName(task.candidate_id)}
                            </Badge>
                          )}
                          {task.job_id && (
                            <Badge variant="outline" className="w-fit text-xs cursor-pointer" onClick={() => navigate(`/jobs/${task.job_id}`, { state: { from: '/tasks' } })}>
                              {getJobTitle(task.job_id)}
                            </Badge>
                          )}
                          {!task.candidate_id && !task.job_id && <span className="text-xs text-muted-foreground">-</span>}
                        </div>
                      </TableCell>
                      <TableCell className="w-[180px]">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">{getInitials(getProfileName(task.assigned_to))}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{getProfileName(task.assigned_to)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="w-[180px]">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">{getInitials(getProfileName(task.user_id))}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-muted-foreground">{getProfileName(task.user_id)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="w-12">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditingTask(task); setIsDialogOpen(true); }}>
                              <Pencil className="mr-2 h-4 w-4" />
                              {t("common.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteTask(task.id)} className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t("common.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
