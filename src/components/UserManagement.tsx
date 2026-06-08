import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Trash2, Clock, CheckCircle, XCircle, UserPlus, Loader2 } from "lucide-react";
import { z } from "zod";

interface Invitation {
  id: string;
  email: string;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export function UserManagement() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);

  const emailSchema = z.string().email(t("admin.invalidEmail"));

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvitations(data || []);
    } catch (error) {
      console.error('Error loading invitations:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.invitationsLoadError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendInvitation = async () => {
    try {
      emailSchema.parse(newEmail);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: t("admin.validationError"),
          description: error.issues[0].message,
          variant: "destructive",
        });
      }
      return;
    }

    setSendingInvite(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { data: existing } = await supabase
        .from('invitations')
        .select('id')
        .eq('email', newEmail.toLowerCase())
        .eq('status', 'pending')
        .single();

      if (existing) {
        toast({
          title: t("admin.invitationExists"),
          description: t("admin.invitationExistsDesc"),
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('invitations')
        .insert({
          email: newEmail.toLowerCase(),
          invited_by: user.id,
        });

      if (error) throw error;

      toast({
        title: t("admin.invitationCreated"),
        description: t("admin.invitationCreatedDesc", { email: newEmail }),
      });
      setNewEmail("");
      loadInvitations();
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      toast({
        title: t("toast.error"),
        description: error.message || t("toast.invitationCreateError"),
        variant: "destructive",
      });
    } finally {
      setSendingInvite(false);
    }
  };

  const deleteInvitation = async (id: string, email: string) => {
    try {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: t("admin.invitationDeleted"),
        description: t("admin.invitationDeletedDesc", { email }),
      });
      loadInvitations();
    } catch (error) {
      console.error('Error deleting invitation:', error);
      toast({
        title: t("toast.error"),
        description: t("toast.invitationDeleteError"),
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string, expiresAt: string) => {
    const isExpired = new Date(expiresAt) < new Date();
    
    if (status === 'accepted') {
      return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />{t("admin.statusAccepted")}</Badge>;
    }
    if (isExpired || status === 'expired') {
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{t("admin.statusExpired")}</Badge>;
    }
    return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />{t("admin.statusPending")}</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          {t("admin.userManagement")}
        </CardTitle>
        <CardDescription>
          {t("admin.userManagementDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="invite-email" className="sr-only">{t("common.email")}</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="benutzer@email.de"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendInvitation()}
              disabled={sendingInvite}
            />
          </div>
          <Button onClick={sendInvitation} disabled={sendingInvite || !newEmail}>
            {sendingInvite ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                {t("admin.invite")}
              </>
            )}
          </Button>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium">{t("admin.invitations")}</h4>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("admin.noInvitations")}
            </p>
          ) : (
            <div className="space-y-2">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{invitation.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("admin.invitedAt")} {formatDate(invitation.created_at)}
                        {invitation.status !== 'accepted' && (
                          <> • {t("admin.validUntil")} {formatDate(invitation.expires_at)}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(invitation.status, invitation.expires_at)}
                    {invitation.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteInvitation(invitation.id, invitation.email)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
