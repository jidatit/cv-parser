import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";

interface Rule {
  id: string;
  name: string;
  conditions: any;
  is_active: boolean;
  anonymization_level: string;
  auto_publish: boolean;
  created_at: string;
}

export function PublicationRulesManager() {
  const { t } = useLanguage();
  const [rules, setRules] = useState<Rule[]>([]);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleIndustry, setNewRuleIndustry] = useState("");
  const [newRuleLocation, setNewRuleLocation] = useState("");
  const [newRuleLevel, setNewRuleLevel] = useState("medium");
  const [newRuleAutoPublish, setNewRuleAutoPublish] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchRules = async () => {
    const { data } = await supabase.from('publication_rules').select('*').order('created_at', { ascending: false });
    if (data) setRules(data as any);
  };

  useEffect(() => { fetchRules(); }, []);

  const handleAdd = async () => {
    if (!newRuleName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const conditions: any = {};
    if (newRuleIndustry) conditions.industry = newRuleIndustry;
    if (newRuleLocation) conditions.location = newRuleLocation;

    await supabase.from('publication_rules').insert({
      user_id: user.id,
      name: newRuleName,
      conditions,
      anonymization_level: newRuleLevel,
      auto_publish: newRuleAutoPublish,
    } as any);

    toast.success(t('publicationManager.ruleAdded'));
    setNewRuleName(""); setNewRuleIndustry(""); setNewRuleLocation("");
    setNewRuleLevel("medium"); setNewRuleAutoPublish(false);
    setDialogOpen(false);
    fetchRules();
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await supabase.from('publication_rules').update({ is_active: !isActive } as any).eq('id', id);
    fetchRules();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('publication_rules').delete().eq('id', id);
    toast.success(t('publicationManager.ruleDeleted'));
    fetchRules();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("publicationManager.tabs.rules")}</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />{t("publicationManager.addRule")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("publicationManager.addRule")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("publicationManager.ruleName")}</Label>
                <Input value={newRuleName} onChange={e => setNewRuleName(e.target.value)} placeholder={t("publicationManager.ruleNamePlaceholder")} />
              </div>
              <div>
                <Label>{t("publicationManager.industryOptional")}</Label>
                <Input value={newRuleIndustry} onChange={e => setNewRuleIndustry(e.target.value)} placeholder={t("publicationManager.industryPlaceholder")} />
              </div>
              <div>
                <Label>{t("publicationManager.locationOptional")}</Label>
                <Input value={newRuleLocation} onChange={e => setNewRuleLocation(e.target.value)} placeholder={t("publicationManager.locationPlaceholder")} />
              </div>
              <div>
                <Label>{t("publicationManager.rules.anonymizationLevel")}</Label>
                <Select value={newRuleLevel} onValueChange={setNewRuleLevel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t("publicationManager.anonymization.light")}</SelectItem>
                    <SelectItem value="medium">{t("publicationManager.anonymization.medium")}</SelectItem>
                    <SelectItem value="strong">{t("publicationManager.anonymization.strong")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={newRuleAutoPublish} onCheckedChange={setNewRuleAutoPublish} />
                <Label>{t("publicationManager.rules.autoPublish")}</Label>
              </div>
              <Button onClick={handleAdd} className="w-full">{t("publicationManager.addRule")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{t("publicationManager.noRules")}</p>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Switch checked={rule.is_active} onCheckedChange={() => handleToggle(rule.id, rule.is_active)} />
                  <div>
                    <p className="font-medium">{rule.name}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {rule.conditions?.industry && <Badge variant="secondary">{rule.conditions.industry}</Badge>}
                      {rule.conditions?.location && <Badge variant="outline">{rule.conditions.location}</Badge>}
                      <Badge variant="outline">{t(`publicationManager.anonymization.${rule.anonymization_level || 'medium'}`)}</Badge>
                      {rule.auto_publish && <Badge className="bg-green-500/10 text-green-600 border-green-500/20">{t('publicationManager.rules.autoPublish')}</Badge>}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
