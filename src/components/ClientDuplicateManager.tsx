import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Merge, Search, CheckCircle2, Building2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeCompanyName } from "@/lib/companyUtils";
import { getSignedLogoUrls } from "@/lib/storageUtils";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { ManualClientMerge } from "@/components/ManualClientMerge";

const DISMISSED_KEY = "crm_dismissed_duplicate_pairs";

function getDismissedPairs(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"));
  } catch { return new Set(); }
}

function makePairKey(a: string, b: string): string {
  return [a, b].sort().join("::");
}

function dismissPair(a: string, b: string) {
  const pairs = getDismissedPairs();
  pairs.add(makePairKey(a, b));
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...pairs]));
}

function isGroupFullyDismissed(clientIds: string[]): boolean {
  const pairs = getDismissedPairs();
  for (let i = 0; i < clientIds.length; i++) {
    for (let j = i + 1; j < clientIds.length; j++) {
      if (!pairs.has(makePairKey(clientIds[i], clientIds[j]))) return false;
    }
  }
  return true;
}

interface Client {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  description?: string | null;
  logo_url?: string | null;
  logo_bg_color?: string | null;
  industry?: string | null;
  contact_person?: string | null;
  benefits?: string | null;
  careers_url?: string | null;
  status?: string | null;
}

interface DuplicateGroup {
  normalizedName: string;
  clients: Client[];
  primaryId: string;
}

interface ClientDuplicateManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMergeComplete: () => void;
}

const MERGE_FIELDS: (keyof Client)[] = [
  "email", "phone", "address", "website", "description",
  "logo_url", "logo_bg_color", "industry", "contact_person",
  "benefits", "careers_url",
];

function scorePrimary(client: Client): number {
  let score = 0;
  if (client.logo_url) score += 3;
  if (client.description) score += 2;
  if (client.website) score += 2;
  if (client.email) score += 1;
  if (client.phone) score += 1;
  if (client.address) score += 1;
  if (client.industry) score += 1;
  if (client.contact_person) score += 1;
  if (client.benefits) score += 1;
  if (client.careers_url) score += 1;
  return score;
}

function countFilledFields(client: Client): number {
  return MERGE_FIELDS.filter((f) => !!client[f]).length;
}

