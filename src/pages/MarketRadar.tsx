import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Radar, X, Plus, Play, Save, Trash2, ExternalLink, ChevronDown, Clock, Building2, MapPin, Info, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface ScanResult {
  success: boolean;
  total_scraped: number;
  total_new: number;
  total_existing: number;
  total_filtered: number;
  duration_ms: number;
  queries_used: string[];
  imported_jobs: { jobId: string; title: string; company: string; location: string; sourceUrl: string | null; isNew: boolean }[];
}

interface ScanHistory {
  id: string;
  queries_used: string[];
  location: string | null;
  total_scraped: number;
  total_new: number;
  total_existing: number;
  total_filtered: number;
  duration_ms: number;
  status: string;
  imported_job_ids: any[];
  created_at: string;
}

interface RadarProfile {
  id: string;
  name: string;
  queries: string[];
  location: string | null;
  radius_km: number;
  language: string;
  time_filter: string;
  work_model: string;
  max_pages: number;
  auto_synonyms: boolean;
}

const SWISS_REGIONS = [
  "Zürich", "Bern", "Basel", "Genf", "Lausanne", "Luzern", "St. Gallen",
  "Winterthur", "Biel", "Thun", "Aarau", "Schaffhausen", "Zug", "Chur",
  "Ostschweiz", "Zentralschweiz", "Nordwestschweiz", "Mittelland",
];

