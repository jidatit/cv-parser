import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Merge, Search, Building2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedLogoUrls } from "@/lib/storageUtils";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

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

const MERGE_FIELDS: (keyof Client)[] = [
  "email", "phone", "address", "website", "description",
  "logo_url", "logo_bg_color", "industry", "contact_person",
  "benefits", "careers_url",
];

function countFilledFields(client: Client): number {
  return MERGE_FIELDS.filter((f) => !!client[f]).length;
}

interface ManualClientMergeProps {
  onMergeComplete: () => void;
}

export function ManualClientMerge({ onMergeComplete }: ManualClientMergeProps) {
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [resultsA, setResultsA] = useState<Client[]>([]);
  const [resultsB, setResultsB] = useState<Client[]>([]);
  const [clientA, setClientA] = useState<Client | null>(null);
  const [clientB, setClientB] = useState<Client | null>(null);
  const [primaryId, setPrimaryId] = useState<string>("");
  const [merging, setMerging] = useState(false);
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const searchClients = useCallback(async (query: string, excludeId?: string): Promise<Client[]> => {
    if (query.length < 2) return [];
    const { data } = await supabase
      .from("clients")
      .select("*")
      .ilike("name", `%${query}%`)
      .order("name")
      .limit(8);
    return (data || []).filter((c) => c.id !== excludeId);
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await searchClients(searchA, clientB?.id);
      setResultsA(res);
    }, 300);
    return () => clearTimeout(t);
  }, [searchA, searchClients, clientB?.id]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await searchClients(searchB, clientA?.id);
      setResultsB(res);
    }, 300);
    return () => clearTimeout(t);
  }, [searchB, searchClients, clientA?.id]);

  // Resolve logos when both clients selected
  useEffect(() => {
    const clients = [clientA, clientB].filter(Boolean) as Client[];
    if (clients.length > 0) {
      getSignedLogoUrls(clients).then(setLogoUrls);
    }
  }, [clientA, clientB]);

  // Auto-set primary to the one with more fields
  useEffect(() => {
    if (clientA && clientB && !primaryId) {
      setPrimaryId(countFilledFields(clientA) >= countFilledFields(clientB) ? clientA.id : clientB.id);
    }
  }, [clientA, clientB, primaryId]);

  const selectClient = (side: "A" | "B", client: Client) => {
    if (side === "A") {
      setClientA(client);
      setSearchA("");
      setResultsA([]);
    } else {
      setClientB(client);
      setSearchB("");
      setResultsB([]);
    }
    // Reset primary when changing selection
    setPrimaryId("");
  };

  const clearClient = (side: "A" | "B") => {
    if (side === "A") setClientA(null);
    else setClientB(null);
    setPrimaryId("");
  };

  const mergeManual = async () => {
    if (!clientA || !clientB || !primaryId) return;
    setMerging(true);
    const warnings: string[] = [];

    try {
      const primary = primaryId === clientA.id ? clientA : clientB;
      const duplicate = primaryId === clientA.id ? clientB : clientA;

      // 1. Fill missing fields
      const updates: Partial<Client> = {};
      for (const field of MERGE_FIELDS) {
        if (!primary[field] && duplicate[field]) {
          (updates as any)[field] = duplicate[field];
        }
      }
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from("clients").update(updates).eq("id", primary.id);
        if (error) { console.warn("Field transfer error:", error); warnings.push("Felder konnten nicht übertragen werden"); }
      }

      // 2. Reassign jobs
      const { error: jobErr } = await supabase.from("jobs").update({ client_id: primary.id }).eq("client_id", duplicate.id);
      if (jobErr) { console.warn("Job reassign error:", jobErr); warnings.push("Jobs konnten nicht umgehängt werden"); }

      // 3. Reassign contact_persons
      const { error: cpErr } = await supabase.from("contact_persons").update({ client_id: primary.id }).eq("client_id", duplicate.id);
      if (cpErr) { console.warn("Contact person error:", cpErr); warnings.push("Kontaktpersonen konnten nicht umgehängt werden"); }

      // 4. Delete publication_blacklist
      await supabase.from("publication_blacklist").delete().eq("client_id", duplicate.id);

      // 5. Migrate work_experience client_id references in candidates
      try {
        const { data: candidates } = await supabase.from("candidates").select("id, work_experience");
        if (candidates) {
          for (const cand of candidates) {
            const we = cand.work_experience as any[] | null;
            if (!we || !Array.isArray(we)) continue;
            let changed = false;
            const updated = we.map((entry: any) => {
              if (entry.client_id === duplicate.id) {
                changed = true;
                return { ...entry, client_id: primary.id };
              }
              return entry;
            });
            if (changed) {
              await supabase.from("candidates").update({ work_experience: updated }).eq("id", cand.id);
            }
          }
        }
      } catch (e) {
        console.warn("Work experience migration error:", e);
        warnings.push("Work-Experience-Referenzen konnten nicht migriert werden");
      }

      // 6. Delete duplicate
      const { error: delErr } = await supabase.from("clients").delete().eq("id", duplicate.id);
      if (delErr) { console.warn("Delete error:", delErr); warnings.push("Duplikat konnte nicht gelöscht werden"); }

      toast({
        title: "Zusammengeführt",
        description: warnings.length > 0
          ? `Zusammengeführt mit Hinweisen: ${warnings.join("; ")}`
          : `"${duplicate.name}" wurde in "${primary.name}" zusammengeführt.`,
        variant: warnings.length > 0 ? "destructive" : "default",
      });

      setClientA(null);
      setClientB(null);
      setPrimaryId("");
      onMergeComplete();
    } catch (err) {
      console.error(err);
      toast({ title: "Fehler", description: "Fehler beim Zusammenführen.", variant: "destructive" });
    } finally {
      setMerging(false);
    }
  };

  const renderClientCard = (client: Client) => (
    <div className="flex items-center gap-3 p-2">
      <div className="h-8 w-8 rounded border bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
        {logoUrls[client.id] ? (
          <img src={logoUrls[client.id]} alt="" className="h-full w-full object-contain" />
        ) : (
          <Building2 className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{client.name}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
            {countFilledFields(client)}/{MERGE_FIELDS.length}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {[client.email, client.phone, client.industry, client.address].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );

  const renderSearchField = (side: "A" | "B") => {
    const selected = side === "A" ? clientA : clientB;
    const search = side === "A" ? searchA : searchB;
    const results = side === "A" ? resultsA : resultsB;
    const setSearch = side === "A" ? setSearchA : setSearchB;

    if (selected) {
      return (
        <div className="border rounded-md relative">
          {renderClientCard(selected)}
          <Button
            variant="ghost" size="icon"
            className="absolute top-1 right-1 h-6 w-6"
            onClick={() => clearClient(side)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    return (
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Firma ${side} suchen...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {results.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
            {results.map((c) => (
              <button
                key={c.id}
                className="w-full text-left hover:bg-muted/50 cursor-pointer"
                onClick={() => selectClient(side, c)}
              >
                {renderClientCard(c)}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Separator />
      <h4 className="text-sm font-medium flex items-center gap-2">
        <Merge className="h-4 w-4" />
        Manuell zusammenführen
      </h4>

      <div className="grid gap-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Firma A</Label>
          {renderSearchField("A")}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Firma B</Label>
          {renderSearchField("B")}
        </div>
      </div>

      {clientA && clientB && (
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground">Haupt-Eintrag wählen (wird beibehalten):</Label>
          <RadioGroup value={primaryId} onValueChange={setPrimaryId} className="space-y-2">
            {[clientA, clientB].map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                <RadioGroupItem value={c.id} id={`manual-${c.id}`} />
                <Label htmlFor={`manual-${c.id}`} className="flex-1 cursor-pointer">
                  <span className="font-medium">{c.name}</span>
                </Label>
                {primaryId === c.id && (
                  <Badge className="text-xs bg-primary/10 text-primary border-primary/20">Haupt</Badge>
                )}
              </div>
            ))}
          </RadioGroup>

          <Button onClick={mergeManual} disabled={merging || !primaryId} className="w-full">
            {merging ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Merge className="h-4 w-4 mr-2" />}
            Zusammenführen
          </Button>
        </div>
      )}
    </div>
  );
}
