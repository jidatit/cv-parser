import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { useTranslation } from "react-i18next";

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isInviteMode, setIsInviteMode] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  const emailSchema = z.string().email(t("auth.invalidEmail"));
  const passwordSchema = z.string().min(6, t("auth.passwordMinLength"));

  useEffect(() => {
    // Check for invitation token in URL
    const token = searchParams.get('invite');
    if (token) {
      setInviteToken(token);
      setIsInviteMode(true);
      verifyInvitation(token);
    }
  }, [searchParams]);

  const redirectAfterLogin = async (userId: string) => {
    // Check if user is a candidate
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', userId)
      .single();
    
    if (profile?.user_type === 'candidate') {
      navigate("/candidate-portal");
    } else {
      navigate("/candidates");
    }
  };

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await redirectAfterLogin(session.user.id);
      }
    };
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        await redirectAfterLogin(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const verifyInvitation = async (token: string) => {
    try {
      // Use edge function with rate limiting for secure verification
      const { data, error } = await supabase.functions.invoke('verify-invitation', {
        body: { token }
      });

      if (error || !data?.email) {
        toast({
          title: t("auth.invalidInvitation"),
          description: data?.error || t("auth.invalidInvitationDesc"),
          variant: "destructive",
        });
        setIsInviteMode(false);
        setInviteToken(null);
        return;
      }

      setEmail(data.email);
      toast({
        title: t("auth.invitationVerified"),
        description: t("auth.invitationVerifiedDesc"),
      });
    } catch (error) {
      console.error('Error verifying invitation:', error);
      toast({
        title: t("auth.error"),
        description: t("auth.tryAgainLater"),
        variant: "destructive",
      });
      setIsInviteMode(false);
      setInviteToken(null);
    }
  };

  const validateInputs = (includeFullName = false) => {
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
      if (includeFullName && !fullName.trim()) {
        throw new Error(t("auth.nameRequired"));
      }
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: t("auth.validationError"),
          description: error.issues[0].message,
          variant: "destructive",
        });
      } else if (error instanceof Error) {
        toast({
          title: t("auth.validationError"),
          description: error.message,
          variant: "destructive",
        });
      }
      return false;
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateInputs(true)) return;
    if (!inviteToken) {
      toast({
        title: t("auth.noInvitation"),
        description: t("auth.noInvitationDesc"),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/candidates`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
          }
        }
      });

      if (error) {
        if (error.message.includes("already registered")) {
          toast({
            title: t("auth.accountExists"),
            description: t("auth.accountExistsDesc"),
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        // Mark invitation as accepted
        await supabase
          .from('invitations')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('token', inviteToken);

        toast({
          title: t("auth.signupSuccess"),
          description: t("auth.signupSuccessDesc"),
        });
      }
    } catch (error: any) {
      toast({
        title: t("auth.signupError"),
        description: error.message || t("auth.genericError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateInputs()) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast({
            title: t("auth.loginFailed"),
            description: t("auth.loginFailedDesc"),
            variant: "destructive",
          });
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      toast({
        title: t("auth.loginError"),
        description: error.message || t("auth.genericError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(email);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: t("auth.validationError"),
          description: error.issues[0].message,
          variant: "destructive",
        });
      }
      return;
    }

    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) throw error;

      toast({
        title: t("auth.emailSent"),
        description: t("auth.emailSentDesc"),
      });
      setShowForgotPassword(false);
    } catch (error: any) {
      toast({
        title: t("auth.error"),
        description: error.message || t("auth.genericError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Show signup form if invite token is valid
  if (isInviteMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">{t("auth.title")}</CardTitle>
            <CardDescription className="text-center">
              {t("auth.signupSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">{t("auth.fullName")}</Label>
                <Input
                  id="signup-name"
                  type="text"
                  placeholder={t("auth.fullNamePlaceholder")}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">{t("auth.email")}</Label>
                <Input
                  id="signup-email"
                  type="email"
                  value={email}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  {t("auth.emailFromInvitation")}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">{t("auth.password")}</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  {t("auth.minCharacters")}
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("auth.createAccount")}
              </Button>
              <Button
                type="button"
                variant="link"
                className="w-full text-sm"
                onClick={() => {
                  setIsInviteMode(false);
                  setInviteToken(null);
                  setEmail("");
                }}
                disabled={loading}
              >
                {t("auth.alreadyRegistered")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">{t("auth.title")}</CardTitle>
          <CardDescription className="text-center">
            {t("auth.loginSubtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showForgotPassword ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">{t("auth.email")}</Label>
                <Input
                  id="signin-email"
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">{t("auth.password")}</Label>
                <Input
                  id="signin-password"
                  type="password"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("auth.login")}
              </Button>
              <Button
                type="button"
                variant="link"
                className="w-full text-sm"
                onClick={() => setShowForgotPassword(true)}
                disabled={loading}
              >
                {t("auth.forgotPassword")}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">{t("auth.email")}</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  {t("auth.resetLinkInfo")}
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("auth.sendResetLink")}
              </Button>
              <Button
                type="button"
                variant="link"
                className="w-full text-sm"
                onClick={() => setShowForgotPassword(false)}
                disabled={loading}
              >
                {t("auth.backToLogin")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
