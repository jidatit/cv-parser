import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, Mail, Phone, MapPin, Building2, MoreHorizontal, Merge } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { NewClientDialog } from "@/components/NewClientDialog";
import { ClientDuplicateManager } from "@/components/ClientDuplicateManager";
import { StatusDropdown } from "@/components/StatusDropdown";
import { useLanguage } from "@/hooks/useLanguage";
import { extractEdgeColor } from "@/components/CompanyLogoUpload";
import { getSignedLogoUrls } from "@/lib/storageUtils";

const industries = ["Alle", "Bauwesen", "Finance", "Healthcare", "Law", "Engineering", "IT"];

const useClientStatuses = () => {
  const { t } = useLanguage();
  return [
    { title: t("common.jobStatus.notAvailable", "Nicht offen"), color: "bg-red-500/70 text-white" },
    { title: t("common.jobStatus.offen", "Offen"), color: "bg-green-500/70 text-white" },
    { title: "Partner", color: "bg-blue-500/70 text-white" },
    { title: t("common.jobStatus.nd", "N/D"), color: "bg-gray-500 text-white" },
  ];
};

const CLIENT_SELECT = 'id, name, industry, status, email, phone, contact_person, logo_url, logo_bg_color, address, website, user_id, created_at, updated_at';

export default function Clients() {
  const clientStatuses = useClientStatuses();
  const getStatusColor = (status: string) => {
    const statusObj = clientStatuses.find(s => s.title === status);
    return statusObj?.color || "bg-gray-500 text-white";
  };
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("Alle");
  const [logoBgColors, setLogoBgColors] = useState<Record<string, string | null>>({});
  const [signedLogoUrls, setSignedLogoUrls] = useState<Record<string, string>>({});
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  const fetchClients = useCallback(async (search?: string, industry?: string) => {
    try {
      let query = supabase
        .from('clients')
        .select(CLIENT_SELECT)
        .order('name');

      if (industry && industry !== "Alle") {
        query = query.eq('industry', industry);
      }

      if (search && search.trim()) {
        const s = search.trim();
        query = query.or(`name.ilike.%${s}%,contact_person.ilike.%${s}%,email.ilike.%${s}%`);
      }

      // Raise limit to get all results (up to 5000 should be plenty)
      query = query.limit(5000);

      const { data, error } = await query;
      if (error) throw error;

      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.clientsLoadError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  // Initial load
  useEffect(() => {
    fetchClients();
  }, []);

  // Debounced server-side search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClients(searchQuery, selectedIndustry);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedIndustry, fetchClients]);

  const handleStatusChange = async (clientId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('clients')
        .update({ status: newStatus })
        .eq('id', clientId);

      if (error) throw error;

      setClients(prevClients =>
        prevClients.map(client =>
          client.id === clientId ? { ...client, status: newStatus } : client
        )
      );

      toast({
        title: t("toast.statusUpdated"),
        description: `Status: ${newStatus}`,
      });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.updateError"),
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const resolveUrls = async () => {
      const urls = await getSignedLogoUrls(clients);
      setSignedLogoUrls(urls);

      const colors: Record<string, string | null> = {};
      await Promise.all(
        clients
          .filter((c) => c.logo_url)
          .map(async (c) => {
            if (c.logo_bg_color) {
              colors[c.id] = c.logo_bg_color;
            } else if (urls[c.id]) {
              const color = await extractEdgeColor(urls[c.id]);
              if (color) colors[c.id] = color;
            }
          })
      );
      setLogoBgColors(colors);
    };
    resolveUrls();
  }, [clients]);

  const refetchClients = () => fetchClients(searchQuery, selectedIndustry);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t("clients.loadingClients")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("clients.title")}</h1>
          <p className="text-muted-foreground">
            {t("clients.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NewClientDialog onClientCreated={refetchClients} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover">
              <DropdownMenuItem onClick={() => setDuplicateDialogOpen(true)}>
                <Merge className="h-4 w-4 mr-2" />
                Duplikate prüfen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ClientDuplicateManager
            open={duplicateDialogOpen}
            onOpenChange={setDuplicateDialogOpen}
            onMergeComplete={refetchClients}
          />
        </div>
      </div>

      {/* Search and Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("clients.searchPlaceholder")}
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("clients.selectIndustry")} />
              </SelectTrigger>
              <SelectContent>
                {industries.map((industry) => (
                  <SelectItem key={industry} value={industry}>
                    {industry === "Alle" ? t("common.all") : industry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Clients Table */}
      {clients.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {!searchQuery && selectedIndustry === "Alle" ? t("clients.noClientsYet") : t("clients.noClients")}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {!searchQuery && selectedIndustry === "Alle" ? t("clients.noClientsYetDesc") : t("clients.noMatchingSearch")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.industry")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("common.email")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("common.address")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <Link to={`/clients/${client.id}`} state={{ from: '/clients' }} className="flex items-center gap-3 hover:underline">
                      <div
                        className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center border"
                        style={logoBgColors[client.id] ? { backgroundColor: logoBgColors[client.id]! } : undefined}
                      >
                      {signedLogoUrls[client.id] ? (
                          <img 
                            src={signedLogoUrls[client.id]} 
                            alt={`${client.name} logo`}
                            className="w-full h-full object-contain p-1"
                          />) : client.logo_url ? (
                          <Building2 className="h-5 w-5 text-muted-foreground animate-pulse" />
                        ) : (
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <span>{client.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell>{client.industry || "-"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <StatusDropdown
                      currentStatus={client.status || "N/D"}
                      currentColor={getStatusColor(client.status || "N/D")}
                      availableStatuses={clientStatuses}
                      onStatusChange={(newStatus) => handleStatusChange(client.id, newStatus)}
                    />
                  </TableCell>
                  <TableCell>
                    {client.email ? (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{client.email}</span>
                      </div>
                    ) : "-"}
                  </TableCell>
                  <TableCell>
                    {client.phone ? (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{client.phone}</span>
                      </div>
                    ) : "-"}
                  </TableCell>
                  <TableCell>
                    {client.address ? (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{client.address}</span>
                      </div>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link to={`/clients/${client.id}`} state={{ from: '/clients' }}>
                      <Button variant="outline" size="sm">
                        {t("common.details")}
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
