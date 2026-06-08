import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Merge, Search, CheckCircle2, Briefcase, X, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";

const DISMISSED_KEY = "crm_dismissed_job_duplicate_pairs";

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

function isGroupFullyDismissed(ids: string[]): boolean {
  const pairs = getDismissedPairs();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (!pairs.has(makePairKey(ids[i], ids[j]))) return false;
    }
  }
  return true;
}

/** Strip HTML tags from text */
function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Calculate Jaccard similarity between two texts (word-level, words ≥3 chars) */
function textSimilarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const wordsA = new Set(stripHtml(a).split(/\s+/).filter(w => w.length >= 3));
  const wordsB = new Set(stripHtml(b).split(/\s+/).filter(w => w.length >= 3));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Check if two jobs have similar content (requirements + responsibilities ≥80% overlap) */
function hasContentOverlap(a: Job, b: Job): boolean {
  const reqSim = textSimilarity(a.requirements, b.requirements);
  const resSim = textSimilarity(a.responsibilities, b.responsibilities);
  // Both fields must have content to compare; if only one has content, use that
  const hasReq = (a.requirements && b.requirements);
  const hasRes = (a.responsibilities && b.responsibilities);
  if (hasReq && hasRes) return reqSim >= 0.8 && resSim >= 0.8;
  if (hasReq) return reqSim >= 0.8;
  if (hasRes) return resSim >= 0.8;
  return false;
}