export function ClientDuplicateManager({ open, onOpenChange, onMergeComplete }: ClientDuplicateManagerProps) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [scanning, setScanning] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const { t } = useLanguage();

  const scan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (error) throw error;

      // Step 1: Build normalized name map
      const clientsWithNorm = (data || []).map((c: Client) => ({
        client: c,
        norm: normalizeCompanyName(c.name),
      })).filter((x) => x.norm.length > 0);

      // Step 2: Exact match groups
      const exactMap = new Map<string, Client[]>();
      clientsWithNorm.forEach(({ client, norm }) => {
        const arr = exactMap.get(norm);
        if (arr) arr.push(client);
        else exactMap.set(norm, [client]);
      });

      // Collect exact duplicate groups and track grouped client IDs
      const groupedIds = new Set<string>();
      const groupMap = new Map<string, Client[]>(); // groupKey -> clients

      exactMap.forEach((clients, norm) => {
        if (clients.length >= 2) {
          groupMap.set(norm, [...clients]);
          clients.forEach((c) => groupedIds.add(c.id));
        }
      });

      // Step 3: Substring matching for ungrouped clients
      const ungrouped = clientsWithNorm.filter(({ client }) => !groupedIds.has(client.id));

      // Try to merge ungrouped into existing groups
      for (const { client, norm } of ungrouped) {
        if (norm.length < 4) continue;
        let matched = false;
        for (const [groupNorm, groupClients] of groupMap.entries()) {
          if (groupNorm.includes(norm) || norm.includes(groupNorm)) {
            groupClients.push(client);
            groupedIds.add(client.id);
            matched = true;
            break;
          }
        }
        if (!matched) {
          // Try pairwise with other ungrouped
          for (const other of ungrouped) {
            if (other.client.id === client.id || groupedIds.has(other.client.id)) continue;
            if (other.norm.length < 4) continue;
            if (norm.includes(other.norm) || other.norm.includes(norm)) {
              const key = norm.length <= other.norm.length ? norm : other.norm;
              const existing = groupMap.get(key);
              if (existing) {
                if (!groupedIds.has(client.id)) { existing.push(client); groupedIds.add(client.id); }
                if (!groupedIds.has(other.client.id)) { existing.push(other.client); groupedIds.add(other.client.id); }
              } else {
                groupMap.set(key, [client, other.client]);
                groupedIds.add(client.id);
                groupedIds.add(other.client.id);
              }
              break;
            }
          }
        }
      }

      // Build final groups (filter out fully dismissed ones)
      const duplicates: DuplicateGroup[] = [];
      const allDupClients: Client[] = [];
      groupMap.forEach((clients, normalizedName) => {
        if (clients.length >= 2) {
          const unique = [...new Map(clients.map((c) => [c.id, c])).values()];
          if (isGroupFullyDismissed(unique.map((c) => c.id))) return;
          const sorted = unique.sort((a, b) => scorePrimary(b) - scorePrimary(a));
          duplicates.push({ normalizedName, clients: sorted, primaryId: sorted[0].id });
          allDupClients.push(...sorted);
        }
      });

      // Resolve logo URLs
      if (allDupClients.length > 0) {
        getSignedLogoUrls(allDupClients).then(setLogoUrls);
      }

      setGroups(duplicates);
      setScanned(true);

      if (duplicates.length === 0) {
        toast({ title: "Keine Duplikate gefunden", description: "Alle Firmenprofile sind einzigartig." });
      }
    } catch (err) {
      console.error(err);
      toast({ title: t("toast.error"), description: "Fehler beim Scannen.", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const mergeGroup = async (group: DuplicateGroup) => {
    setMerging(group.normalizedName);
    const warnings: string[] = [];
    try {
      const primary = group.clients.find((c) => c.id === group.primaryId)!;
      const duplicateIds = group.clients.filter((c) => c.id !== group.primaryId).map((c) => c.id);

      // 1. Fill missing fields on primary from duplicates
      const updates: Partial<Client> = {};
      for (const field of MERGE_FIELDS) {
        if (!primary[field]) {
          for (const dup of group.clients) {
            if (dup.id !== group.primaryId && dup[field]) {
              (updates as any)[field] = dup[field];
              break;
            }
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabase.from("clients").update(updates).eq("id", group.primaryId);
        if (updateErr) { console.warn("Client update error:", updateErr); warnings.push("Felder konnten nicht übertragen werden"); }
      }

      // 2. Reassign jobs
      const { error: jobErr } = await supabase.from("jobs").update({ client_id: group.primaryId }).in("client_id", duplicateIds);
      if (jobErr) { console.warn("Job reassign error:", jobErr); warnings.push("Einige Jobs konnten nicht umgehängt werden"); }

      // 3. Reassign contact_persons
      const { error: cpErr } = await supabase.from("contact_persons").update({ client_id: group.primaryId }).in("client_id", duplicateIds);
      if (cpErr) { console.warn("Contact person reassign error:", cpErr); warnings.push("Kontaktpersonen konnten nicht umgehängt werden"); }

      // 4. Delete publication_blacklist
      const { error: blErr } = await supabase.from("publication_blacklist").delete().in("client_id", duplicateIds);
      if (blErr) { console.warn("Blacklist delete error:", blErr); }

      // 5. Delete duplicates
      let deleteFailCount = 0;
      for (const id of duplicateIds) {
        const { error: delErr } = await supabase.from("clients").delete().eq("id", id);
        if (delErr) { console.warn("Client delete error:", delErr); deleteFailCount++; }
      }
      if (deleteFailCount > 0) warnings.push(`${deleteFailCount} Duplikat(e) konnten nicht gelöscht werden (fehlende Berechtigung)`);

      // Remove merged group
      setGroups((prev) => prev.filter((g) => g.normalizedName !== group.normalizedName));

      toast({
        title: "Zusammengeführt",
        description: warnings.length > 0
          ? `Zusammengeführt mit Hinweisen: ${warnings.join("; ")}`
          : `${duplicateIds.length} Duplikat(e) in "${primary.name}" zusammengeführt.`,
        variant: warnings.length > 0 ? "destructive" : "default",
      });

      onMergeComplete();
    } catch (err) {
      console.error(err);
      toast({ title: t("toast.error"), description: "Fehler beim Zusammenführen.", variant: "destructive" });
    } finally {
      setMerging(null);
    }
  };

  const setPrimary = (normalizedName: string, clientId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.normalizedName === normalizedName ? { ...g, primaryId: clientId } : g))
    );
  };

  const removeFromGroup = (normalizedName: string, clientId: string) => {
    setGroups((prev) =>
      prev
        .map((g) => {
          if (g.normalizedName !== normalizedName) return g;
          const remaining = g.clients.filter((c) => c.id !== clientId);
          // Dismiss pairs between removed client and all remaining
          remaining.forEach((c) => dismissPair(clientId, c.id));
          if (remaining.length < 2) {
            // Group dissolved — also dismiss remaining pair if exactly 1 left
            return null;
          }
          const newPrimary = g.primaryId === clientId
            ? remaining.sort((a, b) => scorePrimary(b) - scorePrimary(a))[0].id
            : g.primaryId;
          return { ...g, clients: remaining, primaryId: newPrimary };
        })
        .filter(Boolean) as DuplicateGroup[]
    );
  };

  const resetDismissed = () => {
    localStorage.removeItem(DISMISSED_KEY);
    toast({ title: "Zurückgesetzt", description: "Ignorierte Duplikat-Vorschläge wurden zurückgesetzt." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Duplikate prüfen & zusammenführen
          </DialogTitle>
        </DialogHeader>

        {!scanned ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-muted-foreground text-center text-sm">
              Scannt alle Firmenprofile und findet Duplikate anhand normalisierter Namen.
            </p>
            <Button onClick={scan} disabled={scanning}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              {scanning ? "Scanne..." : "Duplikate suchen"}
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="text-muted-foreground">Keine Duplikate gefunden.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {groups.length} Duplikat-Gruppe(n) gefunden. Wähle jeweils den Haupt-Eintrag und führe zusammen.
            </p>
            {groups.map((group) => (
              <div key={group.normalizedName} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs">
                    {group.clients.length} Einträge
                  </Badge>
                  <Button
                    size="sm"
                    onClick={() => mergeGroup(group)}
                    disabled={merging !== null}
                  >
                    {merging === group.normalizedName ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Merge className="h-4 w-4 mr-1" />
                    )}
                    Zusammenführen
                  </Button>
                </div>
                <RadioGroup
                  value={group.primaryId}
                  onValueChange={(v) => setPrimary(group.normalizedName, v)}
                  className="space-y-2"
                >
                  {group.clients.map((client) => (
                    <div key={client.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
                       <RadioGroupItem value={client.id} id={client.id} className="mt-1" />
                       <div className="h-8 w-8 rounded border bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                         {logoUrls[client.id] ? (
                           <img src={logoUrls[client.id]} alt="" className="h-full w-full object-contain" />
                         ) : (
                           <Building2 className="h-4 w-4 text-muted-foreground" />
                         )}
                       </div>
                       <Label htmlFor={client.id} className="flex-1 min-w-0 cursor-pointer">
                         <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{client.name}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                              {countFilledFields(client)}/{MERGE_FIELDS.length} Felder
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                            {client.email && <span className="truncate max-w-[200px]">{client.email}</span>}
                            {client.phone && <span>{client.phone}</span>}
                            {client.address && <span className="truncate max-w-[200px]">{client.address}</span>}
                            {client.website && <span className="truncate max-w-[200px]">{client.website}</span>}
                            {client.industry && <span>{client.industry}</span>}
                          </div>
                       </Label>
                       {group.primaryId === client.id && (
                          <Badge className="text-xs bg-primary/10 text-primary border-primary/20">Haupt</Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={(e) => { e.preventDefault(); removeFromGroup(group.normalizedName, client.id); }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                  ))}
                </RadioGroup>
              </div>
            ))}
          </div>
        )}
        {scanned && (
          <div className="flex justify-end pt-2">
            <Button variant="link" size="sm" className="text-xs text-muted-foreground h-auto p-0" onClick={resetDismissed}>
              Ignorierte zurücksetzen
            </Button>
          </div>
        )}
        <ManualClientMerge onMergeComplete={onMergeComplete} />
      </DialogContent>
    </Dialog>
  );
}
