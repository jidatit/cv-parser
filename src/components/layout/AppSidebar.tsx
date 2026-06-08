import { NavLink } from "react-router-dom";
import { useState, useEffect } from "react";
import { 
  Users, 
  Building2, 
  Briefcase,
  Globe,
  FileCheck,
  BarChart3,
  Settings,
  Target,
  GitBranch,
  Sparkles,
  CheckSquare,
  PanelLeftClose,
  PanelLeft,
  Wand2,
  AlertCircle,
  Inbox,
  PenTool,
  Radar
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/hooks/useLanguage";
import { useUserRole, UserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, isSameDay, isBefore } from "date-fns";

type NavItem = {
  title: string;
  url: string;
  icon: typeof BarChart3;
  minRole?: UserRole[];
  showAlert?: boolean;
};

const canSeeItem = (item: NavItem, role: UserRole): boolean => {
  if (!item.minRole) return true;
  if (!role) return !item.minRole;
  return item.minRole.includes(role);
};

interface NavItemComponentProps {
  item: NavItem;
  isCollapsed: boolean;
}

function NavItemComponent({ item, isCollapsed }: NavItemComponentProps) {
  const link = (
    <NavLink
      to={item.url}
      end={item.url === "/"}
      className={({ isActive }) =>
        `flex items-center ${isCollapsed ? "justify-center w-10 h-10 p-0 relative" : "px-3"} py-1.5 text-sm font-medium rounded-lg transition-colors focus:outline-none focus-visible:outline-none ${
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`
      }
    >
      {isCollapsed ? (
        <span className="relative">
          <item.icon className="h-4 w-4" />
          {item.showAlert && (
            <span className="absolute -top-2 -right-2 h-4 w-4 bg-destructive rounded-full border-2 border-card" />
          )}
        </span>
      ) : (
        <>
          <item.icon className="h-4 w-4 mr-3" />
          <span className="flex items-center gap-2 flex-1">
            {item.title}
            {item.showAlert && (
              <span className="h-2.5 w-2.5 bg-destructive rounded-full" />
            )}
          </span>
        </>
      )}
    </NavLink>
  );

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SidebarMenuButton asChild>
              {link}
            </SidebarMenuButton>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            {item.title}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return <SidebarMenuButton asChild>{link}</SidebarMenuButton>;
}

type NavGroup = {
  labelKey: string;
  items: NavItem[];
};

function getGroups(t: (key: string) => string): NavGroup[] {
  return [
    {
      labelKey: "nav.groupOverview",
      items: [
        { title: t("nav.dashboard"), url: "/", icon: BarChart3 },
      ],
    },
    {
      labelKey: "nav.groupData",
      items: [
        { title: t("nav.candidates"), url: "/candidates", icon: Users },
        { title: t("nav.clients"), url: "/clients", icon: Building2, minRole: ['admin', 'manager', 'user'] },
        { title: t("nav.jobs"), url: "/jobs", icon: Briefcase },
      ],
    },
    {
      labelKey: "nav.groupWorkflow",
      items: [
        { title: t("nav.pipeline"), url: "/pipeline", icon: Target, minRole: ['admin', 'manager', 'user'] },
        { title: t("nav.recruiting"), url: "/recruiting", icon: GitBranch, minRole: ['admin', 'manager', 'user'] },
        { title: t("nav.applications"), url: "/applications", icon: Inbox, minRole: ['admin', 'manager', 'user'] },
        { title: t("nav.tasks"), url: "/tasks", icon: CheckSquare, minRole: ['admin', 'manager', 'user'] },
        { title: t("nav.orders"), url: "/orders", icon: FileCheck, minRole: ['admin', 'manager', 'user'] },
      ],
    },
    {
      labelKey: "nav.groupAiMarketing",
      items: [
        { title: t("nav.aiMatches"), url: "/ai-matches", icon: Wand2, minRole: ['admin', 'manager', 'user'] },
        { title: t("nav.publicationManager"), url: "/publication-manager", icon: Globe, minRole: ['admin', 'manager', 'user'] },
        { title: t("nav.contentManager"), url: "/content-manager", icon: PenTool, minRole: ['admin', 'manager', 'user'] },
        { title: t("nav.marketRadar"), url: "/market-radar", icon: Radar, minRole: ['admin', 'manager', 'user'] },
      ],
    },
  ];
}

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const { t } = useLanguage();
  const { role, isAdmin, isManager } = useUserRole();
  const isCollapsed = state === "collapsed";
  const [hasDueTasks, setHasDueTasks] = useState(false);
  const [newApplicationsCount, setNewApplicationsCount] = useState(0);
  
  // Check for due tasks
  useEffect(() => {
    const checkDueTasks = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const today = startOfDay(new Date());
      
      const { data: tasks } = await supabase
        .from('tasks')
        .select('deadline, completed')
        .eq('completed', false)
        .not('deadline', 'is', null);
      
      if (tasks) {
        const hasDue = tasks.some(task => {
          if (!task.deadline) return false;
          const deadline = startOfDay(new Date(task.deadline));
          return isSameDay(deadline, today) || isBefore(deadline, today);
        });
        setHasDueTasks(hasDue);
      } else {
        setHasDueTasks(false);
      }
    };
    
    checkDueTasks();
    
    const channel = supabase
      .channel('tasks-sidebar-alert')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => { checkDueTasks(); })
      .subscribe();
    
    const interval = setInterval(checkDueTasks, 60000);
    
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  // Check for new applications
  useEffect(() => {
    const checkNewApplications = async () => {
      const { count } = await supabase
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'neu');
      setNewApplicationsCount(count || 0);
    };

    checkNewApplications();

    const channel = supabase
      .channel('applications-sidebar-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => { checkNewApplications(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Build groups with alerts
  const groups = getGroups(t).map(group => ({
    ...group,
    items: group.items.map(item => ({
      ...item,
      showAlert: (item.url === '/tasks' && hasDueTasks) || (item.url === '/applications' && newApplicationsCount > 0),
    })),
  }));
  
  // Editable branding state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingSubtitle, setIsEditingSubtitle] = useState(false);
  const [brandTitle, setBrandTitle] = useState(() => localStorage.getItem('crm_brand_title') || 'Headhunter CRM');
  const [brandSubtitle, setBrandSubtitle] = useState(() => localStorage.getItem('crm_brand_subtitle') || 'Professional ATS');
  const [editTitle, setEditTitle] = useState(brandTitle);
  const [editSubtitle, setEditSubtitle] = useState(brandSubtitle);

  const handleTitleSave = () => { setBrandTitle(editTitle); localStorage.setItem('crm_brand_title', editTitle); setIsEditingTitle(false); };
  const handleSubtitleSave = () => { setBrandSubtitle(editSubtitle); localStorage.setItem('crm_brand_subtitle', editSubtitle); setIsEditingSubtitle(false); };
  const handleTitleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') { setEditTitle(brandTitle); setIsEditingTitle(false); } };
  const handleSubtitleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSubtitleSave(); if (e.key === 'Escape') { setEditSubtitle(brandSubtitle); setIsEditingSubtitle(false); } };
  
  const canSeeAnalytics = isAdmin || isManager;
  const canSeeSettings = role !== 'viewer';

  const toggleButton = (
    <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-8 w-8 shrink-0">
      {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </Button>
  );

  const analyticsLink = (
    <NavLink
      to="/analytics"
      className={`flex items-center ${isCollapsed ? "justify-center w-10 h-10 p-0" : "px-3"} py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors focus:outline-none focus-visible:outline-none`}
    >
      <Sparkles className={`h-4 w-4 ${isCollapsed ? "" : "mr-3"}`} />
      {!isCollapsed && t("nav.analytics")}
    </NavLink>
  );

  const settingsLink = (
    <NavLink
      to="/settings"
      className={`flex items-center ${isCollapsed ? "justify-center w-10 h-10 p-0" : "px-3"} py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors focus:outline-none focus-visible:outline-none`}
    >
      <Settings className={`h-4 w-4 ${isCollapsed ? "" : "mr-3"}`} />
      {!isCollapsed && t("nav.settings")}
    </NavLink>
  );

  const wrapWithTooltip = (content: React.ReactNode, label: string) => (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <Sidebar 
      className={`${isCollapsed ? "w-16" : "w-64"} bg-card border-r border-border transition-all duration-300`}
      collapsible="icon"
    >
      <SidebarContent>
        {/* Header / Branding */}
        <div className={`p-3 border-b border-border flex items-center ${isCollapsed ? "justify-center" : "justify-between"}`}>
          {!isCollapsed && (
            <div className="flex-1 min-w-0 mr-2">
              {isEditingTitle ? (
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onBlur={handleTitleSave} onKeyDown={handleTitleKeyDown} className="h-7 text-lg font-semibold p-1" autoFocus />
              ) : (
                <h2 className="text-lg font-semibold text-foreground cursor-pointer hover:text-primary truncate" onDoubleClick={() => { setEditTitle(brandTitle); setIsEditingTitle(true); }} title="Doppelklick zum Bearbeiten">{brandTitle}</h2>
              )}
              {isEditingSubtitle ? (
                <Input value={editSubtitle} onChange={(e) => setEditSubtitle(e.target.value)} onBlur={handleSubtitleSave} onKeyDown={handleSubtitleKeyDown} className="h-5 text-sm p-1 mt-1" autoFocus />
              ) : (
                <p className="text-sm text-muted-foreground cursor-pointer hover:text-foreground truncate" onDoubleClick={() => { setEditSubtitle(brandSubtitle); setIsEditingSubtitle(true); }} title="Doppelklick zum Bearbeiten">{brandSubtitle}</p>
              )}
            </div>
          )}
          {isCollapsed ? wrapWithTooltip(toggleButton, "Show sidebar") : wrapWithTooltip(toggleButton, "Hide sidebar")}
        </div>
        
        {/* Navigation Groups */}
        {groups.map((group, groupIndex) => {
          const visibleItems = group.items.filter(item => canSeeItem(item, role));
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.labelKey}>
              {groupIndex > 0 && <Separator className="my-0.5" />}
              <SidebarGroup className="p-0">
                {!isCollapsed && (
                  <SidebarGroupLabel className="px-6 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t(group.labelKey)}
                  </SidebarGroupLabel>
                )}
                <SidebarGroupContent>
                  <SidebarMenu className={`${isCollapsed ? "px-0 items-center" : "px-4"} space-y-0.5`}>
                    {visibleItems.map((item) => (
                      <SidebarMenuItem key={item.url} className={isCollapsed ? "w-full flex justify-center" : ""}>
                        <NavItemComponent item={item} isCollapsed={isCollapsed} />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </div>
          );
        })}

        {/* Bottom: Analytics + Settings */}
        {(canSeeAnalytics || canSeeSettings) && (
          <>
            <Separator className="my-0.5" />
            <div className={`${isCollapsed ? "px-0 flex flex-col items-center" : "px-4"} pb-2 pt-1 space-y-0.5`}>
              {canSeeAnalytics && (
                isCollapsed ? wrapWithTooltip(analyticsLink, t("nav.analytics")) : analyticsLink
              )}
              {canSeeSettings && (
                isCollapsed ? wrapWithTooltip(settingsLink, t("nav.settings")) : settingsLink
              )}
            </div>
          </>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