/** Normalize job title for comparison: remove gender suffixes, pensum, special chars */
function normalizeJobTitle(title: string): string {
  let t = title.toLowerCase().trim();
  // Remove gender suffixes
  t = t.replace(/\s*\(m\/w\/d\)/g, "");
  t = t.replace(/\s*\(f\/m\/d\)/g, "");
  t = t.replace(/\s*\(w\/m\/d\)/g, "");
  t = t.replace(/\s*\(d\/m\/w\)/g, "");
  t = t.replace(/\s*\(m\/f\/d\)/g, "");
  t = t.replace(/\s*\(all genders?\)/gi, "");
  t = t.replace(/[/\\*:]in\b/g, "");
  // Remove pensum like 80-100%, 60%, etc.
  t = t.replace(/\s*\d{2,3}\s*[-–]\s*\d{2,3}\s*%/g, "");
  t = t.replace(/\s*\d{2,3}\s*%/g, "");
  // Remove special chars, normalize whitespace
  t = t.replace(/[^a-zäöüéèêàáâ0-9\s]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/** Extract city from a location string */
function extractCity(location: string): string {
  if (!location) return "";
  let cleaned = location.trim().toLowerCase();
  cleaned = cleaned.replace(/\b\d{4,5}\b/g, "");
  const countries = ["schweiz", "switzerland", "suisse", "deutschland", "germany", "österreich", "austria", "france", "frankreich", "italien", "italy", "italia"];
  for (const c of countries) cleaned = cleaned.replace(new RegExp(`\\b${c}\\b`, "gi"), "");
  const parts = cleaned.split(",").map(p => p.trim()).filter(Boolean);
  if (!parts.length) return "";
  for (const part of parts) {
    if (!/\d/.test(part) && part.length >= 2) return part.replace(/\s+/g, " ").trim();
  }
  return parts[parts.length - 1].replace(/\s+/g, " ").trim();
}

function citiesOverlap(a: string | null, b: string | null): boolean {
  if (!a || !b) return !a && !b; // both null = same
  const cityA = extractCity(a);
  const cityB = extractCity(b);
  if (!cityA || !cityB) return false;
  return cityA === cityB || cityA.includes(cityB) || cityB.includes(cityA);
}

interface Job {
  id: string;
  title: string;
  description: string | null;
  requirements: string | null;
  responsibilities: string | null;
  benefits: string | null;
  skills: string[] | null;
  salary_range: string | null;
  source_url: string | null;
  location: string | null;
  status: string | null;
  client_id: string | null;
  client_name: string | null;
  structured_notes: any;
  hasPlacement: boolean;
}

interface DuplicateGroup {
  key: string;
  jobs: Job[];
  primaryId: string;
  matchType?: "title" | "content" | "both";
}

const MERGE_FIELDS: (keyof Job)[] = [
  "description", "requirements", "responsibilities", "benefits", "skills", "salary_range", "source_url",
];

function scorePrimary(job: Job): number {
  let s = 0;
  if (job.hasPlacement) s += 100;
  if (job.description) s += 3;
  if (job.requirements) s += 2;
  if (job.responsibilities) s += 2;
  if (job.benefits) s += 1;
  if (job.skills && job.skills.length > 0) s += 1;
  if (job.salary_range) s += 1;
  if (job.source_url) s += 1;
  return s;
}

function countFilledFields(job: Job): number {
  let c = 0;
  if (job.description) c++;
  if (job.requirements) c++;
  if (job.responsibilities) c++;
  if (job.benefits) c++;
  if (job.skills && job.skills.length > 0) c++;
  if (job.salary_range) c++;
  if (job.source_url) c++;
  return c;
}

interface JobDuplicateManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMergeComplete: () => void;
}

export function JobDuplicateManager({ open, onOpenChange, onMergeComplete }: JobDuplicateManagerProps) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [scanning, setScanning] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  const scan = async () => {
    setScanning(true);
    try {
      // 1. Load all non-archived jobs
      const { data: jobsData, error: jobsErr } = await supabase
        .from("jobs")
        .select("id, title, description, requirements, responsibilities, benefits, skills, salary_range, source_url, location, status, client_id, structured_notes, clients(name)")
        .neq("status", "Archived")
        .order("created_at", { ascending: false });
      if (jobsErr) throw jobsErr;

      // 2. Load all job IDs that have placements (to exclude)
      const { data: placementData, error: plErr } = await supabase
        .from("placements")
        .select("job_id");
      if (plErr) throw plErr;

      const placedJobIds = new Set((placementData || []).map(p => p.job_id));

      // 3. Map all jobs (placed jobs included, scored as primary)
      const jobs: Job[] = (jobsData || [])
        .map(j => ({
          id: j.id,
          title: j.title,
          description: j.description,
          requirements: j.requirements,
          responsibilities: j.responsibilities,
          benefits: j.benefits,
          skills: j.skills,
          salary_range: j.salary_range,
          source_url: j.source_url,
          location: j.location,
          status: j.status,
          client_id: j.client_id,
          client_name: (j.clients as any)?.name || null,
          structured_notes: j.structured_notes,
          hasPlacement: placedJobIds.has(j.id),
        }));

      // 4. Group by normalized title + client_id
      const groupMap = new Map<string, Job[]>();
      for (const job of jobs) {
        const norm = normalizeJobTitle(job.title);
        if (norm.length < 3) continue;
        const key = `${norm}||${job.client_id || "no-client"}`;
        const arr = groupMap.get(key);
        if (arr) arr.push(job);
        else groupMap.set(key, [job]);
      }

      // 5. Build duplicate groups, checking location overlap
      const duplicates: DuplicateGroup[] = [];
      groupMap.forEach((groupJobs, key) => {
        if (groupJobs.length < 2) return;

        // Sub-group by location overlap
        const locationGroups: Job[][] = [];
        const assigned = new Set<string>();

        for (let i = 0; i < groupJobs.length; i++) {
          if (assigned.has(groupJobs[i].id)) continue;
          const locGroup = [groupJobs[i]];
          assigned.add(groupJobs[i].id);
          for (let j = i + 1; j < groupJobs.length; j++) {
            if (assigned.has(groupJobs[j].id)) continue;
            if (citiesOverlap(groupJobs[i].location, groupJobs[j].location)) {
              locGroup.push(groupJobs[j]);
              assigned.add(groupJobs[j].id);
            }
          }
          if (locGroup.length >= 2) locationGroups.push(locGroup);
        }

        for (const locGroup of locationGroups) {
          const ids = locGroup.map(j => j.id);
          if (isGroupFullyDismissed(ids)) return;
          const sorted = locGroup.sort((a, b) => scorePrimary(b) - scorePrimary(a));
          // Check if content also overlaps for badge
          const contentMatch = sorted.length >= 2 && hasContentOverlap(sorted[0], sorted[1]);
          duplicates.push({ key: `${key}||${ids.join(",")}`, jobs: sorted, primaryId: sorted[0].id, matchType: contentMatch ? "both" : "title" });
        }
      });

      // 6. Content-based duplicate detection: same client, different title, similar content
      const titleGroupedIds = new Set(duplicates.flatMap(g => g.jobs.map(j => j.id)));
      const clientGroups = new Map<string, Job[]>();
      for (const job of jobs) {
        if (titleGroupedIds.has(job.id)) continue;
        if (!job.client_id) continue;
        if (!job.requirements && !job.responsibilities) continue;
        const arr = clientGroups.get(job.client_id);
        if (arr) arr.push(job);
        else clientGroups.set(job.client_id, [job]);
      }

      clientGroups.forEach((clientJobs) => {
        if (clientJobs.length < 2) return;
        const contentAssigned = new Set<string>();
        for (let i = 0; i < clientJobs.length; i++) {
          if (contentAssigned.has(clientJobs[i].id)) continue;
          const contentGroup = [clientJobs[i]];
          contentAssigned.add(clientJobs[i].id);
          for (let j = i + 1; j < clientJobs.length; j++) {
            if (contentAssigned.has(clientJobs[j].id)) continue;
            if (citiesOverlap(clientJobs[i].location, clientJobs[j].location) && hasContentOverlap(clientJobs[i], clientJobs[j])) {
              contentGroup.push(clientJobs[j]);
              contentAssigned.add(clientJobs[j].id);
            }
          }
          if (contentGroup.length >= 2) {
            const ids = contentGroup.map(j => j.id);
            if (!isGroupFullyDismissed(ids)) {
              const sorted = contentGroup.sort((a, b) => scorePrimary(b) - scorePrimary(a));
              duplicates.push({ key: `content||${ids.join(",")}`, jobs: sorted, primaryId: sorted[0].id, matchType: "content" });
            }
          }
        }
      });

      setGroups(duplicates);
      setScanned(true);

      if (duplicates.length === 0) {
        toast({ title: "Keine Duplikate gefunden", description: "Alle Stellenprofile sind einzigartig." });
      }
    } catch (err) {
      console.error(err);
      toast({ title: t("toast.error"), description: "Fehler beim Scannen.", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const mergeGroup = async (group: DuplicateGroup) => {
    setMerging(group.key);
    const warnings: string[] = [];
    try {
      const primary = group.jobs.find(j => j.id === group.primaryId)!;
      const duplicateIds = group.jobs.filter(j => j.id !== group.primaryId).map(j => j.id);

      // 1. Fill missing fields
      const updates: Record<string, any> = {};
      for (const field of MERGE_FIELDS) {
        const val = primary[field];
        if (!val || (Array.isArray(val) && val.length === 0)) {
          for (const dup of group.jobs) {
            if (dup.id === group.primaryId) continue;
            const dupVal = dup[field];
            if (dupVal && (!Array.isArray(dupVal) || dupVal.length > 0)) {
              updates[field] = dupVal;
              break;
            }
          }
        }
      }

      // Merge structured_notes
      const allNotes: any[] = [];
      for (const job of group.jobs) {
        if (Array.isArray(job.structured_notes)) allNotes.push(...job.structured_notes);
      }
      if (allNotes.length > 0) updates.structured_notes = allNotes;

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from("jobs").update(updates).eq("id", group.primaryId);
        if (error) { console.warn("Job update error:", error); warnings.push("Felder konnten nicht übertragen werden"); }
      }

      // 2. Reassign ai_matches
      const { error: aiErr } = await supabase.from("ai_matches").update({ job_id: group.primaryId }).in("job_id", duplicateIds);
      if (aiErr) console.warn("AI match reassign error:", aiErr);

      // 3. Reassign placements (safety)
      const { error: plErr } = await supabase.from("placements").update({ job_id: group.primaryId }).in("job_id", duplicateIds);
      if (plErr) console.warn("Placement reassign error:", plErr);

      // 4. Delete duplicates
      let failCount = 0;
      for (const id of duplicateIds) {
        const { error } = await supabase.from("jobs").delete().eq("id", id);
        if (error) { console.warn("Job delete error:", error); failCount++; }
      }
      if (failCount > 0) warnings.push(`${failCount} Duplikat(e) konnten nicht gelöscht werden`);

      setGroups(prev => prev.filter(g => g.key !== group.key));

      toast({
        title: "Zusammengeführt",
        description: warnings.length > 0
          ? `Zusammengeführt mit Hinweisen: ${warnings.join("; ")}`
          : `${duplicateIds.length} Duplikat(e) in "${primary.title}" zusammengeführt.`,
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

  const setPrimary = (key: string, jobId: string) => {
    setGroups(prev => prev.map(g => g.key === key ? { ...g, primaryId: jobId } : g));
  };

  const removeFromGroup = (key: string, jobId: string) => {
    setGroups(prev =>
      prev
        .map(g => {
          if (g.key !== key) return g;
          const remaining = g.jobs.filter(j => j.id !== jobId);
          remaining.forEach(j => dismissPair(jobId, j.id));
          if (remaining.length < 2) return null;
          const newPrimary = g.primaryId === jobId
            ? remaining.sort((a, b) => scorePrimary(b) - scorePrimary(a))[0].id
            : g.primaryId;
          return { ...g, jobs: remaining, primaryId: newPrimary };
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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Stellen-Duplikate prüfen & zusammenführen
          </DialogTitle>
        </DialogHeader>

        {!scanned ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-muted-foreground text-center text-sm">
              Scannt alle Stellen und findet Duplikate anhand normalisierter Titel, Firma und Standort. Bereits platzierte Stellen werden ausgelassen.
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
            {groups.map(group => (
              <div key={group.key} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {group.jobs.length} Einträge
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {group.matchType === "content" ? "Inhalt identisch" : group.matchType === "both" ? "Titel + Inhalt" : "Titel gleich"}
                    </Badge>
                  </div>
                  <Button size="sm" onClick={() => mergeGroup(group)} disabled={merging !== null}>
                    {merging === group.key ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Merge className="h-4 w-4 mr-1" />
                    )}
                    Zusammenführen
                  </Button>
                </div>
                <RadioGroup value={group.primaryId} onValueChange={v => setPrimary(group.key, v)} className="space-y-2">
                  {group.jobs.map(job => (
                    <div key={job.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
                      <RadioGroupItem value={job.id} id={job.id} className="mt-1" />
                      <div className="h-8 w-8 rounded border bg-muted flex items-center justify-center flex-shrink-0">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <Label htmlFor={job.id} className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{job.title}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {countFilledFields(job)}/{MERGE_FIELDS.length} Felder
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground space-x-3 mt-0.5">
                          {job.client_name && <span>{job.client_name}</span>}
                          {job.location && (
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="h-3 w-3 inline" />
                              {job.location}
                            </span>
                          )}
                          {job.status && <span>Status: {job.status}</span>}
                        </div>
                      </Label>
                      {group.primaryId === job.id && (
                        <Badge className="text-xs bg-primary/10 text-primary border-primary/20">Haupt</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={e => { e.preventDefault(); removeFromGroup(group.key, job.id); }}
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
      </DialogContent>
    </Dialog>
  );
}