export default function MarketRadar() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Search params
  const [queries, setQueries] = useState<string[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [location, setLocation] = useState("");
  const [radiusKm, setRadiusKm] = useState(50);
  const [language, setLanguage] = useState("de");
  const [timeFilter, setTimeFilter] = useState("all");
  const [workModel, setWorkModel] = useState("all");
  const [maxPages, setMaxPages] = useState(3);
  const [autoSynonyms, setAutoSynonyms] = useState(true);
  const [pensumRange, setPensumRange] = useState<[number, number]>([80, 100]);

  // State
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistory[]>([]);
  const [profiles, setProfiles] = useState<RadarProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [showSaveProfile, setShowSaveProfile] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Load profiles, history, and check for running scans
  useEffect(() => {
    loadProfiles();
    loadHistory();
    checkForRunningScan();
    loadLastCompletedScan();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const checkForRunningScan = async () => {
    const { data: runningScan } = await supabase
      .from('market_radar_scans')
      .select('*')
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runningScan) {
      setIsScanning(true);
      startPolling((runningScan as any).id);
    }
  };

  const startPolling = (scanId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      const { data: scan } = await supabase
        .from('market_radar_scans')
        .select('*')
        .eq('id', scanId)
        .single();

      if (!scan) return;
      const s = scan as any;

      if (s.status === 'completed') {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        setIsScanning(false);

        // Reconstruct result from DB
        const importedJobs = (s.imported_job_ids || []).map((j: any) => ({
          jobId: j.jobId,
          title: j.title,
          company: j.company,
          location: j.location,
          sourceUrl: j.sourceUrl,
          isNew: j.isNew,
        }));

        setScanResult({
          success: true,
          total_scraped: s.total_scraped,
          total_new: s.total_new,
          total_existing: s.total_existing,
          total_filtered: s.total_filtered,
          duration_ms: s.duration_ms,
          queries_used: s.queries_used || [],
          imported_jobs: importedJobs,
        });
        loadHistory();
        toast.success(`Scan abgeschlossen: ${s.total_new} neue Stellen importiert`);
      } else if (s.status === 'failed') {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        setIsScanning(false);
        toast.error('Scan fehlgeschlagen');
      }
    }, 3000);
  };

  const loadProfiles = async () => {
    const { data } = await supabase
      .from('market_radar_profiles')
      .select('*')
      .order('name');
    if (data) setProfiles(data as any);
  };

  const loadHistory = async () => {
    const { data } = await supabase
      .from('market_radar_scans')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setScanHistory(data as any);
  };

  const loadLastCompletedScan = async () => {
    const { data: scan } = await supabase
      .from('market_radar_scans')
      .select('*')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (scan && !scanResult) {
      const s = scan as any;
      const importedJobs = (s.imported_job_ids || []).map((j: any) => ({
        jobId: j.jobId,
        title: j.title,
        company: j.company,
        location: j.location,
        sourceUrl: j.sourceUrl,
        isNew: j.isNew,
      }));

      setScanResult({
        success: true,
        total_scraped: s.total_scraped,
        total_new: s.total_new,
        total_existing: s.total_existing,
        total_filtered: s.total_filtered,
        duration_ms: s.duration_ms,
        queries_used: s.queries_used || [],
        imported_jobs: importedJobs,
      });
    }
  };

  const addQuery = useCallback(() => {
    const q = queryInput.trim();
    if (q && !queries.includes(q)) {
      setQueries(prev => [...prev, q]);
      setQueryInput("");
    }
  }, [queryInput, queries]);

  const removeQuery = (index: number) => {
    setQueries(prev => prev.filter((_, i) => i !== index));
  };

  const loadProfile = (profileId: string) => {
    const p = profiles.find(pr => pr.id === profileId);
    if (!p) return;
    setSelectedProfileId(profileId);
    setQueries(p.queries || []);
    setLocation(p.location || "");
    setRadiusKm(p.radius_km);
    setLanguage(p.language);
    setTimeFilter(p.time_filter);
    setWorkModel(p.work_model);
    setMaxPages(p.max_pages);
    setAutoSynonyms(p.auto_synonyms);
    setPensumRange([(p as any).pensum_min ?? 80, (p as any).pensum_max ?? 100]);
  };

  const saveProfile = async () => {
    if (!profileName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('market_radar_profiles').insert({
      user_id: user.id,
      name: profileName.trim(),
      queries,
      location: location || null,
      radius_km: radiusKm,
      language,
      time_filter: timeFilter,
      work_model: workModel,
      max_pages: maxPages,
      auto_synonyms: autoSynonyms,
      pensum_min: pensumRange[0],
      pensum_max: pensumRange[1],
    } as any);

    if (error) {
      toast.error("Profil konnte nicht gespeichert werden");
    } else {
      toast.success("Scan-Profil gespeichert");
      setProfileName("");
      setShowSaveProfile(false);
      loadProfiles();
    }
  };

  const deleteProfile = async (id: string) => {
    await supabase.from('market_radar_profiles').delete().eq('id', id);
    if (selectedProfileId === id) setSelectedProfileId(null);
    loadProfiles();
    toast.success("Profil gelöscht");
  };

  const startScan = async () => {
    if (queries.length === 0) {
      toast.error("Bitte mindestens einen Suchbegriff eingeben");
      return;
    }

    setIsScanning(true);
    setScanResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('market-radar-scan', {
        body: {
          queries,
          location: location || null,
          radius_km: radiusKm,
          language,
          time_filter: timeFilter,
          work_model: workModel,
          max_pages: maxPages,
          auto_synonyms: autoSynonyms,
          pensum_min: pensumRange[0],
          pensum_max: pensumRange[1],
          profile_id: selectedProfileId,
        },
      });

      if (error) throw error;

      // If we got a scan_id, start polling (in case response arrives after navigate-away)
      if (data?.scan_id) {
        startPolling(data.scan_id);
      }

      // If we're still on the page and got full results, use them directly
      if (data?.success) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        setScanResult(data as ScanResult);
        setIsScanning(false);
        loadHistory();
        toast.success(`Scan abgeschlossen: ${data.total_new} neue Stellen importiert`);
      }
    } catch (e: any) {
      console.error('Scan error:', e);
      setIsScanning(false);
      toast.error(`Scan fehlgeschlagen: ${e.message || 'Unbekannter Fehler'}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Radar className="h-6 w-6 text-primary" />
          {t('marketRadar.title')}
        </h1>
        <p className="text-muted-foreground">{t('marketRadar.subtitle')}</p>
      </div>

      {/* Search Configuration */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{t('marketRadar.searchConfig')}</CardTitle>
            <div className="flex items-center gap-2">
              {profiles.length > 0 && (
                <Select value={selectedProfileId || ""} onValueChange={loadProfile}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder={t('marketRadar.loadProfile')} />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center justify-between w-full gap-2">
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedProfileId && (
                <Button variant="ghost" size="icon" onClick={() => deleteProfile(selectedProfileId)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Search Queries (Tag Input) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              {t('marketRadar.searchTerms')}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent className="max-w-xs">{t('marketRadar.searchTermsHint')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <div className="flex gap-2">
              <Input
                value={queryInput}
                onChange={e => setQueryInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addQuery(); } }}
                placeholder={t('marketRadar.searchTermsPlaceholder')}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={addQuery} disabled={!queryInput.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {queries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {queries.map((q, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 pr-1">
                    {q}
                    <button onClick={() => removeQuery(i)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Region */}
            <div className="space-y-2">
              <Label>{t('marketRadar.region')}</Label>
              <Input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder={t('marketRadar.regionPlaceholder')}
                list="swiss-regions"
              />
              <datalist id="swiss-regions">
                {SWISS_REGIONS.map(r => <option key={r} value={r} />)}
              </datalist>
            </div>

            {/* Radius */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                {t('marketRadar.radius')}
                <span className="text-muted-foreground text-xs">({radiusKm} km)</span>
              </Label>
              <Slider
                value={[radiusKm]}
                onValueChange={v => setRadiusKm(v[0])}
                min={10} max={200} step={10}
              />
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label>{t('marketRadar.language')}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="it">Italiano</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Time Filter */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                {t('marketRadar.timeFilter')}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent>{t('marketRadar.timeFilterHint')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('marketRadar.timeAll')}</SelectItem>
                  <SelectItem value="today">{t('marketRadar.timeToday')}</SelectItem>
                  <SelectItem value="3days">{t('marketRadar.time3Days')}</SelectItem>
                  <SelectItem value="week">{t('marketRadar.timeWeek')}</SelectItem>
                  <SelectItem value="month">{t('marketRadar.timeMonth')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Work Model */}
            <div className="space-y-2">
              <Label>{t('marketRadar.workModel')}</Label>
              <Select value={workModel} onValueChange={setWorkModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('marketRadar.workAll')}</SelectItem>
                  <SelectItem value="remote">{t('marketRadar.workRemote')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Pensum Range */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                Pensum
                <span className="text-muted-foreground text-xs">({pensumRange[0]}% – {pensumRange[1]}%)</span>
              </Label>
              <Slider
                value={pensumRange}
                onValueChange={v => setPensumRange(v as [number, number])}
                min={0} max={100} step={10}
              />
            </div>

            {/* Search Depth */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                {t('marketRadar.searchDepth')}
                <span className="text-muted-foreground text-xs">({maxPages} {maxPages === 1 ? 'Seite' : 'Seiten'})</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">{t('marketRadar.searchDepthHint')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Slider
                value={[maxPages]}
                onValueChange={v => setMaxPages(v[0])}
                min={1} max={10} step={1}
              />
            </div>
          </div>

          {/* AI Synonyms Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>{t('marketRadar.aiSynonyms')}</Label>
              <p className="text-sm text-muted-foreground">{t('marketRadar.aiSynonymsDesc')}</p>
            </div>
            <Switch checked={autoSynonyms} onCheckedChange={setAutoSynonyms} />
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button onClick={startScan} disabled={isScanning || queries.length === 0} size="lg" className="gap-2">
              {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isScanning ? t('marketRadar.scanning') : t('marketRadar.startScan')}
            </Button>
            <Button variant="outline" onClick={() => setShowSaveProfile(!showSaveProfile)} className="gap-2">
              <Save className="h-4 w-4" />
              {t('marketRadar.saveProfile')}
            </Button>
          </div>

          {showSaveProfile && (
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label>{t('marketRadar.profileName')}</Label>
                <Input
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  placeholder={t('marketRadar.profileNamePlaceholder')}
                  onKeyDown={e => { if (e.key === 'Enter') saveProfile(); }}
                />
              </div>
              <Button onClick={saveProfile} disabled={!profileName.trim()}>
                {t('common.save')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading indicator */}
      {isScanning && (
        <Card>
          <CardContent className="py-8 text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">{t('marketRadar.scanningDesc')}</p>
            <p className="text-xs text-muted-foreground">Du kannst die Seite verlassen – der Scan läuft im Hintergrund weiter.</p>
            <Progress value={undefined} className="w-1/2 mx-auto" />
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {scanResult && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold">{scanResult.total_scraped}</p>
                <p className="text-xs text-muted-foreground">{t('marketRadar.totalScraped')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold text-primary">{scanResult.total_new}</p>
                <p className="text-xs text-muted-foreground">{t('marketRadar.newImported')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold text-muted-foreground">{scanResult.total_existing}</p>
                <p className="text-xs text-muted-foreground">{t('marketRadar.alreadyExists')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold text-destructive">{scanResult.total_filtered}</p>
                <p className="text-xs text-muted-foreground">{t('marketRadar.agenciesFiltered')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Imported Jobs Table */}
          {scanResult.imported_jobs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{t('marketRadar.importedJobs')} ({scanResult.imported_jobs.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.title')}</TableHead>
                      <TableHead>{t('common.company')}</TableHead>
                      <TableHead>{t('common.location')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scanResult.imported_jobs.map((job, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium max-w-[300px] truncate">
                          <button
                            className="text-left hover:text-primary hover:underline"
                            onClick={() => navigate(`/jobs/${job.jobId}`)}
                          >
                            {job.title}
                          </button>
                        </TableCell>
                        <TableCell className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {job.company}
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            {job.location || '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={job.isNew ? "default" : "secondary"}>
                            {job.isNew ? t('marketRadar.statusNew') : t('marketRadar.statusExisting')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {job.sourceUrl && (
                            <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Scan History */}
      {scanHistory.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {t('marketRadar.scanHistory')}
                  <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
                  <Badge variant="secondary" className="ml-2">{scanHistory.length}</Badge>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.date')}</TableHead>
                      <TableHead>{t('marketRadar.searchTerms')}</TableHead>
                      <TableHead>{t('common.location')}</TableHead>
                      <TableHead className="text-center">{t('marketRadar.totalScraped')}</TableHead>
                      <TableHead className="text-center">{t('marketRadar.newImported')}</TableHead>
                      <TableHead className="text-center">{t('marketRadar.agenciesFiltered')}</TableHead>
                      <TableHead className="text-right">{t('marketRadar.duration')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scanHistory.map(scan => (
                      <TableRow key={scan.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(scan.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(scan.queries_used || []).map((q, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{q}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{scan.location || '-'}</TableCell>
                        <TableCell className="text-center">{scan.total_scraped}</TableCell>
                        <TableCell className="text-center text-primary font-medium">{scan.total_new}</TableCell>
                        <TableCell className="text-center text-destructive">{scan.total_filtered}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {scan.status === 'running' ? (
                            <Badge variant="outline" className="gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Läuft...
                            </Badge>
                          ) : (
                            `${(scan.duration_ms / 1000).toFixed(1)}s`
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
