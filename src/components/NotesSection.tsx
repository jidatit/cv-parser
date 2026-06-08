import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Save, Pencil, Trash2, X, Plus, History, UserCheck, GitBranch, RefreshCw, FileText, Sparkles, ChevronDown, MessageSquare, AlertTriangle, Send } from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { format, formatDistanceToNow, isValid } from "date-fns";
import { de, enUS, fr, it, es } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import DOMPurify from "dompurify";
import { useLanguage } from "@/hooks/useLanguage";
import { formatActivityLog, FormattedActivity } from "@/lib/activityFormatter";
import { cn } from "@/lib/utils";

// URL regex pattern for linkifying text

// URL regex pattern for linkifying text
const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;

// Convert URLs in text to anchor tags
const linkifyText = (text: string): string => {
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
};

// Linkify URLs in HTML content (only in text nodes, not in existing links)
const linkifyHtml = (html: string): string => {
  // Don't linkify if already contains anchor tags for this URL
  if (!html.includes('http://') && !html.includes('https://')) {
    return html;
  }
  
  // Sanitize BEFORE any DOM manipulation (defense-in-depth)
  const sanitizedHtml = DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] });
  
  // Create a temporary div to parse sanitized HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = sanitizedHtml;
  
  // Walk through text nodes and linkify URLs
  const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    // Skip if parent is already a link
    if (node.parentElement?.tagName !== 'A' && urlRegex.test(node.textContent || '')) {
      textNodes.push(node);
    }
  }
  
  // Reset regex lastIndex
  urlRegex.lastIndex = 0;
  
  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    if (urlRegex.test(text)) {
      urlRegex.lastIndex = 0;
      const span = document.createElement('span');
      span.innerHTML = linkifyText(text);
      textNode.parentNode?.replaceChild(span, textNode);
    }
  }
  
  return tempDiv.innerHTML;
};

// Remove accidental trailing empty paragraphs (TipTap often appends 1–2 empty blocks)
const trimTrailingEmptyParagraphs = (html: string): string => {
  return html.replace(/(?:<p>(?:\s|&nbsp;|<br[^>]*>)*<\/p>\s*)+$/g, "");
};

// Normalize empty lines in HTML so spacing is preserved after saving
const normalizeNoteHtml = (html: string): string => {
  let result = html
    .replace(/<p>\s*<\/p>/g, "<p>&nbsp;</p>")
    // Also handle TipTap/ProseMirror empty paragraphs like: <p><br class="ProseMirror-trailingBreak"></p>
    .replace(/<p>\s*<br[^>]*>\s*<\/p>/g, "<p>&nbsp;</p>");

  // Linkify URLs
  result = linkifyHtml(result);

  // But never keep empty spacing at the end of the note
  result = trimTrailingEmptyParagraphs(result);

  return result;
};

// Convert plain text with bullet points and line breaks to HTML
const convertTextToHtml = (text: string): string => {
  // If it's already HTML (from RichTextEditor), process it differently
  if (text.includes('<p>') || text.includes('<ul>') || text.includes('<li>')) {
    // Extract text content and reprocess (prefer innerText to preserve line breaks)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    const plainText = tempDiv.innerText || tempDiv.textContent || '';

    // Only convert to lists if the *lines* actually start with bullet markers.
    // Previous logic used plainText.includes('- ') which also matches normal text like "Senior - Sales" and broke existing HTML lists.
    const hasBulletLines = /(^|\n)\s*(?:[•·●◦▪▫‣⁃]|\-|\*)\s+/m.test(plainText);

    if (!hasBulletLines) {
      return normalizeNoteHtml(text);
    }

    // Continue with conversion using plain text
    text = plainText;
  }
  
  // Split by line breaks
  const lines = text.split(/\r\n|\n/);
  const result: string[] = [];
  let inList = false;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check if line starts with bullet point markers
    const bulletMatch = trimmedLine.match(/^(?:[•·●◦▪▫‣⁃]|\-|\*)\s*(.*)$/);
    
    if (bulletMatch) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(`<li><p>${linkifyText(bulletMatch[1])}</p></li>`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      if (trimmedLine) {
        result.push(`<p>${linkifyText(trimmedLine)}</p>`);
      } else if (result.length > 0) {
        // Preserve empty lines as visible spacing between paragraphs
        result.push('<p>&nbsp;</p>');
      }
    }
  }
  
  if (inList) {
    result.push('</ul>');
  }
  
  return normalizeNoteHtml(result.join(''));
};

