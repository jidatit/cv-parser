import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useTheme } from "next-themes";
import { useLanguage } from "@/hooks/useLanguage";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  User,
  Building2,
  Mail,
  Plus,
  Save,
  Trash2,
  Moon,
  Sun,
  Globe,
  Keyboard,
  Users,
  LogOut,
  GitBranch,
  Database,
  Settings as SettingsIcon,
  Download,
  Camera,
  Archive,
} from "lucide-react";
import { ArchiveManager } from "@/components/admin/ArchiveManager";
import { supabase } from "@/integrations/supabase/client";
import { StatusManager } from "@/components/StatusManager";
import { HonorarBracket, defaultHonorarStructure } from "@/lib/honorarUtils";
import { ShortcutSettings } from "@/components/ShortcutSettings";
import { UserManagement } from "@/components/UserManagement";
import { AdminUserTable } from "@/components/admin/AdminUserTable";
import { AdminStats } from "@/components/admin/AdminStats";
import { AccessLogsTable } from "@/components/admin/AccessLogsTable";
import { useAuth } from "@/contexts/AuthContext";
import { useEnrichment } from "@/contexts/EnrichmentContext";

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const getNavItems = (t: (key: string) => string): NavItem[] => [
  { id: "konto", label: t("nav.account"), icon: User },
  { id: "darstellung", label: t("nav.appearance"), icon: Moon },
  { id: "unternehmen", label: t("nav.company"), icon: Building2 },
  { id: "workflow", label: t("nav.workflow"), icon: GitBranch },
  { id: "kommunikation", label: t("nav.communication"), icon: Mail },
  { id: "daten", label: t("nav.data"), icon: Database },
  { id: "archiv", label: t("nav.archive"), icon: Archive },
  { id: "admin", label: t("nav.admin"), icon: Users, adminOnly: true },
];

