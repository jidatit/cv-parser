import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { de, enUS, fr, es, it } from "date-fns/locale";
import { 
  Search, 
  RefreshCw, 
  Trash2, 
  Eye, 
  Building2,
  User,
  Briefcase,
  Loader2
} from "lucide-react";

type SortOption = "newest" | "oldest" | "nameAsc" | "nameDesc";

interface ArchivedCandidate {
  id: string;
  name: string;
  position: string | null;
  desired_position: string | null;
  avatar_url: string | null;
  updated_at: string;
}

interface ArchivedJob {
  id: string;
  title: string;
  location: string | null;
  updated_at: string;
  client_id: string | null;
  client_name?: string;
}

interface ArchivedClient {
  id: string;
  name: string;
  industry: string | null;
  logo_url: string | null;
  updated_at: string;
}

export function ArchiveManager() {
  const { t, currentLanguage } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState("candidates");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  
  // Data states
  const [candidates, setCandidates] = useState<ArchivedCandidate[]>([]);
  const [jobs, setJobs] = useState<ArchivedJob[]>([]);
  const [clients, setClients] = useState<ArchivedClient[]>([]);
  
  // Loading states
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  
  // Selection states
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  
  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{type: string; id: string; name: string} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get locale for date formatting
  const getLocale = () => {
    switch (currentLanguage) {
      case 'de': return de;
      case 'fr': return fr;
      case 'es': return es;
      case 'it': return it;
      default: return enUS;
    }
  };

  // Load archived candidates
  const loadCandidates = async () => {
    setLoadingCandidates(true);
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select('id, name, position, desired_position, avatar_url, updated_at')
        .eq('status', 'Archived')
        .order('updated_at', { ascending: sortBy === 'oldest' });
      
      if (error) throw error;
      setCandidates(data || []);
    } catch (error) {
      console.error('Error loading archived candidates:', error);
      toast({ title: t("toast.error"), description: t("toast.loadError"), variant: "destructive" });
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Load archived jobs with client names
  const loadJobs = async () => {
    setLoadingJobs(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, location, updated_at, client_id, clients(name)')
        .eq('status', 'Archived')
        .order('updated_at', { ascending: sortBy === 'oldest' });
      
      if (error) throw error;
      
      const jobsWithClient = (data || []).map(job => ({
        ...job,
        client_name: (job.clients as any)?.name || null
      }));
      setJobs(jobsWithClient);
    } catch (error) {
      console.error('Error loading archived jobs:', error);
      toast({ title: t("toast.error"), description: t("toast.loadError"), variant: "destructive" });
    } finally {
      setLoadingJobs(false);
    }
  };

  // Load archived clients
  const loadClients = async () => {
    setLoadingClients(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, industry, logo_url, updated_at')
        .eq('status', 'Archived')
        .order('updated_at', { ascending: sortBy === 'oldest' });
      
      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error loading archived clients:', error);
      toast({ title: t("toast.error"), description: t("toast.loadError"), variant: "destructive" });
    } finally {
      setLoadingClients(false);
    }
  };

  // Load data on mount and when sort changes
  useEffect(() => {
    loadCandidates();
    loadJobs();
    loadClients();
  }, [sortBy]);

  // Reactivate candidate
  const reactivateCandidate = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ status: 'Active' })
        .eq('id', id);
      
      if (error) throw error;
      
      setCandidates(prev => prev.filter(c => c.id !== id));
      setSelectedCandidates(prev => { prev.delete(id); return new Set(prev); });
      toast({ title: t("archive.reactivated"), description: t("archive.reactivatedDesc", { name }) });
    } catch (error) {
      console.error('Error reactivating candidate:', error);
      toast({ title: t("toast.error"), description: t("toast.updateError"), variant: "destructive" });
    }
  };

  // Reactivate job
  const reactivateJob = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'Active' })
        .eq('id', id);
      
      if (error) throw error;
      
      setJobs(prev => prev.filter(j => j.id !== id));
      setSelectedJobs(prev => { prev.delete(id); return new Set(prev); });
      toast({ title: t("archive.reactivated"), description: t("archive.reactivatedDesc", { name }) });
    } catch (error) {
      console.error('Error reactivating job:', error);
      toast({ title: t("toast.error"), description: t("toast.updateError"), variant: "destructive" });
    }
  };

  // Reactivate client
  const reactivateClient = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from('clients')
        .update({ status: 'N/D' })
        .eq('id', id);
      
      if (error) throw error;
      
      setClients(prev => prev.filter(c => c.id !== id));
      setSelectedClients(prev => { prev.delete(id); return new Set(prev); });
      toast({ title: t("archive.reactivated"), description: t("archive.reactivatedDesc", { name }) });
    } catch (error) {
      console.error('Error reactivating client:', error);
      toast({ title: t("toast.error"), description: t("toast.updateError"), variant: "destructive" });
    }
  };

  // Delete permanently
  const deletePermanently = async () => {
    if (!deleteTarget) return;
    
    setIsDeleting(true);
    try {
      const { type, id, name } = deleteTarget;
      
      if (type === 'candidate') {
        // Delete related placements first
        await supabase.from('placements').delete().eq('candidate_id', id);
        // Delete candidate
        const { error } = await supabase.from('candidates').delete().eq('id', id);
        if (error) throw error;
        setCandidates(prev => prev.filter(c => c.id !== id));
        setSelectedCandidates(prev => { prev.delete(id); return new Set(prev); });
      } else if (type === 'job') {
        // Delete related interview prep docs
        await supabase.from('interview_prep_documents').delete().eq('placement_id', id);
        // Delete related placements
        await supabase.from('placements').delete().eq('job_id', id);
        // Delete job
        const { error } = await supabase.from('jobs').delete().eq('id', id);
        if (error) throw error;
        setJobs(prev => prev.filter(j => j.id !== id));
        setSelectedJobs(prev => { prev.delete(id); return new Set(prev); });
      } else if (type === 'client') {
        // Get all jobs for this client
        const { data: clientJobs } = await supabase
          .from('jobs')
          .select('id')
          .eq('client_id', id);
        
        if (clientJobs && clientJobs.length > 0) {
          const jobIds = clientJobs.map(j => j.id);
          // Delete placements for all jobs
          await supabase.from('placements').delete().in('job_id', jobIds);
          // Delete all jobs
          await supabase.from('jobs').delete().in('id', jobIds);
        }
        
        // Delete contact persons
        await supabase.from('contact_persons').delete().eq('client_id', id);
        
        // Delete client
        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (error) throw error;
        setClients(prev => prev.filter(c => c.id !== id));
        setSelectedClients(prev => { prev.delete(id); return new Set(prev); });
      }
      
      toast({ title: t("archive.deleted"), description: t("archive.deletedDesc", { name }) });
    } catch (error) {
      console.error('Error deleting:', error);
      toast({ title: t("toast.error"), description: t("toast.deleteError"), variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  // Batch reactivate
  const batchReactivate = async () => {
    if (activeTab === 'candidates') {
      for (const id of selectedCandidates) {
        const candidate = candidates.find(c => c.id === id);
        if (candidate) await reactivateCandidate(id, candidate.name);
      }
    } else if (activeTab === 'jobs') {
      for (const id of selectedJobs) {
        const job = jobs.find(j => j.id === id);
        if (job) await reactivateJob(id, job.title);
      }
    } else if (activeTab === 'clients') {
      for (const id of selectedClients) {
        const client = clients.find(c => c.id === id);
        if (client) await reactivateClient(id, client.name);
      }
    }
  };

  // Filter and sort data
  const filterData = <T extends { name?: string; title?: string }>(data: T[]): T[] => {
    let filtered = data.filter(item => {
      const name = (item.name || (item as any).title || '').toLowerCase();
      return name.includes(searchQuery.toLowerCase());
    });
    
    if (sortBy === 'nameAsc') {
      filtered.sort((a, b) => ((a.name || (a as any).title) || '').localeCompare((b.name || (b as any).title) || ''));
    } else if (sortBy === 'nameDesc') {
      filtered.sort((a, b) => ((b.name || (b as any).title) || '').localeCompare((a.name || (a as any).title) || ''));
    }
    
    return filtered;
  };

  const filteredCandidates = filterData(candidates);
  const filteredJobs = filterData(jobs);
  const filteredClients = filterData(clients);

  const toggleSelectAll = (type: 'candidates' | 'jobs' | 'clients') => {
    if (type === 'candidates') {
      if (selectedCandidates.size === filteredCandidates.length) {
        setSelectedCandidates(new Set());
      } else {
        setSelectedCandidates(new Set(filteredCandidates.map(c => c.id)));
      }
    } else if (type === 'jobs') {
      if (selectedJobs.size === filteredJobs.length) {
        setSelectedJobs(new Set());
      } else {
        setSelectedJobs(new Set(filteredJobs.map(j => j.id)));
      }
    } else {
      if (selectedClients.size === filteredClients.length) {
        setSelectedClients(new Set());
      } else {
        setSelectedClients(new Set(filteredClients.map(c => c.id)));
      }
    }
  };

  const getSelectedCount = () => {
    if (activeTab === 'candidates') return selectedCandidates.size;
    if (activeTab === 'jobs') return selectedJobs.size;
    return selectedClients.size;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          {t("archive.title")}
        </CardTitle>
        <CardDescription>{t("archive.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="candidates" className="gap-2">
              <User className="h-4 w-4" />
              {t("archive.candidates")} ({candidates.length})
            </TabsTrigger>
            <TabsTrigger value="jobs" className="gap-2">
              <Briefcase className="h-4 w-4" />
              {t("archive.jobs")} ({jobs.length})
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-2">
              <Building2 className="h-4 w-4" />
              {t("archive.companies")} ({clients.length})
            </TabsTrigger>
          </TabsList>

          {/* Search and Filter Bar */}
          <div className="flex flex-wrap gap-3 mt-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("common.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("archive.sortBy")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{t("archive.sortNewest")}</SelectItem>
                <SelectItem value="oldest">{t("archive.sortOldest")}</SelectItem>
                <SelectItem value="nameAsc">{t("archive.sortNameAsc")}</SelectItem>
                <SelectItem value="nameDesc">{t("archive.sortNameDesc")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Batch Actions */}
          {getSelectedCount() > 0 && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mt-4">
              <span className="text-sm font-medium">
                {t("archive.selectedCount", { count: getSelectedCount() })}
              </span>
              <Button size="sm" variant="outline" onClick={batchReactivate}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("archive.batchReactivate")}
              </Button>
            </div>
          )}

          {/* Candidates Tab */}
          <TabsContent value="candidates" className="mt-4">
            {loadingCandidates ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCandidates.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">{t("archive.noArchivedItems")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedCandidates.size === filteredCandidates.length && filteredCandidates.length > 0}
                        onCheckedChange={() => toggleSelectAll('candidates')}
                      />
                    </TableHead>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("common.position")}</TableHead>
                    <TableHead>{t("archive.archivedAt")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCandidates.map((candidate) => (
                    <TableRow key={candidate.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedCandidates.has(candidate.id)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedCandidates);
                            if (checked) newSet.add(candidate.id);
                            else newSet.delete(candidate.id);
                            setSelectedCandidates(newSet);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={candidate.avatar_url || undefined} />
                            <AvatarFallback>{candidate.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{candidate.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {candidate.position || candidate.desired_position || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(candidate.updated_at), 'dd.MM.yyyy', { locale: getLocale() })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/candidates/${candidate.id}`, { state: { from: '/settings' } })}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => reactivateCandidate(candidate.id, candidate.name)}>
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setDeleteTarget({ type: 'candidate', id: candidate.id, name: candidate.name });
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* Jobs Tab */}
          <TabsContent value="jobs" className="mt-4">
            {loadingJobs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredJobs.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">{t("archive.noArchivedItems")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedJobs.size === filteredJobs.length && filteredJobs.length > 0}
                        onCheckedChange={() => toggleSelectAll('jobs')}
                      />
                    </TableHead>
                    <TableHead>{t("common.title")}</TableHead>
                    <TableHead>{t("common.company")}</TableHead>
                    <TableHead>{t("common.location")}</TableHead>
                    <TableHead>{t("archive.archivedAt")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedJobs.has(job.id)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedJobs);
                            if (checked) newSet.add(job.id);
                            else newSet.delete(job.id);
                            setSelectedJobs(newSet);
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{job.title}</TableCell>
                      <TableCell className="text-muted-foreground">{job.client_name || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{job.location || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(job.updated_at), 'dd.MM.yyyy', { locale: getLocale() })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/jobs/${job.id}`, { state: { from: '/settings' } })}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => reactivateJob(job.id, job.title)}>
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setDeleteTarget({ type: 'job', id: job.id, name: job.title });
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* Clients Tab */}
          <TabsContent value="clients" className="mt-4">
            {loadingClients ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredClients.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">{t("archive.noArchivedItems")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedClients.size === filteredClients.length && filteredClients.length > 0}
                        onCheckedChange={() => toggleSelectAll('clients')}
                      />
                    </TableHead>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("common.industry")}</TableHead>
                    <TableHead>{t("archive.archivedAt")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedClients.has(client.id)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedClients);
                            if (checked) newSet.add(client.id);
                            else newSet.delete(client.id);
                            setSelectedClients(newSet);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={client.logo_url || undefined} />
                            <AvatarFallback><Building2 className="h-4 w-4" /></AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{client.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{client.industry || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(client.updated_at), 'dd.MM.yyyy', { locale: getLocale() })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/clients/${client.id}`, { state: { from: '/settings' } })}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => reactivateClient(client.id, client.name)}>
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setDeleteTarget({ type: 'client', id: client.id, name: client.name });
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("archive.confirmDelete")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("archive.confirmDeleteDesc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction 
                onClick={deletePermanently} 
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("archive.deletePermanently")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
