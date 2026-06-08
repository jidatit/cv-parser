import { useState, useCallback } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PublicationStatusCards } from "@/components/publication/PublicationStatusCards";
import { PublicationJobsTable } from "@/components/publication/PublicationJobsTable";
import { PublicationRulesManager } from "@/components/publication/PublicationRulesManager";
import { PublicationBlacklist } from "@/components/publication/PublicationBlacklist";
import { PublicationAuditLog } from "@/components/publication/PublicationAuditLog";
import { PublicationAnalyticsCharts } from "@/components/publication/PublicationAnalyticsCharts";
import { PublicationDashboard } from "@/components/publication/PublicationDashboard";

const PublicationManager = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [initialStatusFilter, setInitialStatusFilter] = useState<string | undefined>();

  const handleStatusClick = useCallback((status: string) => {
    setInitialStatusFilter(status);
    setActiveTab("jobs");
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          {t("publicationManager.title")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("publicationManager.subtitle")}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">{t("publicationManager.tabs.dashboard")}</TabsTrigger>
          <TabsTrigger value="jobs">{t("publicationManager.tabs.jobs")}</TabsTrigger>
          <TabsTrigger value="performance">{t("publicationManager.tabs.performance")}</TabsTrigger>
          <TabsTrigger value="rules">{t("publicationManager.tabs.rules")}</TabsTrigger>
          <TabsTrigger value="blacklist">{t("publicationManager.tabs.blacklist")}</TabsTrigger>
          <TabsTrigger value="auditLog">{t("publicationManager.tabs.auditLog")}</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <div className="space-y-6">
            <PublicationStatusCards onStatusClick={handleStatusClick} />
            <PublicationDashboard />
          </div>
        </TabsContent>

        <TabsContent value="jobs">
          <PublicationJobsTable initialStatusFilter={initialStatusFilter} />
        </TabsContent>

        <TabsContent value="performance">
          <PublicationAnalyticsCharts />
        </TabsContent>

        <TabsContent value="rules">
          <PublicationRulesManager />
        </TabsContent>

        <TabsContent value="blacklist">
          <PublicationBlacklist />
        </TabsContent>

        <TabsContent value="auditLog">
          <PublicationAuditLog />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PublicationManager;