// Ensure that migrated/plain-text notes (with newlines/bullets) are rendered and editable correctly.
// TipTap expects HTML; if we pass plain text with "\n", it collapses lines and bullets can "disappear".
const ensureNoteContentHtml = (content: string): string => {
  if (!content) return "";

  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(content);
  if (looksLikeHtml) {
    // Keep existing HTML structure (lists, formatting), just normalize spacing + linkify.
    return normalizeNoteHtml(content);
  }

  // Plain text (often migrated): convert bullets/newlines into proper HTML.
  return convertTextToHtml(content);
};

interface Note {
  id: string;
  content: string;
  author: string;
  timestamp: string;
  isPush?: boolean;
  isImportant?: boolean;
}

interface ActivityLogEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  changes: any;
  new_data: any;
  old_data: any;
  created_at: string;
}

interface TimelineItem {
  id: string;
  type: 'note' | 'activity';
  timestamp: string;
  data: Note | ActivityLogEntry;
}

interface NotesSectionProps {
  initialNotes?: Note[];
  onSave: (notes: Note[]) => Promise<void>;
  userName?: string;
  userAvatarUrl?: string | null;
  entityType?: string;
  entityId?: string;
  entityName?: string; // For task creation
}

export function NotesSection({ 
  initialNotes = [], 
  onSave, 
  userName = "Current User", 
  userAvatarUrl,
  entityType,
  entityId,
  entityName
}: NotesSectionProps) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [currentNote, setCurrentNote] = useState("");
  const [isCurrentNoteImportant, setIsCurrentNoteImportant] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingIsImportant, setEditingIsImportant] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; email: string | null }>>({});
  const [filter, setFilter] = useState<'all' | 'notes' | 'activities'>('notes');
  
  const { t, currentLanguage } = useLanguage();

  const getLocale = () => {
    const locales: Record<string, typeof de> = { de, en: enUS, fr, it, es };
    return locales[currentLanguage] || de;
  };

  // Update notes when initialNotes changes
  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  // Fetch activity logs if entityType and entityId are provided
  useEffect(() => {
    if (!entityType || !entityId) return;

    const fetchActivityLogs = async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading activity logs:', error);
        return;
      }

      setActivityLogs(data || []);

      // Fetch profiles for user names
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(log => log.user_id))];
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        
        if (profileData) {
          const profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
          profileData.forEach(p => {
            profileMap[p.id] = { full_name: p.full_name, email: p.email };
          });
          setProfiles(profileMap);
        }
      }
    };

    fetchActivityLogs();
  }, [entityType, entityId]);

  // Combine notes and activity logs into a timeline
  const allTimelineItems: TimelineItem[] = [
    ...notes.map(note => ({
      id: `note-${note.id}`,
      type: 'note' as const,
      timestamp: note.timestamp,
      data: note
    })),
    ...activityLogs.map(log => ({
      id: `activity-${log.id}`,
      type: 'activity' as const,
      timestamp: log.created_at,
      data: log
    }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Filter timeline items based on selected filter
  const timelineItems = allTimelineItems.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'notes') return item.type === 'note';
    if (filter === 'activities') return item.type === 'activity';
    return true;
  });

  const handleSave = async () => {
    if (!currentNote.trim() || currentNote === "<p></p>") return;

    // Convert plain text bullet points to HTML lists and normalize spacing
    const processedContent = normalizeNoteHtml(convertTextToHtml(currentNote));

    const newNote: Note = {
      id: Date.now().toString(),
      content: processedContent,
      author: userName,
      timestamp: new Date().toISOString(),
      isImportant: isCurrentNoteImportant,
    };

    const updatedNotes = [newNote, ...notes];
    setNotes(updatedNotes);
    setCurrentNote("");
    setEditorKey(prev => prev + 1);
    setIsCurrentNoteImportant(false);
    
    try {
      await onSave(updatedNotes);
      toast({
        title: t("toast.success") || "Success",
        description: t("notes.saved") || "Note has been saved",
      });
    } catch (error) {
      toast({
        title: t("toast.error") || "Error",
        description: t("notes.saveError") || "Note could not be saved",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingContent(ensureNoteContentHtml(note.content));
    setEditingIsImportant(note.isImportant || false);
  };

  const handleSaveEdit = async () => {
    if (!editingContent.trim() || editingContent === "<p></p>") return;

    const processedContent = normalizeNoteHtml(convertTextToHtml(editingContent));

    const updatedNotes = notes.map(note =>
      note.id === editingNoteId
        ? { ...note, content: processedContent, isImportant: editingIsImportant }
        : note
    );
    setNotes(updatedNotes);
    setEditingNoteId(null);
    setEditingContent("");
    setEditingIsImportant(false);
    
    try {
      await onSave(updatedNotes);
      toast({
        title: t("toast.success") || "Success",
        description: t("notes.updated") || "Note has been updated",
      });
    } catch (error) {
      toast({
        title: t("toast.error") || "Error",
        description: t("notes.updateError") || "Note could not be updated",
        variant: "destructive",
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditingContent("");
    setEditingIsImportant(false);
  };

  const handleDelete = async (noteId: string) => {
    const updatedNotes = notes.filter(note => note.id !== noteId);
    setNotes(updatedNotes);
    
    try {
      await onSave(updatedNotes);
      toast({
        title: t("toast.success") || "Success",
        description: t("notes.deleted") || "Note has been deleted",
      });
    } catch (error) {
      toast({
        title: t("toast.error") || "Error",
        description: t("notes.deleteError") || "Note could not be deleted",
        variant: "destructive",
      });
    }
  };

  const getFirstName = (userId: string) => {
    const profile = profiles[userId];
    if (profile?.full_name) {
      return profile.full_name.split(' ')[0];
    }
    if (profile?.email) return profile.email.split('@')[0];
    return t("common.unknown") || '?';
  };

  const getActivityIcon = (icon: FormattedActivity['icon']) => {
    switch (icon) {
      case 'create':
        return <Plus className="h-3.5 w-3.5 text-green-500" />;
      case 'delete':
        return <Trash2 className="h-3.5 w-3.5 text-red-500" />;
      case 'match':
        return <GitBranch className="h-3.5 w-3.5 text-purple-500" />;
      case 'stage':
        return <RefreshCw className="h-3.5 w-3.5 text-blue-500" />;
      case 'assign':
        return <UserCheck className="h-3.5 w-3.5 text-orange-500" />;
      case 'status':
        return <RefreshCw className="h-3.5 w-3.5 text-yellow-500" />;
      case 'document':
        return <FileText className="h-3.5 w-3.5 text-cyan-500" />;
      case 'ai':
        return <Sparkles className="h-3.5 w-3.5 text-emerald-500" />;
      default:
        return <History className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return '-';
      }
      return format(date, "dd.MM.yy HH:mm", { locale: getLocale() });
    } catch {
      return '-';
    }
  };

  const handlePushNote = async () => {
    const pushNote: Note = {
      id: Date.now().toString(),
      content: `<p>Gepushed</p>`,
      author: userName,
      timestamp: new Date().toISOString(),
      isPush: true,
    };

    const updatedNotes = [pushNote, ...notes];
    setNotes(updatedNotes);
    
    try {
      await onSave(updatedNotes);
      
      // Update last_pushed_at for candidates
      if (entityType === 'candidates' && entityId) {
        await supabase
          .from('candidates')
          .update({ last_pushed_at: new Date().toISOString() })
          .eq('id', entityId);
      }
      
      // Check workflow rules and create reminder task if enabled
      if (entityType === 'candidates' && entityId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Get workflow rules - use maybeSingle to handle missing rows gracefully
          const { data: workflowConfig, error: workflowError } = await supabase
            .from('status_configurations')
            .select('config_value')
            .eq('user_id', user.id)
            .eq('config_type', 'workflow_rules')
            .maybeSingle();
          
          // If query failed or no config exists, skip reminder creation
          if (workflowError || !workflowConfig) {
            console.log('Push reminder skipped: no workflow config found or query error');
          } else {
            const workflowRules = workflowConfig.config_value as { pushReminderEnabled?: boolean; pushReminderDays?: number } | null;
            
            // Explicit === true check to prevent any truthy edge cases
            if (workflowRules?.pushReminderEnabled === true) {
              // Skip push reminder for archived or unavailable candidates
              const { data: candidateData } = await supabase
                .from('candidates')
                .select('status')
                .eq('id', entityId)
                .maybeSingle();
              
              const skipStatuses = ['Not available', 'Archived'];
              if (!candidateData || skipStatuses.includes(candidateData.status || '')) {
                // Don't create reminder task
              } else {
                const reminderDays = workflowRules.pushReminderDays || 10.5;
                const deadline = new Date();
                deadline.setDate(deadline.getDate() + reminderDays);
                
                // Find or create "Pushen" folder
                let { data: existingFolder } = await supabase
                  .from('task_folders')
                  .select('id')
                  .eq('user_id', user.id)
                  .eq('name', 'Pushen')
                  .maybeSingle();
                
                let folderId = existingFolder?.id;
                
                if (!folderId) {
                  const { data: newFolder } = await supabase
                    .from('task_folders')
                    .insert({
                      name: 'Pushen',
                      color: '#3B82F6',
                      user_id: user.id,
                    })
                    .select('id')
                    .single();
                  folderId = newFolder?.id;
                }
                
                // Create the reminder task
                const taskTitle = entityName 
                  ? `@${entityName} erneut pushen`
                  : 'Kandidat erneut pushen';
                
                await supabase.from('tasks').insert({
                  title: taskTitle,
                  description: `<p>Erinnerung: Dieser Kandidat wurde vor ${reminderDays === 7 ? '1 Woche' : reminderDays === 10.5 ? '1.5 Wochen' : reminderDays === 14 ? '2 Wochen' : '3 Wochen'} gepushed und sollte erneut für passende Stellen geprüft werden.</p>`,
                  deadline: deadline.toISOString(),
                  candidate_id: entityId,
                  folder_id: folderId,
                  user_id: user.id,
                  assigned_to: user.id,
                });
              }
            }
          }
        }
      }
      
      toast({
        title: t("toast.success") || "Success",
        description: t("notes.pushSaved") || "Push wurde dokumentiert",
      });
    } catch (error) {
      toast({
        title: t("toast.error") || "Error",
        description: t("notes.pushError") || "Push konnte nicht gespeichert werden",
        variant: "destructive",
      });
    }
  };

  const renderNoteItem = (note: Note) => (
    <div className={cn(
      "rounded p-2 relative",
      note.isPush ? "bg-blue-500/15 border border-blue-500/30" :
      note.isImportant ? "bg-destructive/10" : "bg-muted/30"
    )}>
      <div>
      <div className="flex items-start gap-2 mb-1">
        <Avatar className="h-6 w-6">
          <AvatarImage src={userAvatarUrl || undefined} />
          <AvatarFallback className="text-xs bg-primary text-primary-foreground">
            {note.author ? note.author.split(' ').map(n => n[0]).join('') : 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">{note.author || 'Unknown User'}</p>
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              {formatTimestamp(note.timestamp)}
            </p>
          </div>
        </div>
      </div>
      {editingNoteId !== note.id && (
        <div className="absolute bottom-2 right-2 group">
          <div className="h-8 w-10 flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 bg-background/80 hover:bg-background text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleDelete(note.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
      {editingNoteId === note.id ? (
        <div className="space-y-2">
          <RichTextEditor
            content={editingContent}
            onChange={setEditingContent}
            placeholder="Edit note..."
          />
          <div className="flex gap-2 justify-end items-center">
            <Button
              size="sm"
              variant={editingIsImportant ? "destructive" : "ghost"}
              onClick={() => setEditingIsImportant(!editingIsImportant)}
              title={t("notes.markImportant") || "Wichtig markieren"}
            >
              <AlertTriangle className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancelEdit}
            >
              <X className="h-3 w-3 mr-1" />
              {t("common.cancel") || "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveEdit}
              disabled={!editingContent.trim() || editingContent === "<p></p>"}
            >
              <Save className="h-3 w-3 mr-1" />
              {t("common.save") || "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <div 
          className="max-w-none text-xs [&_p]:text-xs [&_p]:leading-relaxed [&_p]:my-2 [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:my-3 [&_li]:my-0.5 [&_li_p]:my-0 [&_a]:text-primary [&_a]:underline [&_a]:cursor-pointer hover:[&_a]:text-primary/80"
          onDoubleClick={() => handleEdit(note)}
          title="Doppelklick zum Bearbeiten"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(ensureNoteContentHtml(note.content), { ADD_ATTR: ['target', 'rel'] })
          }}
        />
      )}
      </div>
    </div>
  );

  const renderActivityItem = (log: ActivityLogEntry) => {
    const activities = formatActivityLog(
      {
        action: log.action,
        entity_type: log.entity_type,
        changes: log.changes,
        new_data: log.new_data,
        old_data: log.old_data
      },
      t
    );
    
    const mainActivity = activities[0];
    if (!mainActivity) return null;
    
    const firstName = getFirstName(log.user_id);
    const timeAgo = formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: getLocale() });
    
    return (
      <div className="flex items-start gap-2 py-1.5 text-xs border-b border-border/30 last:border-0">
        <div className="flex-shrink-0 mt-0.5">
          {getActivityIcon(mainActivity.icon)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1 flex-wrap">
            <span className="font-medium text-foreground">{firstName}</span>
            <span className="text-muted-foreground">—</span>
            <span className="text-foreground">{mainActivity.message}</span>
            {mainActivity.details && (
              <span className="text-muted-foreground font-mono text-[11px]">
                {mainActivity.details}
              </span>
            )}
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground/70 flex-shrink-0 whitespace-nowrap">
          {timeAgo}
        </span>
      </div>
    );
  };

  const [isInputOpen, setIsInputOpen] = useState(false);

  return (
    <div className="space-y-3">
      {/* Collapsible note input at the top */}
      <Collapsible open={isInputOpen} onOpenChange={setIsInputOpen}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="outline" 
            size="sm"
            className="w-full justify-between text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-3.5 w-3.5" />
              {t("notes.new") || "Neue Notiz"}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${isInputOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="relative">
            <RichTextEditor
              key={editorKey}
              content={currentNote}
              onChange={setCurrentNote}
              placeholder={t("notes.placeholder") || "Notiz hinzufügen..."}
              toolbarExtra={
                <Button 
                  size="icon"
                  variant={isCurrentNoteImportant ? "destructive" : "ghost"}
                  className="h-8 w-8"
                  onClick={() => setIsCurrentNoteImportant(!isCurrentNoteImportant)}
                  title={t("notes.markImportant") || "Wichtig markieren"}
                >
                  <AlertTriangle className="h-4 w-4" />
                </Button>
              }
            />
            <Button 
              size="icon"
              variant="outline"
              className="h-8 w-8 absolute bottom-2 right-2"
              onClick={handleSave}
              disabled={!currentNote.trim() || currentNote === "<p></p>"}
            >
              <Save className="h-4 w-4" />
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Timeline below */}
      {allTimelineItems.length > 0 && (
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">
              {t("notes.timeline") || "Timeline"} ({timelineItems.length})
            </h3>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                onClick={handlePushNote}
                title={t("notes.push") || "Push durchführen - Passende Stellen gesucht"}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
              <Separator orientation="vertical" className="h-4 mx-1 w-[2px] bg-white" />
              <Button
                variant={filter === 'notes' ? 'default' : 'ghost'}
                size="icon"
                className="h-6 w-6"
                onClick={() => setFilter(filter === 'notes' ? 'all' : 'notes')}
                title={t("notes.showNotes") || "Nur Notizen"}
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={filter === 'activities' ? 'default' : 'ghost'}
                size="icon"
                className="h-6 w-6"
                onClick={() => setFilter(filter === 'activities' ? 'all' : 'activities')}
                title={t("notes.showActivities") || "Nur Aktivitäten"}
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {timelineItems.map((item) => (
              <div key={item.id}>
                {item.type === 'note' 
                  ? renderNoteItem(item.data as Note)
                  : renderActivityItem(item.data as ActivityLogEntry)
                }
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
