import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Phone, Smartphone, Briefcase, Plus, X, Save, Pencil, Trash2, Star } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";

interface ContactPerson {
  id: string;
  name: string;
  position?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  notes?: string;
  is_primary: boolean;
}

interface ContactPersonsTabProps {
  clientId: string;
}

export function ContactPersonsTab({ clientId }: ContactPersonsTabProps) {
  const { t } = useTranslation();
  const [contactPersons, setContactPersons] = useState<ContactPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    position: "",
    email: "",
    phone: "",
    mobile: "",
    notes: "",
    is_primary: false,
  });

  useEffect(() => {
    fetchContactPersons();
  }, [clientId]);

  const fetchContactPersons = async () => {
    try {
      const { data, error } = await supabase
        .from("contact_persons")
        .select("*")
        .eq("client_id", clientId)
        .order("is_primary", { ascending: false })
        .order("name", { ascending: true });

      if (error) throw error;
      setContactPersons(data || []);
    } catch (error) {
      console.error("Error fetching contact persons:", error);
      toast({
        title: t("toast.error"),
        description: t("contacts.loadError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      position: "",
      email: "",
      phone: "",
      mobile: "",
      notes: "",
      is_primary: false,
    });
    setEditingId(null);
    setShowNewForm(false);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: t("toast.error"),
        description: t("contacts.enterName"),
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (editingId) {
        // Update existing
        const { error } = await supabase
          .from("contact_persons")
          .update(formData)
          .eq("id", editingId);

        if (error) throw error;
        toast({
          title: t("contacts.saved"),
          description: t("contacts.updateSuccess"),
        });
      } else {
        // Create new
        const { error } = await supabase
          .from("contact_persons")
          .insert({
            ...formData,
            client_id: clientId,
            user_id: user.id,
          });

        if (error) throw error;
        toast({
          title: t("contacts.saved"),
          description: t("contacts.saveSuccess"),
        });
      }

      resetForm();
      fetchContactPersons();
    } catch (error) {
      console.error("Error saving contact person:", error);
      toast({
        title: t("toast.error"),
        description: t("contacts.saveError"),
        variant: "destructive",
      });
    }
  };

  const handleEdit = (person: ContactPerson) => {
    setFormData({
      name: person.name,
      position: person.position || "",
      email: person.email || "",
      phone: person.phone || "",
      mobile: person.mobile || "",
      notes: person.notes || "",
      is_primary: person.is_primary,
    });
    setEditingId(person.id);
    setShowNewForm(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      const { error } = await supabase
        .from("contact_persons")
        .delete()
        .eq("id", deletingId);

      if (error) throw error;

      toast({
        title: t("toast.deleteSuccess"),
        description: t("contacts.deleted"),
      });

      fetchContactPersons();
    } catch (error) {
      console.error("Error deleting contact person:", error);
      toast({
        title: t("toast.error"),
        description: t("contacts.deleteError"),
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingId(null);
    }
  };

  const confirmDelete = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  if (loading) {
    return <div className="p-6">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-6 mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("contacts.title")}</h3>
        {!showNewForm && (
          <Button onClick={() => setShowNewForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t("contacts.add")}
          </Button>
        )}
      </div>

      {showNewForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? t("contacts.edit") : t("contacts.new")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("form.name")} *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t("contacts.namePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="position">{t("common.position")}</Label>
                <Input
                  id="position"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  placeholder={t("contacts.positionPlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t("common.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@firma.de"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t("common.phone")}</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+49 123 456789"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mobile">{t("contacts.mobile")}</Label>
                <Input
                  id="mobile"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  placeholder="+49 160 123456"
                />
              </div>

              <div className="space-y-2 flex items-end">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_primary"
                    checked={formData.is_primary}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, is_primary: checked === true })
                    }
                  />
                  <Label htmlFor="is_primary" className="cursor-pointer">
                    {t("contacts.primaryContact")}
                  </Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t("common.notes")}</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t("contacts.additionalInfo")}
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} size="sm">
                <Save className="h-4 w-4 mr-2" />
                {t("common.save")}
              </Button>
              <Button onClick={resetForm} variant="outline" size="sm">
                <X className="h-4 w-4 mr-2" />
                {t("common.cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {contactPersons.map((person) => (
              <div key={person.id} className="p-4 hover:bg-muted/30 transition-colors group">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Name and Position */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <h4 className="font-semibold truncate">{person.name}</h4>
                      {person.is_primary && (
                        <Badge variant="secondary" className="gap-1 flex-shrink-0">
                          <Star className="h-3 w-3 fill-current" />
                          {t("contacts.mainContact")}
                        </Badge>
                      )}
                    </div>
                    {person.position && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 ml-6">
                        <Briefcase className="h-3 w-3" />
                        {person.position}
                      </p>
                    )}
                  </div>

                  {/* Middle: Contact Info */}
                  <div className="flex-1 space-y-1 text-sm">
                    {person.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <a href={`mailto:${person.email}`} className="hover:text-primary truncate">
                          {person.email}
                        </a>
                      </div>
                    )}
                    {person.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3 w-3 flex-shrink-0" />
                        <a href={`tel:${person.phone}`} className="hover:text-primary">
                          {person.phone}
                        </a>
                      </div>
                    )}
                    {person.mobile && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Smartphone className="h-3 w-3 flex-shrink-0" />
                        <a href={`tel:${person.mobile}`} className="hover:text-primary">
                          {person.mobile}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(person)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => confirmDelete(person.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {person.notes && (
                  <p className="text-xs text-muted-foreground mt-3 ml-6 line-clamp-2">
                    {person.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {contactPersons.length === 0 && !showNewForm && (
        <Card>
          <CardContent className="p-8 text-center">
            <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              {t("contacts.noContacts")}
            </p>
            <Button onClick={() => setShowNewForm(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t("contacts.addFirst")}
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("contacts.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("contacts.deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
