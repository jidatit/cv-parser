import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { LocationAutocomplete } from "./LocationAutocomplete";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/hooks/useLanguage";
import { capitalizeCompanyName } from "@/lib/companyUtils";

interface NewClientDialogProps {
  onClientCreated?: () => void;
  trigger?: React.ReactNode;
}

export function NewClientDialog({ onClientCreated, trigger }: NewClientDialogProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [isParsingWebsite, setIsParsingWebsite] = useState(false);
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    industry: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    website: "",
    careers_url: "",
    description: "",
    logo_url: "",
  });
  const { toast } = useToast();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleWebsiteChange = async (value: string) => {
    handleInputChange("website", value);

    if (!value || !value.startsWith('http')) {
      return;
    }

    setIsParsingWebsite(true);
    toast({
      title: t("toast.websiteAnalyzing"),
      description: t("toast.websiteAnalyzingDesc"),
    });

    try {
      const { data, error } = await supabase.functions.invoke('parse-company-website', {
        body: { url: value }
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        const companyInfo = data.data;
        
        if (companyInfo.benefits) {
          const benefitsArray = companyInfo.benefits.split('•').map((b: string) => b.trim()).filter(Boolean);
          setSelectedBenefits(prev => {
            const newBenefits = benefitsArray.filter((b: string) => !prev.includes(b));
            return [...prev, ...newBenefits];
          });
        }
        
        setFormData(prev => ({
          ...prev,
          name: prev.name || companyInfo.name || "",
          industry: prev.industry || companyInfo.industry || "",
          contact_person: prev.contact_person || companyInfo.contact_person || "",
          email: prev.email || companyInfo.email || "",
          phone: prev.phone || companyInfo.phone || "",
          address: prev.address || companyInfo.address || "",
          careers_url: prev.careers_url || companyInfo.careers_url || "",
          description: prev.description || companyInfo.description || "",
          logo_url: prev.logo_url || "",
        }));

        toast({
          title: t("toast.websiteAnalyzed"),
          description: t("toast.websiteAnalyzedDesc"),
        });
      } else {
        throw new Error(data?.error || 'Parsing failed');
      }
    } catch (error: any) {
      console.error('Error parsing website:', error);
      toast({
        title: t("toast.websiteAnalyzeError"),
        description: error.message || t("toast.websiteCouldNotAnalyze"),
        variant: "destructive",
      });
    } finally {
      setIsParsingWebsite(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast({
        title: t("toast.requiredFieldsMissing"),
        description: t("toast.fillAtLeastName"),
        variant: "destructive",
      });
      return;
    }

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

      const benefitsString = selectedBenefits.join(' • ');

      const { data: newClient, error } = await supabase.from('clients').insert({
        user_id: user.id,
        name: capitalizeCompanyName(formData.name),
        industry: formData.industry || null,
        contact_person: formData.contact_person || null,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        website: formData.website || null,
        careers_url: formData.careers_url || null,
        description: formData.description || null,
        benefits: benefitsString || null,
        logo_url: formData.logo_url || null,
      }).select('id').single();

      if (error) throw error;

      // Single centralized enrichment call (handles logo, metadata, AI description)
      if (newClient?.id) {
        supabase.functions.invoke('enrich-client', {
          body: {
            client_id: newClient.id,
            company_name: formData.name,
            website: formData.website || undefined,
          }
        }).then(res => {
          console.log('Client enrichment triggered:', res.data);
        }).catch(err => {
          console.error('Client enrichment error:', err);
        });
      }

      onClientCreated?.();
      
      toast({
        title: t("toast.clientCreated"),
        description: `${formData.name} ${t("toast.clientCreatedDesc")}`,
      });
      
      setFormData({
        name: "",
        industry: "",
        contact_person: "",
        email: "",
        phone: "",
        address: "",
        website: "",
        careers_url: "",
        description: "",
        logo_url: "",
      });
      setSelectedBenefits([]);
      setIsOpen(false);
    } catch (error: any) {
      console.error('Error creating client:', error);
      toast({
        title: t("toast.error"),
        description: error.message || t("toast.createError"),
        variant: "destructive",
      });
    }
  };

  const toggleBenefit = (benefit: string) => {
    setSelectedBenefits(prev => 
      prev.includes(benefit) 
        ? prev.filter(b => b !== benefit)
        : [...prev, benefit]
    );
  };

  const removeBenefit = (benefit: string) => {
    setSelectedBenefits(prev => prev.filter(b => b !== benefit));
  };

  const defaultTrigger = (
    <Button>
      <Plus className="mr-2 h-4 w-4" />
      {t("clients.newClient")}
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dialogs.newClient")}</DialogTitle>
          <DialogDescription>
            {t("dialogs.newClientDesc")}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name and Website - Primary fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 border-b">
            <div className="space-y-2">
              <Label htmlFor="client-name">{t("common.name")} *</Label>
              <Input
                id="client-name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="Firma GmbH"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-website">{t("common.website")}</Label>
              <Input
                id="client-website"
                type="url"
                value={formData.website}
                onChange={(e) => handleWebsiteChange(e.target.value)}
                placeholder="https://www.firma.ch"
                disabled={isParsingWebsite}
              />
              {isParsingWebsite && (
                <p className="text-sm text-muted-foreground">{t("clients.analyzingWebsite")}</p>
              )}
            </div>
          </div>

          {/* Other fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="client-industry">{t("common.industry")}</Label>
              <Input
                id="client-industry"
                value={formData.industry}
                onChange={(e) => handleInputChange("industry", e.target.value)}
                placeholder="IT, Finance, etc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-careers">{t("form.careersPage")}</Label>
              <Input
                id="client-careers"
                type="url"
                value={formData.careers_url}
                onChange={(e) => handleInputChange("careers_url", e.target.value)}
                placeholder="https://www.firma.ch/karriere"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="client-contact">{t("form.contactPerson")}</Label>
              <Input
                id="client-contact"
                value={formData.contact_person}
                onChange={(e) => handleInputChange("contact_person", e.target.value)}
                placeholder="Max Mustermann"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-email">{t("common.email")}</Label>
              <Input
                id="client-email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                placeholder="info@firma.ch"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="client-phone">{t("common.phone")}</Label>
              <Input
                id="client-phone"
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                placeholder="+41 44 123 45 67"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-address">{t("common.address")}</Label>
              <LocationAutocomplete
                id="client-address"
                value={formData.address}
                onChange={(value) => handleInputChange("address", value)}
                placeholder="Musterstrasse 123, 8000 Zürich"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-description">{t("common.description")}</Label>
            <Textarea
              id="client-description"
              value={formData.description}
              onChange={(e) => handleInputChange("description", e.target.value)}
              placeholder={t("dialogs.additionalInfo")}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-benefits">{t("clients.benefits")}</Label>
            <div className="flex flex-wrap gap-2 min-h-[80px] p-3 border rounded-md">
              {selectedBenefits.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("clients.noBenefitsSelected")}</p>
              ) : (
                selectedBenefits.map((benefit) => (
                  <Badge
                    key={benefit}
                    variant="secondary"
                    className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    onClick={() => removeBenefit(benefit)}
                  >
                    {benefit}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit">
              {t("common.create")} {t("common.client")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
