import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Ban } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";

interface BlacklistEntry {
  id: string;
  client_id: string;
  reason: string | null;
  created_at: string;
  client_name?: string;
}

export function PublicationBlacklist() {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [reason, setReason] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchEntries = async () => {
    const { data } = await supabase
      .from('publication_blacklist')
      .select('*, clients(name)')
      .order('created_at', { ascending: false });
    if (data) {
      setEntries(data.map((e: any) => ({ ...e, client_name: e.clients?.name })));
    }
  };

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('id, name').order('name');
    if (data) setClients(data);
  };

  useEffect(() => { fetchEntries(); fetchClients(); }, []);

  const handleAdd = async () => {
    if (!selectedClient) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('publication_blacklist').insert({
      user_id: user.id,
      client_id: selectedClient,
      reason: reason || null,
    } as any);

    toast.success(t('publicationManager.companyAddedToBlacklist'));
    setSelectedClient("");
    setReason("");
    setDialogOpen(false);
    fetchEntries();
  };

  const handleRemove = async (id: string) => {
    await supabase.from('publication_blacklist').delete().eq('id', id);
    toast.success(t('publicationManager.removedFromBlacklist'));
    fetchEntries();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-5 w-5" />
          {t("publicationManager.tabs.blacklist")}
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />{t("publicationManager.addToBlacklist")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("publicationManager.addToBlacklist")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("common.company")}</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("publicationManager.selectCompany")} />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("publicationManager.blacklistReason")}</Label>
                <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional..." />
              </div>
              <Button onClick={handleAdd} className="w-full">{t("publicationManager.addToBlacklist")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{t("publicationManager.noCompaniesOnBlacklist")}</p>
        ) : (
          <div className="space-y-3">
            {entries.map(entry => (
              <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="font-medium">{entry.client_name}</p>
                  {entry.reason && <p className="text-sm text-muted-foreground">{entry.reason}</p>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleRemove(entry.id)}>
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