export default function Settings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const { theme, setTheme } = useTheme();
  const { t, currentLanguage, changeLanguage } = useLanguage();
  const { userProfile, refreshProfile } = useAuth();
  const [activeSection, setActiveSection] = useState("konto");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [companyDataLoaded, setCompanyDataLoaded] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // Avatar upload state
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Profile State
  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "+41 44 123 45 67",
    position: "Senior Recruiter",
  });

  // Company State
  const [companyData, setCompanyData] = useState({
    name: "BeckettStone",
    industry: "Recruitment Consulting",
    website: "https://beckettstone.ch",
    address: "Musterstrasse 123, 8000 Zürich",
    phone: "+41 44 123 45 67",
    email: "info@beckettstone.ch",
  });

  // Pipeline States
  const [recruitingStages, setRecruitingStages] = useState([
    { id: "exchange_pending", label: "Exchange Pending" },
    { id: "documents_open", label: "Documents Open" },
    { id: "documents_sent", label: "Documents Sent" },
    { id: "ready2push", label: "Ready2Push" },
  ]);
  const [matchStages, setMatchStages] = useState([
    { id: "ready2send", label: "Ready2Send" },
    { id: "presented", label: "Presented" },
    { id: "ready2share", label: "Ready2Share" },
    { id: "shared", label: "Shared" },
    { id: "inquiry", label: "Inquiry" },
    { id: "invitation", label: "Invitation" },
    { id: "interview1", label: "Interview 1" },
    { id: "interview2", label: "Interview 2" },
    { id: "trial", label: "Trial Day" },
    { id: "offered", label: "Offered" },
    { id: "placed", label: "Placed" },
    { id: "rejected", label: "Rejected" },
  ]);

  // Email & Notification Settings
  const [emailSettings, setEmailSettings] = useState({
    signature: "Best regards\nYour Recruiting Team\nBeckettStone AG",
    autoReply: false,
    ccMyself: true,
  });
  const [notifications, setNotifications] = useState({
    newCandidate: true,
    newJob: true,
    statusChange: true,
    emailReminders: true,
    weeklyReport: false,
  });

  // Rejection Reasons
  const [rejectionReasons, setRejectionReasons] = useState<
    Array<{ id: string; reason: string }>
  >([]);
  const [newRejectionReason, setNewRejectionReason] = useState("");
  const [loadingReasons, setLoadingReasons] = useState(false);

  // Status configurations
  const [candidateStatuses, setCandidateStatuses] = useState([
    { id: "nd", label: "N/D" },
    { id: "active", label: "Active" },
    { id: "passive", label: "Passive" },
    { id: "not_available", label: "Not available" },
    { id: "placed", label: "Placed" },
    { id: "archived", label: "Archived" },
  ]);
  const [clientStatuses, setClientStatuses] = useState([
    { id: "nd", label: "N/D" },
    { id: "offen", label: "Offen" },
    { id: "nicht_offen", label: "Nicht offen" },
    { id: "partner", label: "Partner" },
  ]);
  const [jobStatuses, setJobStatuses] = useState([
    { id: "nd", label: "N/D" },
    { id: "active", label: "Active" },
    { id: "not_available", label: "Not available" },
     { id: "nicht_offen", label: "Nicht offen" },
    { id: "offen", label: "Offen" },
    { id: "assignment", label: "Assignment" },
    { id: "placed", label: "Placed" },
    { id: "archived", label: "Archived" },
  ]);

  // Source Contacts
  const [sourceContacts, setSourceContacts] = useState([
    { id: "nicola_lube", label: "Nicola Lube" },
    { id: "sebastian_jansche", label: "Sebastian Jansche" },
    { id: "fabian_jansche", label: "Fabian Jansche" },
    { id: "celine_glabonjat", label: "Celine Glabonjat" },
    { id: "davide_di_cesare", label: "Davide di Cesare" },
    { id: "jacqueline_soel", label: "Jacqueline Soel" },
  ]);

  // Honorar Structure
  const [honorarStructure, setHonorarStructure] = useState<HonorarBracket[]>(
    defaultHonorarStructure,
  );

  // Workflow Rules
  const [workflowRules, setWorkflowRules] = useState({
    pushReminderEnabled: false,
    pushReminderDays: 10.5, // 1.5 weeks = 10.5 days
  });

  // Enrichment from global context (survives navigation)
  const { enriching, enrichProgress, startEnrichment } = useEnrichment();

  // Sync profileData from userProfile - load first_name and last_name from DB
  useEffect(() => {
    const loadProfileData = async () => {
      if (!userId) return;

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("first_name, last_name, email, position, phone")
          .eq("id", userId)
          .single();

        if (error) throw error;

        if (data) {
          setProfileData((prev) => ({
            ...prev,
            firstName: data.first_name || "",
            lastName: data.last_name || "",
            email: data.email || "",
            position: (data as any).position || prev.position,
            phone: (data as any).phone || prev.phone,
          }));
          setProfileLoaded(true);
        }
      } catch (error) {
        console.error("Error loading profile:", error);
        setProfileLoaded(true); // Set to true anyway to prevent blocking
      }
    };

    loadProfileData();
  }, [userId]);

  // Format phone number: XXX XXX XX XX
  const formatPhoneNumber = (value: string): string => {
    // Remove all non-digit characters except +
    const cleaned = value.replace(/[^\d+]/g, "");

    // If starts with +, keep it and format the rest
    if (cleaned.startsWith("+")) {
      const prefix = cleaned.slice(0, 3); // e.g., +41
      const rest = cleaned.slice(3).replace(/\D/g, "");

      if (rest.length === 0) return prefix;
      if (rest.length <= 3) return `${prefix} ${rest}`;
      if (rest.length <= 6)
        return `${prefix} ${rest.slice(0, 3)} ${rest.slice(3)}`;
      if (rest.length <= 8)
        return `${prefix} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(
          6,
        )}`;
      return `${prefix} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(
        6,
        8,
      )} ${rest.slice(8, 10)}`;
    }

    // Without prefix, just format digits
    const digits = cleaned.replace(/\D/g, "");
    if (digits.length === 0) return "";
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    if (digits.length <= 8)
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(
      6,
      8,
    )} ${digits.slice(8, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setProfileData((prev) => ({ ...prev, phone: formatted }));
  };

  useEffect(() => {
    loadConfigurations();
    loadRejectionReasons();
  }, []);

  // Default status configurations
  const defaultCandidateStatuses = [
    { id: "nd", label: "N/D" },
    { id: "active", label: "Active" },
    { id: "passive", label: "Passive" },
    { id: "not_available", label: "Not available" },
    { id: "placed", label: "Placed" },
    { id: "archived", label: "Archived" },
  ];
  const defaultClientStatuses = [
    { id: "nd", label: "N/D" },
    { id: "offen", label: "Offen" },
    { id: "nicht_offen", label: "Nicht offen" },
    { id: "partner", label: "Partner" },
    { id: "archived", label: "Archived" },
  ];
  const defaultJobStatuses = [
    { id: "nd", label: "N/D" },
    { id: "active", label: "Active" },
    { id: "not_available", label: "Not available" },
    { id: "nicht_offen", label: "Nicht offen" },
    { id: "offen", label: "Offen" },
    { id: "assignment", label: "Assignment" },
    { id: "placed", label: "Placed" },
    { id: "archived", label: "Archived" },
  ];

  const loadConfigurations = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data, error } = await supabase
        .from("status_configurations")
        .select("*")
        .eq("user_id", user.id);

      if (error) throw error;

      // Update status configurations to new defaults if they exist but are outdated
      const statusConfigs = ["candidate_status", "client_status", "job_status"];
      const defaultValues: Record<string, any> = {
        candidate_status: defaultCandidateStatuses,
        client_status: defaultClientStatuses,
        job_status: defaultJobStatuses,
      };
      const setters: Record<string, (val: any) => void> = {
        candidate_status: setCandidateStatuses,
        client_status: setClientStatuses,
        job_status: setJobStatuses,
      };

      // Sync status configurations with defaults
      for (const configType of statusConfigs) {
        const existing = data?.find((c) => c.config_type === configType);
        const defaultVal = defaultValues[configType];

        if (!existing) {
          // No config exists, save defaults
          await supabase.from("status_configurations").insert({
            user_id: user.id,
            config_type: configType as any,
            config_value: defaultVal,
          });
          setters[configType](defaultVal);
        } else {
          // Config exists, update to new defaults
          await supabase
            .from("status_configurations")
            .update({
              config_value: defaultVal,
            })
            .eq("id", existing.id);
          setters[configType](defaultVal);
        }
      }

      if (data && data.length > 0) {
        data.forEach((config) => {
          const value = config.config_value as any;
          switch (config.config_type) {
            case "candidate_status":
              setCandidateStatuses(value);
              break;
            case "client_status":
              setClientStatuses(value);
              break;
            case "job_status":
              setJobStatuses(value);
              break;
            case "recruiting_stage":
              setRecruitingStages(value);
              break;
            case "match_stage":
              setMatchStages(value);
              break;
            case "honorar_structure":
              setHonorarStructure(value);
              break;
            case "source_contacts":
              setSourceContacts(value);
              break;
            case "workflow_rules":
              setWorkflowRules(value);
              break;
            case "company_settings":
              setCompanyData(value);
              setCompanyDataLoaded(true);
              break;
          }
        });
      }
      // Mark company data as loaded even if no entry exists (use defaults)
      if (!data?.some((c) => c.config_type === "company_settings")) {
        setCompanyDataLoaded(true);
      }
    } catch (error) {
      console.error("Error loading configurations:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadRejectionReasons = async () => {
    setLoadingReasons(true);
    try {
      const { data, error } = await supabase
        .from("rejection_reasons")
        .select("*")
        .order("created_at");
      if (error) throw error;
      setRejectionReasons(data || []);
    } catch (error) {
      console.error("Error fetching rejection reasons:", error);
    } finally {
      setLoadingReasons(false);
    }
  };

  const saveConfiguration = async (
    configType:
      | "candidate_status"
      | "client_status"
      | "job_status"
      | "recruiting_stage"
      | "match_stage"
      | "honorar_structure"
      | "source_contacts"
      | "workflow_rules"
      | "company_settings",
    configValue: any,
  ) => {
    if (!userId) return;
    try {
      const { error } = await supabase.from("status_configurations").upsert(
        {
          user_id: userId,
          config_type: configType,
          config_value: configValue,
        },
        { onConflict: "user_id,config_type" },
      );
      if (error) throw error;
    } catch (error) {
      console.error("Error saving configuration:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.configSaveError"),
        variant: "destructive",
      });
    }
  };

  // Auto-save company settings on changes (debounced)
  useEffect(() => {
    if (!userId || !companyDataLoaded) return;

    const timer = setTimeout(() => {
      saveConfiguration("company_settings", companyData);
    }, 800);
    return () => clearTimeout(timer);
  }, [companyData, userId, companyDataLoaded]);

  const saveProfile = async () => {
    if (!userId) return;
    try {
      const fullName =
        `${profileData.firstName} ${profileData.lastName}`.trim();
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: profileData.firstName,
          last_name: profileData.lastName,
          full_name: fullName,
          position: profileData.position,
          phone: profileData.phone,
        })
        .eq("id", userId);

      if (error) throw error;

      // Refresh the profile in context
      await refreshProfile();
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.profileSaveError"),
        variant: "destructive",
      });
    }
  };

  // Auto-save profile on changes (debounced) - only after initial load
  useEffect(() => {
    if (!userId || !profileLoaded) return;
    // Don't save if all are empty (initial state)
    if (
      !profileData.firstName &&
      !profileData.lastName &&
      !profileData.position &&
      !profileData.phone
    )
      return;

    const timer = setTimeout(() => {
      saveProfile();
    }, 800);
    return () => clearTimeout(timer);
  }, [
    profileData.firstName,
    profileData.lastName,
    profileData.position,
    profileData.phone,
    userId,
    profileLoaded,
  ]);

  const handleSave = async (section: string) => {
    if (section === "Unternehmen" && userId) {
      // Save company data to status_configurations
      try {
        const { error } = await supabase.from("status_configurations").upsert(
          {
            user_id: userId,
            config_type: "company_settings" as never,
            config_value: companyData,
          },
          { onConflict: "user_id,config_type" },
        );
        if (error) throw error;
        toast({
          title: t("toast.saved"),
          description: t("toast.sectionUpdated", { section }),
        });
      } catch (error) {
        console.error("Error saving company data:", error);
        toast({
          title: t("toast.error"),
          description: t("toast.saveError"),
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: t("toast.saved"),
        description: t("toast.sectionUpdated", { section }),
      });
    }
  };

  const handleAvatarUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !userId) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: t("toast.error"),
        description: t("toast.selectImageFile"),
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t("toast.error"),
        description: t("toast.fileTooLarge"),
        variant: "destructive",
      });
      return;
    }

    setUploadingAvatar(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/avatar.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("profile-avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("profile-avatars")
        .getPublicUrl(fileName);

      // Update profile with avatar URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("id", userId);

      if (updateError) throw updateError;

      await refreshProfile();
      toast({
        title: t("common.success"),
        description: t("toast.avatarUploadSuccess"),
      });
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.avatarUploadError"),
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  };

  const handleCandidateStatusUpdate = async (
    statuses: any[],
    changeInfo?: { oldValue: string; newValue: string; id: string },
  ) => {
    setCandidateStatuses(statuses);
    await saveConfiguration("candidate_status", statuses);
    if (changeInfo && userId) {
      await supabase
        .from("candidates")
        .update({ status: changeInfo.newValue })
        .eq("user_id", userId)
        .eq("status", changeInfo.oldValue);
    }
  };

  const handleClientStatusUpdate = async (
    statuses: any[],
    changeInfo?: { oldValue: string; newValue: string; id: string },
  ) => {
    setClientStatuses(statuses);
    await saveConfiguration("client_status", statuses);
    if (changeInfo && userId) {
      await supabase
        .from("clients")
        .update({ status: changeInfo.newValue })
        .eq("user_id", userId)
        .eq("status", changeInfo.oldValue);
    }
  };

  const handleJobStatusUpdate = async (
    statuses: any[],
    changeInfo?: { oldValue: string; newValue: string; id: string },
  ) => {
    setJobStatuses(statuses);
    await saveConfiguration("job_status", statuses);
    if (changeInfo && userId) {
      await supabase
        .from("jobs")
        .update({ status: changeInfo.newValue })
        .eq("user_id", userId)
        .eq("status", changeInfo.oldValue);
    }
  };

  const handleRecruitingStagesUpdate = async (
    stages: any[],
    changeInfo?: { oldValue: string; newValue: string; id: string },
  ) => {
    setRecruitingStages(stages);
    await saveConfiguration("recruiting_stage", stages);
    if (changeInfo && userId) {
      await supabase
        .from("candidates")
        .update({ recruiting_status: changeInfo.newValue })
        .eq("user_id", userId)
        .eq("recruiting_status", changeInfo.oldValue);
    }
  };

  const handleMatchStagesUpdate = async (
    stages: any[],
    changeInfo?: { oldValue: string; newValue: string; id: string },
  ) => {
    setMatchStages(stages);
    await saveConfiguration("match_stage", stages);
    if (changeInfo && userId) {
      await supabase
        .from("placements")
        .update({ stage: changeInfo.newValue })
        .eq("user_id", userId)
        .eq("stage", changeInfo.oldValue);
    }
  };

  const handleSourceContactsUpdate = async (
    contacts: any[],
    changeInfo?: { oldValue: string; newValue: string; id: string },
  ) => {
    setSourceContacts(contacts);
    await saveConfiguration("source_contacts", contacts);
    if (changeInfo && userId) {
      await supabase
        .from("candidates")
        .update({ source_contact: changeInfo.newValue })
        .eq("user_id", userId)
        .eq("source_contact", changeInfo.oldValue);
    }
  };

  const addRejectionReason = async () => {
    if (!newRejectionReason.trim()) return;
    try {
      const { data, error } = await supabase
        .from("rejection_reasons")
        .insert({ reason: newRejectionReason })
        .select()
        .single();
      if (error) throw error;
      setRejectionReasons([...rejectionReasons, data]);
      setNewRejectionReason("");
      toast({
        title: t("toast.added"),
        description: t("toast.reasonAdded", { reason: newRejectionReason }),
      });
    } catch (error) {
      toast({ title: t("toast.error"), variant: "destructive" });
    }
  };

  const removeRejectionReason = async (id: string, reason: string) => {
    try {
      const { error } = await supabase
        .from("rejection_reasons")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setRejectionReasons(rejectionReasons.filter((r) => r.id !== id));
      toast({
        title: t("toast.removed"),
        description: t("toast.reasonRemoved", { reason }),
      });
    } catch (error) {
      toast({ title: t("toast.error"), variant: "destructive" });
    }
  };

  const navItems = getNavItems(t);
  const filteredNavItems = navItems.filter(
    (item) => !item.adminOnly || isAdmin,
  );

  if (loading) {
    return (
      <div className="p-6">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeSection) {
      case "konto":
        return (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("settings.profile")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Avatar Upload */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={userProfile?.avatar_url || undefined} />
                      <AvatarFallback className="text-lg bg-primary text-primary-foreground">
                        {profileData.firstName || profileData.lastName
                          ? `${profileData.firstName?.[0] || ""}${
                              profileData.lastName?.[0] || ""
                            }`.toUpperCase()
                          : "U"}
                      </AvatarFallback>
                    </Avatar>
                    <label
                      htmlFor="avatar-upload-input"
                      className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors cursor-pointer"
                    >
                      <Camera className="h-3 w-3" />
                    </label>
                  </div>
                  <input
                    id="avatar-upload-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {profileData.firstName || profileData.lastName
                        ? `${profileData.firstName} ${profileData.lastName}`.trim()
                        : t("settings.nameNotSet")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {profileData.email}
                    </p>
                    {uploadingAvatar && (
                      <p className="text-xs text-muted-foreground">
                        {t("common.uploading")}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("common.firstName")}</Label>
                    <Input
                      value={profileData.firstName}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          firstName: e.target.value,
                        })
                      }
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("common.lastName")}</Label>
                    <Input
                      value={profileData.lastName}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          lastName: e.target.value,
                        })
                      }
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("common.position")}</Label>
                    <Input
                      value={profileData.position}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          position: e.target.value,
                        })
                      }
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("common.phone")}</Label>
                    <Input
                      value={profileData.phone}
                      onChange={handlePhoneChange}
                      className="h-8"
                      placeholder="+41 XXX XXX XX XX"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">{t("common.email")}</Label>
                    <Input
                      type="email"
                      value={profileData.email}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          email: e.target.value,
                        })
                      }
                      className="h-8"
                      disabled
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("settings.changePassword")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("settings.currentPassword")}
                  </Label>
                  <Input type="password" className="h-8" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("settings.newPassword")}
                    </Label>
                    <Input type="password" className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("settings.confirmNewPassword")}
                    </Label>
                    <Input type="password" className="h-8" />
                  </div>
                </div>
                <Button size="sm" onClick={() => handleSave("Passwort")}>
                  {t("common.change")}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("settings.security")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {t("settings.twoFactor")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.twoFactorDesc")}
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    {t("common.enable")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-destructive/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-destructive">
                  {t("settings.signOut")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button variant="destructive" size="sm" onClick={handleSignOut}>
                  <LogOut className="mr-1.5 h-3.5 w-3.5" />
                  {t("settings.signOut")}
                </Button>
              </CardContent>
            </Card>
          </div>
        );

      case "darstellung":
        return (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("settings.design")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {t("settings.darkMode")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.darkModeDesc")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Sun
                      className={`h-4 w-4 ${
                        theme === "light"
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    />
                    <Switch
                      checked={theme === "dark"}
                      onCheckedChange={(checked) =>
                        setTheme(checked ? "dark" : "light")
                      }
                    />
                    <Moon
                      className={`h-4 w-4 ${
                        theme === "dark"
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    />
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <p className="text-sm font-medium">
                      {t("settings.language")}
                    </p>
                  </div>
                  <Select
                    value={currentLanguage}
                    onValueChange={changeLanguage}
                  >
                    <SelectTrigger className="w-32 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="it">Italiano</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Keyboard className="h-4 w-4" />
                  {t("settings.keyboardShortcuts")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ShortcutSettings />
              </CardContent>
            </Card>
          </div>
        );

      case "unternehmen":
        return (
          <Card className="max-w-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t("settings.companyData")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("settings.companyName")}</Label>
                  <Input
                    value={companyData.name}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, name: e.target.value })
                    }
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("common.industry")}</Label>
                  <Input
                    value={companyData.industry}
                    onChange={(e) =>
                      setCompanyData({
                        ...companyData,
                        industry: e.target.value,
                      })
                    }
                    className="h-8"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("common.website")}</Label>
                <Input
                  type="url"
                  value={companyData.website}
                  onChange={(e) =>
                    setCompanyData({ ...companyData, website: e.target.value })
                  }
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("common.address")}</Label>
                <Input
                  value={companyData.address}
                  onChange={(e) =>
                    setCompanyData({ ...companyData, address: e.target.value })
                  }
                  className="h-8"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("common.phone")}</Label>
                  <Input
                    value={companyData.phone}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, phone: e.target.value })
                    }
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("common.email")}</Label>
                  <Input
                    type="email"
                    value={companyData.email}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, email: e.target.value })
                    }
                    className="h-8"
                  />
                </div>
              </div>
              <Button size="sm" onClick={() => handleSave("Unternehmen")}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {t("common.save")}
              </Button>
            </CardContent>
          </Card>
        );

      case "workflow":
        return (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-3">
              <StatusManager
                title={t("settings.candidateStatuses")}
                description={t("settings.candidateStatusesDesc")}
                statuses={candidateStatuses}
                onUpdate={handleCandidateStatusUpdate}
              />
              <StatusManager
                title={t("settings.clientStatuses")}
                description={t("settings.clientStatusesDesc")}
                statuses={clientStatuses}
                onUpdate={handleClientStatusUpdate}
              />
              <StatusManager
                title={t("settings.jobStatuses")}
                description={t("settings.jobStatusesDesc")}
                statuses={jobStatuses}
                onUpdate={handleJobStatusUpdate}
              />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <StatusManager
                title={t("settings.recruitingPipeline")}
                description={t("settings.recruitingPipelineDesc")}
                statuses={recruitingStages}
                onUpdate={handleRecruitingStagesUpdate}
              />
              <StatusManager
                title={t("settings.matchPipeline")}
                description={t("settings.matchPipelineDesc")}
                statuses={matchStages}
                onUpdate={handleMatchStagesUpdate}
              />
            </div>

            {/* Source Contacts */}
            <StatusManager
              title={t("settings.sourceContacts")}
              description={t("settings.sourceContactsDesc")}
              statuses={sourceContacts}
              onUpdate={handleSourceContactsUpdate}
            />
            {/* Rejection Reasons */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("settings.rejectionReasons")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("settings.rejectionReasonsDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder={t("settings.newRejectionReason")}
                    value={newRejectionReason}
                    onChange={(e) => setNewRejectionReason(e.target.value)}
                    onKeyPress={(e) =>
                      e.key === "Enter" && addRejectionReason()
                    }
                    className="h-8"
                  />
                  <Button size="sm" onClick={addRejectionReason}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {loadingReasons ? (
                  <p className="text-xs text-muted-foreground">
                    {t("common.loading")}
                  </p>
                ) : rejectionReasons.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("settings.noRejectionReasons")}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {rejectionReasons.map((reason) => (
                      <Badge
                        key={reason.id}
                        variant="secondary"
                        className="gap-1.5 px-2 py-0.5 text-xs"
                      >
                        {reason.reason}
                        <button
                          className="hover:text-destructive"
                          onClick={() =>
                            removeRejectionReason(reason.id, reason.reason)
                          }
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Honorar Structure */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("settings.honorar")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("settings.honorarDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {honorarStructure.map((bracket, index) => (
                  <div
                    key={bracket.id}
                    className="grid grid-cols-4 gap-3 items-end"
                  >
                    <div className="space-y-1">
                      <Label className="text-xs">{t("settings.from")}</Label>
                      <Input
                        type="number"
                        value={bracket.min}
                        onChange={(e) => {
                          const updated = [...honorarStructure];
                          updated[index].min = parseInt(e.target.value) || 0;
                          setHonorarStructure(updated);
                        }}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("settings.to")}</Label>
                      <Input
                        type="number"
                        value={bracket.max || ""}
                        placeholder="∞"
                        onChange={(e) => {
                          const updated = [...honorarStructure];
                          updated[index].max = e.target.value
                            ? parseInt(e.target.value)
                            : null;
                          setHonorarStructure(updated);
                        }}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">%</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={bracket.percentage}
                        onChange={(e) => {
                          const updated = [...honorarStructure];
                          updated[index].percentage =
                            parseFloat(e.target.value) || 0;
                          setHonorarStructure(updated);
                        }}
                        className="h-8"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setHonorarStructure(
                          honorarStructure.filter((_, i) => i !== index),
                        )
                      }
                      disabled={honorarStructure.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const last =
                        honorarStructure[honorarStructure.length - 1];
                      setHonorarStructure([
                        ...honorarStructure,
                        {
                          id: Date.now().toString(),
                          min: last.max ? last.max + 1 : last.min + 20000,
                          max: null,
                          percentage: 30,
                        },
                      ]);
                    }}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t("common.add")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await saveConfiguration(
                        "honorar_structure",
                        honorarStructure,
                      );
                      toast({ title: t("toast.saved") });
                    }}
                  >
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {t("common.save")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Workflow Automation Rules */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("settings.workflowRules") || "Automatisierungsregeln"}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("settings.workflowRulesDesc") ||
                    "Automatische Aktionen basierend auf bestimmten Ereignissen"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      {t("settings.pushReminder") || "Push-Erinnerung"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.pushReminderDesc") ||
                        "Erstellt automatisch eine Aufgabe im Ordner 'Pushen' wenn ein Kandidat gepushed wird"}
                    </p>
                  </div>
                  <Switch
                    checked={workflowRules.pushReminderEnabled}
                    onCheckedChange={async (checked) => {
                      const updated = {
                        ...workflowRules,
                        pushReminderEnabled: checked,
                      };
                      setWorkflowRules(updated);
                      await saveConfiguration("workflow_rules", updated);
                      toast({ title: t("toast.saved") });
                    }}
                  />
                </div>
                {workflowRules.pushReminderEnabled && (
                  <div className="flex items-center gap-3 pl-3">
                    <Label className="text-xs whitespace-nowrap">
                      {t("settings.reminderAfter") || "Erinnerung nach"}:
                    </Label>
                    <Select
                      value={workflowRules.pushReminderDays.toString()}
                      onValueChange={async (value) => {
                        const updated = {
                          ...workflowRules,
                          pushReminderDays: parseFloat(value),
                        };
                        setWorkflowRules(updated);
                        await saveConfiguration("workflow_rules", updated);
                        toast({ title: t("toast.saved") });
                      }}
                    >
                      <SelectTrigger className="w-[140px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">
                          {t("settings.oneWeek") || "1 Woche"}
                        </SelectItem>
                        <SelectItem value="10.5">
                          {t("settings.oneAndHalfWeeks") || "1.5 Wochen"}
                        </SelectItem>
                        <SelectItem value="14">
                          {t("settings.twoWeeks") || "2 Wochen"}
                        </SelectItem>
                        <SelectItem value="21">
                          {t("settings.threeWeeks") || "3 Wochen"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case "kommunikation":
        return (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("settings.email")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("settings.signature")}</Label>
                  <Textarea
                    rows={4}
                    value={emailSettings.signature}
                    onChange={(e) =>
                      setEmailSettings({
                        ...emailSettings,
                        signature: e.target.value,
                      })
                    }
                    className="text-sm"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm">{t("settings.autoReply")}</p>
                  <Switch
                    checked={emailSettings.autoReply}
                    onCheckedChange={(checked) =>
                      setEmailSettings({ ...emailSettings, autoReply: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm">{t("settings.ccMyself")}</p>
                  <Switch
                    checked={emailSettings.ccMyself}
                    onCheckedChange={(checked) =>
                      setEmailSettings({ ...emailSettings, ccMyself: checked })
                    }
                  />
                </div>
                <Button size="sm" onClick={() => handleSave("E-Mail")}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {t("common.save")}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("settings.notifications")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: "newCandidate", label: t("settings.newCandidates") },
                  { key: "newJob", label: t("settings.newJobs") },
                  { key: "statusChange", label: t("settings.statusChanges") },
                  {
                    key: "emailReminders",
                    label: t("settings.emailReminders"),
                  },
                  { key: "weeklyReport", label: t("settings.weeklyReport") },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <p className="text-sm">{label}</p>
                    <Switch
                      checked={notifications[key as keyof typeof notifications]}
                      onCheckedChange={(checked) =>
                        setNotifications({ ...notifications, [key]: checked })
                      }
                    />
                  </div>
                ))}
                <Button
                  size="sm"
                  onClick={() => handleSave("Benachrichtigungen")}
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {t("common.save")}
                </Button>
              </CardContent>
            </Card>
          </div>
        );

      case "daten":
        return (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("settings.export")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    CSV
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Excel
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("settings.import")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm">
                  {t("settings.importFile")}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("settings.backup")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm">
                  {t("settings.createBackup")}
                </Button>
              </CardContent>
            </Card>

            {/* Restructure External Job Content */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Stellen-Content restrukturieren
                </CardTitle>
                <CardDescription className="text-xs">
                  Externe Stellen mit Fliesstext-Beschreibung automatisch in Aufgaben, Anforderungen und Benefits aufteilen (Batch von 10)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    toast({ title: "Restrukturierung gestartet...", description: "Bitte warten, dies kann einige Sekunden dauern." });
                    try {
                      const { data, error } = await supabase.functions.invoke('restructure-job-content');
                      if (error) throw error;
                      if (data?.success) {
                        toast({
                          title: "Restrukturierung abgeschlossen",
                          description: data.message,
                        });
                      } else {
                        toast({
                          title: "Fehler",
                          description: data?.error || "Unbekannter Fehler",
                          variant: "destructive",
                        });
                      }
                    } catch (err) {
                      console.error('Restructure error:', err);
                      toast({
                        title: "Fehler",
                        description: "Restrukturierung fehlgeschlagen",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <Database className="mr-1.5 h-3.5 w-3.5" />
                  Externe Stellen restrukturieren
                </Button>
              </CardContent>
            </Card>

            {/* Batch Enrich Jobs */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Jobs anreichern
                </CardTitle>
                <CardDescription className="text-xs">
                  Befüllt leere Stellen (Aufgaben, Anforderungen, Benefits) aus dem Original-Inserat oder der Beschreibung per KI. Verarbeitet 10 Jobs pro Durchlauf.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {enrichProgress && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{enrichProgress.done} / {enrichProgress.total} verarbeitet</span>
                      <span>{enrichProgress.failed > 0 ? `${enrichProgress.failed} fehlgeschlagen` : ''}</span>
                    </div>
                    <Progress value={enrichProgress.total > 0 ? (enrichProgress.done / enrichProgress.total) * 100 : 0} className="h-2" />
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={enriching}
                  onClick={startEnrichment}
                >
                  <Database className="mr-1.5 h-3.5 w-3.5" />
                  {enriching ? 'Wird verarbeitet...' : 'Jobs anreichern'}
                </Button>
              </CardContent>
            </Card>

            {/* Vector Embeddings Batch Generation */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Vector Embeddings generieren
                </CardTitle>
                <CardDescription className="text-xs">
                  Generiert semantische Embeddings für alle Kandidaten und Jobs ohne bestehende Embeddings. Wird für das KI-Matching verwendet.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    toast({ title: "Embedding-Generierung gestartet...", description: "Verarbeite in Batches. Bitte Seite nicht schliessen." });
                    try {
                      let totalCandidates = 0, totalJobs = 0, totalErrors = 0;
                      let hasMore = true;
                      let round = 0;
                      const maxRounds = 100;
                      while (hasMore && round < maxRounds) {
                        round++;
                        const { data, error } = await supabase.functions.invoke('batch-generate-embeddings');
                        if (error) throw error;
                        if (!data?.success) throw new Error(data?.error || 'Unbekannter Fehler');
                        totalCandidates += data.results.candidates.processed;
                        totalJobs += data.results.jobs.processed;
                        totalErrors += data.results.candidates.errors + data.results.jobs.errors;
                        hasMore = data.hasMore === true;
                        if (hasMore) {
                          toast({ title: `Batch ${round} fertig`, description: `${totalCandidates} Kandidaten, ${totalJobs} Jobs bisher...` });
                        }
                      }
                      if (round >= maxRounds) {
                        toast({
                          title: "Maximale Rundenzahl erreicht ⚠️",
                          description: `${totalCandidates} Kandidaten, ${totalJobs} Jobs verarbeitet. Einige Records konnten nicht verarbeitet werden.`,
                          variant: "destructive",
                        });
                      } else {
                        toast({
                          title: "Alle Embeddings generiert ✅",
                          description: `${totalCandidates} Kandidaten, ${totalJobs} Jobs verarbeitet${totalErrors > 0 ? `, ${totalErrors} Fehler` : ''}`,
                        });
                      }
                    } catch (err) {
                      console.error('Batch embedding error:', err);
                      toast({
                        title: "Fehler",
                        description: "Embedding-Generierung fehlgeschlagen",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <Database className="mr-1.5 h-3.5 w-3.5" />
                  Alle Embeddings generieren
                </Button>
              </CardContent>
            </Card>

            {/* Batch Geocoding */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Koordinaten geocodieren
                </CardTitle>
                <CardDescription className="text-xs">
                  Geocodiert alle Kandidaten und Jobs mit Standort aber ohne Koordinaten. Wird für die Distanzberechnung bei Vorschlägen verwendet (~$0.005/Record).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    toast({ title: "Geocoding gestartet...", description: "Verarbeite in Batches. Bitte Seite nicht schliessen." });
                    try {
                      let totalCandidates = 0, totalJobs = 0, totalErrors = 0;
                      let hasMore = true;
                      let round = 0;
                      const maxRounds = 50;
                      while (hasMore && round < maxRounds) {
                        round++;
                        const { data, error } = await supabase.functions.invoke('batch-geocode');
                        if (error) throw error;
                        if (!data?.success) throw new Error(data?.error || 'Unbekannter Fehler');
                        totalCandidates += data.results.candidates.processed;
                        totalJobs += data.results.jobs.processed;
                        totalErrors += data.results.candidates.errors + data.results.jobs.errors;
                        hasMore = data.hasMore === true;
                        if (hasMore) {
                          toast({ title: `Geocoding Batch ${round}`, description: `${totalCandidates} Kandidaten, ${totalJobs} Jobs bisher...` });
                        }
                      }
                      toast({
                        title: round >= maxRounds ? "Maximale Rundenzahl erreicht ⚠️" : "Geocoding abgeschlossen ✅",
                        description: `${totalCandidates} Kandidaten, ${totalJobs} Jobs geocodiert${totalErrors > 0 ? `, ${totalErrors} Fehler` : ''}`,
                        variant: round >= maxRounds ? "destructive" : undefined,
                      });
                    } catch (err) {
                      console.error('Batch geocode error:', err);
                      toast({
                        title: "Fehler",
                        description: "Geocoding fehlgeschlagen",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <Globe className="mr-1.5 h-3.5 w-3.5" />
                  Alle Koordinaten geocodieren
                </Button>
              </CardContent>
            </Card>
          </div>
        );

      case "archiv":
        return <ArchiveManager />;

      case "admin":
        return (
          <div className="space-y-6">
            {/* Admin Stats Overview */}
            <AdminStats />

            {/* Active Users Table */}
            <AdminUserTable />

            {/* User Invitation Management */}
            <UserManagement />

            {/* Access Logs */}
            <AccessLogsTable />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("settings.subtitle")}
        </p>
      </div>

      {/* Topbar Navigation */}
      <ScrollArea className="w-full">
        <div className="flex gap-1 pb-2">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                  activeSection === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <Separator />

      {renderContent()}
    </div>
  );
}
