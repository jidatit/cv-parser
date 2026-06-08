import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Plus, Link, FileText, Loader2, Check, PlusCircle, Info, User, X, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { JobUrlParser } from "./JobUrlParser";
import { JobPdfParser } from "./JobPdfParser";
import { LocationAutocomplete } from "./LocationAutocomplete";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useJobDuplicateCheck } from "@/hooks/useJobDuplicateCheck";
import { JobDuplicateWarning } from "./JobDuplicateWarning";
import { triggerAutoAnalysis } from "@/lib/autoAnalyzeMatch";

interface JobFormData {
  title: string;
  company: string;
  location: string;
  type: string;
  salary: string;
  description: string;
  responsibilities: string;
  requirements: string;
  benefits: string;
  status: string;
  client_id?: string;
  source_url?: string;
  source_document_url?: string;
  company_website?: string;
}

interface ParsedJobData {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  responsibilities?: string;
  requirements?: string;
  benefits?: string;
  salary?: string;
  client_id?: string;
  client_name?: string;
  company_match_status?: 'found' | 'new';
  source_url?: string;
  source_document_url?: string;
  company_website?: string;
}

interface NewJobDialogProps {
  onJobCreated?: (job: JobFormData) => void;
  trigger?: React.ReactNode;
  clientId?: string;
}

interface CandidateOption {
  id: string;
  name: string;
  position: string | null;
  avatar_url: string | null;
}

// Convert plain text with bullet points to HTML for RichTextEditor
const convertTextToHtml = (text: string): string => {
  if (!text) return '';
  
  // If already HTML, return as-is
  if (text.includes('<p>') || text.includes('<ul>') || text.includes('<li>')) {
    return text;
  }
  
  const lines = text.split('\n').filter(line => line.trim());
  let html = '';
  let inList = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    const isBullet = /^[•\-\*]\s*/.test(trimmed);
    
    if (isBullet) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${trimmed.replace(/^[•\-\*]\s*/, '')}</li>`;
    } else {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += `<p>${trimmed}</p>`;
    }
  }
  
  if (inList) html += '</ul>';
  return html;
};

export function NewJobDialog({ onJobCreated, trigger, clientId }: NewJobDialogProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Company match status from parser
  const [companyMatchStatus, setCompanyMatchStatus] = useState<'found' | 'new' | null>(null);
  const [matchedClientName, setMatchedClientName] = useState<string | null>(null);

  // Company search state
  const [companySearchResults, setCompanySearchResults] = useState<Array<{ id: string; name: string; industry: string | null; logo_url: string | null }>>([]);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [companySearching, setCompanySearching] = useState(false);
  const companyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Candidate selection
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateOption | null>(null);
  const [showCandidateDropdown, setShowCandidateDropdown] = useState(false);
  const [duplicatesIgnored, setDuplicatesIgnored] = useState(false);

  const { duplicates: jobDuplicates, checking: checkingDuplicates, checkForDuplicates: checkJobDuplicates, clearDuplicates: clearJobDuplicates } = useJobDuplicateCheck();

  const [formData, setFormData] = useState<JobFormData>({
    title: "",
    company: "",
    location: "",
    type: "Vollzeit",
    salary: "",
    description: "",
    responsibilities: "",
    requirements: "",
    benefits: "",
    status: "Active",
    client_id: clientId,
    source_url: ""
  });

  // Fetch candidates when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchCandidates();
    } else {
      clearJobDuplicates();
      setDuplicatesIgnored(false);
    }
  }, [isOpen]);

  // Check for job duplicates when title, company, or location changes
  useEffect(() => {
    if (!isOpen) return;
    setDuplicatesIgnored(false);
    checkJobDuplicates(formData.title, formData.client_id, formData.company, formData.location);
  }, [formData.title, formData.client_id, formData.company, formData.location, isOpen]);

  const fetchCandidates = async () => {
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select('id, name, position, avatar_url')
        .order('name');

      if (error) throw error;
      setCandidates(data || []);
    } catch (error) {
      console.error('Error fetching candidates:', error);
    }
  };

  const handleInputChange = (field: keyof JobFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Debounced company search on manual input
    if (field === 'company') {
      setCompanyMatchStatus(null);
      setMatchedClientName(null);
      
      // Clear previous client_id when user edits company name manually
      setFormData(prev => ({ ...prev, client_id: undefined, [field]: value }));

      if (companyDebounceRef.current) clearTimeout(companyDebounceRef.current);

      if (value.trim().length < 2) {
        setCompanySearchResults([]);
        setShowCompanyDropdown(false);
        return;
      }

      setCompanySearching(true);
      companyDebounceRef.current = setTimeout(async () => {
        try {
          const { data, error } = await supabase
            .from('clients')
            .select('id, name, industry, logo_url')
            .ilike('name', `%${value.trim()}%`)
            .limit(5);

          if (error) throw error;

          setCompanySearchResults(data || []);
          setShowCompanyDropdown((data || []).length > 0);

          // Auto-match if exact match found
          const exactMatch = data?.find(
            c => c.name.toLowerCase() === value.trim().toLowerCase()
          );
          if (exactMatch) {
            setCompanyMatchStatus('found');
            setMatchedClientName(exactMatch.name);
            setFormData(prev => ({ ...prev, client_id: exactMatch.id }));
          } else if (value.trim().length >= 2) {
            setCompanyMatchStatus('new');
          }
        } catch (err) {
          console.error('Company search error:', err);
        } finally {
          setCompanySearching(false);
        }
      }, 500);
    }
  };

  const filteredCandidates = candidates.filter(candidate =>
    candidate.name.toLowerCase().includes(candidateSearch.toLowerCase()) ||
    candidate.position?.toLowerCase().includes(candidateSearch.toLowerCase())
  );

  // Detect fulltime from 80-100% pattern in title/description
  const detectFulltimeFromText = (title: string, description: string): boolean => {
    const combined = `${title || ''} ${description || ''}`.toLowerCase();
    // Matches: 80-100%, 80 - 100%, 80%-100%, 80% - 100%, 100%
    return /80\s*[-–]?\s*100\s*%|100\s*%/.test(combined);
  };

  const handleJobParsed = (parsedData: ParsedJobData) => {
    // Ensure responsibilities is a string and convert to HTML
    let rawResponsibilities = parsedData.responsibilities || '';
    if (Array.isArray(rawResponsibilities)) {
      rawResponsibilities = rawResponsibilities.join('\n');
    } else if (typeof rawResponsibilities !== 'string') {
      rawResponsibilities = String(rawResponsibilities);
    }
    const formattedResponsibilities = convertTextToHtml(rawResponsibilities);

    // Ensure requirements is a string and convert to HTML
    let rawRequirements = parsedData.requirements || '';
    if (Array.isArray(rawRequirements)) {
      rawRequirements = rawRequirements.join('\n');
    } else if (typeof rawRequirements !== 'string') {
      rawRequirements = String(rawRequirements);
    }
    const formattedRequirements = convertTextToHtml(rawRequirements);

    // Ensure description is a string and convert to HTML
    let rawDescription = parsedData.description || '';
    if (Array.isArray(rawDescription)) {
      rawDescription = rawDescription.join('\n');
    } else if (typeof rawDescription !== 'string') {
      rawDescription = String(rawDescription);
    }
    const formattedDescription = convertTextToHtml(rawDescription);

    // Ensure benefits is a string and convert to HTML
    let rawBenefits = parsedData.benefits || '';
    if (Array.isArray(rawBenefits)) {
      rawBenefits = rawBenefits.join('\n');
    } else if (typeof rawBenefits !== 'string') {
      rawBenefits = String(rawBenefits);
    }
    const formattedBenefits = convertTextToHtml(rawBenefits);

    // Determine employment type with fallback detection for 80-100%
    let employmentType = (parsedData as any).employment_type;
    if (!employmentType && detectFulltimeFromText(parsedData.title || '', parsedData.description || '')) {
      employmentType = 'Vollzeit';
    }

    setFormData(prev => ({
      ...prev,
      title: parsedData.title || prev.title,
      company: parsedData.company || prev.company,
      location: parsedData.location || prev.location,
      description: formattedDescription || prev.description,
      responsibilities: formattedResponsibilities || prev.responsibilities,
      requirements: formattedRequirements || prev.requirements,
      benefits: formattedBenefits || prev.benefits,
      type: employmentType || prev.type,
      salary: parsedData.salary || prev.salary,
      client_id: parsedData.client_id || prev.client_id,
      source_url: parsedData.source_url || prev.source_url,
      source_document_url: parsedData.source_document_url || prev.source_document_url,
      company_website: parsedData.company_website || prev.company_website,
    }));

    // Set company match status from parser response
    if (parsedData.company_match_status) {
      setCompanyMatchStatus(parsedData.company_match_status);
      setMatchedClientName(parsedData.client_name || null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast({
        title: t("toast.requiredFieldsMissing"),
        description: t("toast.fillAtLeastTitle"),
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: t("toast.notLoggedIn"),
          description: t("toast.pleaseLogin"),
          variant: "destructive",
        });
        return;
      }

      let finalClientId = formData.client_id;

      // Create new company if needed
      // - Either company_match_status === 'new' (from parser, no match found)
      // - Or no client_id and company name exists but status is null (user manually entered/edited)
      if (!finalClientId && formData.company.trim()) {
        // Check if company already exists in database (case-insensitive fuzzy match)
        const { data: existingClients } = await supabase
          .from('clients')
          .select('id, name')
          .ilike('name', formData.company.trim());

        const exactMatch = existingClients?.find(
          c => c.name.toLowerCase() === formData.company.trim().toLowerCase()
        );

        if (exactMatch) {
          // Use existing company
          finalClientId = exactMatch.id;
          console.log('Using existing company:', exactMatch.name, 'ID:', finalClientId);
        } else {
          // Create new company
          console.log('Creating new company:', formData.company.trim());
          const { data: newClient, error: clientError } = await supabase
            .from('clients')
            .insert({
              name: formData.company.trim(),
              user_id: user.id,
              status: 'N/D',
              website: formData.company_website || null,
            })
            .select('id')
            .single();

          if (clientError) {
            console.error('Error creating client:', clientError);
          } else {
            finalClientId = newClient.id;
            console.log('Created new company with ID:', finalClientId);

            // Fire-and-forget: Full enrichment chain for new company
            if (formData.company_website) {
              console.log('Triggering full enrichment for new company:', finalClientId, 'website:', formData.company_website);
              
              // 1. Parse website → then AI description (sequential, so context is available)
              supabase.functions.invoke('parse-company-website', {
                body: { url: formData.company_website }
              }).then(async ({ data, error }) => {
                if (!error && data?.success && data?.data) {
                  const parsed = data.data;
                  const updates: Record<string, any> = {};
                  if (parsed.industry) {
                    // Match against predefined industries
                    const { data: existingIndustries } = await supabase
                      .from('industries')
                      .select('name');
                    
                    const industryMatch = existingIndustries?.find(
                      i => i.name.toLowerCase() === parsed.industry.toLowerCase()
                    );
                    
                    updates.industry = industryMatch ? industryMatch.name : parsed.industry;
                    
                    // Add new industry to DB if not found
                    if (!industryMatch && parsed.industry.trim()) {
                      supabase.from('industries')
                        .insert([{ name: parsed.industry.trim() }])
                        .then(() => console.log('New industry added:', parsed.industry));
                    }
                  }
                  if (parsed.address) updates.address = parsed.address;
                  if (parsed.email) updates.email = parsed.email;
                  if (parsed.phone) updates.phone = parsed.phone;
                  if (parsed.contact_person) updates.contact_person = parsed.contact_person;
                  if (parsed.careers_url) updates.careers_url = parsed.careers_url;
                  if (parsed.benefits) updates.benefits = parsed.benefits;
                  // description bewusst NICHT gespeichert - wird von AI generiert
                  if (Object.keys(updates).length > 0) {
                    supabase.from('clients').update(updates).eq('id', newClient.id)
                      .then(({ error: e }) => { if (e) console.error('Enrichment save failed:', e); });
                  }
                }
                // AI description NACH parse (damit Kontext vorhanden)
                supabase.functions.invoke('generate-company-description', {
                  body: { client_id: newClient.id }
                }).then(({ data: descData, error: descError }) => {
                  if (!descError && descData?.description) {
                    supabase.from('clients').update({ description: descData.description }).eq('id', newClient.id)
                      .then(({ error: e }) => { if (e) console.error('Auto-description save failed:', e); });
                  }
                }).catch(err => console.error('Auto-description failed:', err));
              }).catch(err => console.error('Auto website parse failed:', err));

              // 2. Fetch logo (parallel, independent)
              supabase.functions.invoke('fetch-company-logo', {
                body: { url: formData.company_website, clientId: newClient.id }
              }).then(({ error }) => {
                if (error) console.error('Auto logo fetch failed:', error);
              }).catch(err => console.error('Auto logo fetch failed:', err));
            } else {
              // Kein Website → trotzdem AI description versuchen
              supabase.functions.invoke('generate-company-description', {
                body: { client_id: newClient.id }
              }).then(({ data, error }) => {
                if (!error && data?.description) {
                  supabase.from('clients').update({ description: data.description }).eq('id', newClient.id)
                    .then(({ error: e }) => { if (e) console.error('Auto-description save failed:', e); });
                }
              }).catch(err => console.error('Auto-description failed:', err));
            }
          }
        }
      }

      // Check if client is "Offen" -> set job status to "Offen"
      let jobStatus = formData.status;
      if (finalClientId) {
        const { data: clientData } = await supabase
          .from('clients').select('status').eq('id', finalClientId).single();
        if (clientData?.status === 'Offen') {
          jobStatus = 'Offen';
        }
      }

      const { data: newJob, error } = await supabase.from('jobs').insert({
        user_id: user.id,
        assigned_to: user.id,
        title: formData.title,
        client_id: finalClientId || null,
        location: formData.location || null,
        employment_type: formData.type,
        salary_range: formData.salary || null,
        description: formData.description || null,
        responsibilities: formData.responsibilities || null,
        requirements: formData.requirements || null,
        benefits: formData.benefits || null,
        status: jobStatus,
        source_url: formData.source_url || null,
        source_document_url: formData.source_document_url || null,
      }).select('id').single();

      if (error) throw error;

      // Create placement if candidate is selected
      if (selectedCandidate && newJob) {
        const { data: placementData, error: placementError } = await supabase
          .from('placements')
          .insert({
            candidate_id: selectedCandidate.id,
            job_id: newJob.id,
            user_id: user.id,
            stage: 'Ready2Send'
          })
          .select('id')
          .single();

        if (placementError) {
          console.error('Error creating placement:', placementError);
          toast({
            title: t("toast.warning"),
            description: t("matches.matchCreationFailed"),
            variant: "destructive",
          });
        } else {
          // Update candidate recruiting_status
          await supabase
            .from('candidates')
            .update({ recruiting_status: null })
            .eq('id', selectedCandidate.id);

          // Trigger auto analysis in background
          if (placementData) {
            triggerAutoAnalysis(placementData.id, selectedCandidate.id, newJob.id);
          }
        }
      }
      
      onJobCreated?.(formData);
      
      toast({
        title: t("toast.jobCreated"),
        description: selectedCandidate 
          ? t("toast.jobCreatedWithMatch", { candidate: selectedCandidate.name })
          : t("toast.jobCreatedDesc"),
      });
      
      // Reset form
      setFormData({
        title: "",
        company: "",
        location: "",
        type: "Vollzeit", 
        salary: "",
        description: "",
        responsibilities: "",
        requirements: "",
        benefits: "",
        status: "Active",
        source_url: ""
      });
      setCompanyMatchStatus(null);
      setMatchedClientName(null);
      setSelectedCandidate(null);
      setCandidateSearch("");
      clearJobDuplicates();
      setDuplicatesIgnored(false);
      
      setIsOpen(false);
    } catch (error) {
      console.error('Error creating job:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.createError"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const defaultTrigger = (
    <Button>
      <Plus className="mr-2 h-4 w-4" />
      {t("jobs.newPosition")}
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dialogs.newJob")}</DialogTitle>
          <DialogDescription>
            {t("dialogs.newJobDesc")}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Import Section */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">{t("jobs.importJob")}</Label>
            
            {/* URL Parser */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link className="h-3.5 w-3.5" />
                <span>{t("jobs.importFromUrl")}</span>
              </div>
              <JobUrlParser onJobParsed={handleJobParsed} />
            </div>
            
            {/* PDF Parser */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span>{t("jobs.importFromPdf")}</span>
              </div>
              <JobPdfParser onJobParsed={handleJobParsed} />
            </div>
          </div>

          <Separator />

          {/* Manual Input Section */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t("jobs.jobTitle")} *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                  placeholder="z.B. Senior Frontend Developer"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">{t("jobs.company")} *</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="company"
                      value={formData.company}
                      onChange={(e) => handleInputChange("company", e.target.value)}
                      placeholder="z.B. TechCorp GmbH"
                      required
                      onFocus={() => {
                        if (companySearchResults.length > 0 && !formData.client_id) {
                          setShowCompanyDropdown(true);
                        }
                      }}
                      onBlur={() => {
                        // Delay to allow click on dropdown items
                        setTimeout(() => setShowCompanyDropdown(false), 200);
                      }}
                    />
                    {showCompanyDropdown && companySearchResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                        {companySearchResults.map((company) => (
                          <div
                            key={company.id}
                            className="flex items-center gap-2 p-2 hover:bg-accent cursor-pointer transition-colors"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setFormData(prev => ({ ...prev, company: company.name, client_id: company.id }));
                              setCompanyMatchStatus('found');
                              setMatchedClientName(company.name);
                              setShowCompanyDropdown(false);
                              setCompanySearchResults([]);
                            }}
                          >
                            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{company.name}</p>
                              {company.industry && (
                                <p className="text-xs text-muted-foreground truncate">{company.industry}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {companySearching && (
                    <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground shrink-0" />
                  )}
                  {companyMatchStatus && (
                    <Badge 
                      variant={companyMatchStatus === 'found' ? 'default' : 'secondary'}
                      className={`shrink-0 ${
                        companyMatchStatus === 'found' 
                          ? 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30' 
                          : 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30'
                      }`}
                    >
                      {companyMatchStatus === 'found' ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          {t("jobParser.companyFound")}
                        </>
                      ) : (
                        <>
                          <PlusCircle className="h-3 w-3 mr-1" />
                          {t("jobParser.companyNew")}
                        </>
                      )}
                    </Badge>
                  )}
                </div>
                {companyMatchStatus === 'found' && matchedClientName && (
                  <p className="text-xs text-muted-foreground">
                    {t("jobParser.companyMatchedTo", { name: matchedClientName })}
                  </p>
                )}
                {companyMatchStatus === 'new' && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    {t("jobParser.companyNewHint")}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location">{t("common.location")}</Label>
                <LocationAutocomplete
                  id="location"
                  value={formData.location}
                  onChange={(value) => handleInputChange("location", value)}
                  placeholder="z.B. Zürich, Schweiz"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">{t("jobs.workType")}</Label>
                <Select value={formData.type} onValueChange={(value) => handleInputChange("type", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Vollzeit">{t("jobs.fullTime")}</SelectItem>
                    <SelectItem value="Teilzeit">{t("jobs.partTime")}</SelectItem>
                    <SelectItem value="Freelance">{t("jobs.freelance")}</SelectItem>
                    <SelectItem value="Remote">{t("jobs.remote")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary">{t("common.salary")}</Label>
                <Input
                  id="salary"
                  value={formData.salary}
                  onChange={(e) => handleInputChange("salary", e.target.value)}
                  placeholder="z.B. 65-75k €"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("common.description")}</Label>
              <RichTextEditor
                content={formData.description}
                onChange={(content) => handleInputChange("description", content)}
                placeholder={t("dialogs.shortDescription")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("jobs.tasks")}</Label>
              <RichTextEditor
                content={formData.responsibilities}
                onChange={(content) => handleInputChange("responsibilities", content)}
                placeholder={t("form.mainTasks")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("jobs.requirements")}</Label>
              <RichTextEditor
                content={formData.requirements}
                onChange={(content) => handleInputChange("requirements", content)}
                placeholder={t("form.requiredQualifications")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("jobs.benefits")}</Label>
              <RichTextEditor
                content={formData.benefits}
                onChange={(content) => handleInputChange("benefits", content)}
                placeholder={t("jobs.benefitsPlaceholder")}
              />
            </div>
          </div>

          <Separator />

          {/* Candidate Match Section */}
          <div className="space-y-3">
            <Label>{t("jobs.matchWithCandidate")}</Label>
            <p className="text-xs text-muted-foreground">{t("jobs.matchWithCandidateHint")}</p>
            
            {selectedCandidate ? (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-accent/50">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={selectedCandidate.avatar_url || ''} />
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{selectedCandidate.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{selectedCandidate.position || t("matches.noPosition")}</p>
                </div>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setSelectedCandidate(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder={t("matches.searchCandidate")}
                  value={candidateSearch}
                  onChange={(e) => {
                    setCandidateSearch(e.target.value);
                    setShowCandidateDropdown(true);
                  }}
                  onFocus={() => setShowCandidateDropdown(true)}
                />
                {showCandidateDropdown && candidateSearch && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                    {filteredCandidates.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-3">{t("matches.noCandidates")}</p>
                    ) : (
                      filteredCandidates.slice(0, 5).map((candidate) => (
                        <div
                          key={candidate.id}
                          className="flex items-center gap-2 p-2 hover:bg-accent cursor-pointer transition-colors"
                          onClick={() => {
                            setSelectedCandidate(candidate);
                            setCandidateSearch("");
                            setShowCandidateDropdown(false);
                          }}
                        >
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={candidate.avatar_url || ''} />
                            <AvatarFallback className="bg-muted text-muted-foreground">
                              <User className="h-3 w-3" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{candidate.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{candidate.position || t("matches.noPosition")}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Job Duplicate Warning */}
          {!duplicatesIgnored && (
            <JobDuplicateWarning
              duplicates={jobDuplicates}
              onIgnore={() => setDuplicatesIgnored(true)}
            />
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isSubmitting ? t("common.creating") : t("common.create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
