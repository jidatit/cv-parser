import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useGoBack } from "@/hooks/useGoBack";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldX, ArrowLeft, Home, Shield, ShieldCheck, Briefcase, Eye } from "lucide-react";
import { useUserRole, UserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const roleLabels: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  admin: { label: "Admin", icon: ShieldCheck, color: "bg-amber-500" },
  manager: { label: "Manager", icon: Briefcase, color: "bg-blue-500" },
  user: { label: "Recruiter", icon: Shield, color: "bg-secondary" },
  viewer: { label: "Viewer", icon: Eye, color: "bg-muted" },
};

const roleHierarchy: UserRole[] = ['viewer', 'user', 'manager', 'admin'];

export default function AccessDenied() {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useGoBack('/');
  const { role } = useUserRole();
  const { user } = useAuth();
  const notificationSent = useRef(false);
  
  // Get required roles from state (passed by ProtectedRoute)
  const requiredRoles = (location.state?.requiredRoles as UserRole[]) || [];
  const attemptedPath = location.state?.attemptedPath || "diese Seite";

  // Notify admins about the access attempt
  useEffect(() => {
    const notifyAdmins = async () => {
      // Only send notification once per page load and only if we have user info
      if (notificationSent.current || !user?.email || !attemptedPath) return;
      notificationSent.current = true;

      try {
        console.log("Sending access denied notification...");
        const { error } = await supabase.functions.invoke('notify-access-denied', {
          body: {
            userId: user.id,
            userEmail: user.email,
            userRole: role,
            attemptedPath,
            requiredRoles,
          },
        });

        if (error) {
          console.error("Error notifying admins:", error);
        } else {
          console.log("Admin notification sent successfully");
        }
      } catch (error) {
        console.error("Failed to notify admins:", error);
      }
    };

    notifyAdmins();
  }, [user, role, attemptedPath, requiredRoles]);

  // Find minimum required role
  const minRequiredRole = requiredRoles.length > 0 
    ? roleHierarchy.find(r => requiredRoles.includes(r)) 
    : null;

  const currentRoleInfo = role ? roleLabels[role] : null;
  const requiredRoleInfo = minRequiredRole ? roleLabels[minRequiredRole] : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Zugriff verweigert</CardTitle>
          <CardDescription className="text-base mt-2">
            Sie haben keine Berechtigung, auf diese Seite zuzugreifen.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Current role */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Ihre aktuelle Rolle:</span>
              {currentRoleInfo ? (
                <Badge className={`${currentRoleInfo.color} text-white`}>
                  <currentRoleInfo.icon className="h-3 w-3 mr-1" />
                  {currentRoleInfo.label}
                </Badge>
              ) : (
                <Badge variant="outline">Keine Rolle zugewiesen</Badge>
              )}
            </div>
            
            {requiredRoleInfo && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Benötigte Rolle:</span>
                <Badge className={`${requiredRoleInfo.color} text-white`}>
                  <requiredRoleInfo.icon className="h-3 w-3 mr-1" />
                  {requiredRoleInfo.label} oder höher
                </Badge>
              </div>
            )}
          </div>

          {/* Explanation */}
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Warum sehe ich diese Seite?</strong>
            </p>
            <p>
              Der Zugriff auf <code className="bg-muted px-1 py-0.5 rounded text-xs">{attemptedPath}</code> ist 
              auf bestimmte Benutzerrollen beschränkt. Ihre aktuelle Rolle hat keine ausreichenden Berechtigungen.
            </p>
            <p>
              Wenn Sie glauben, dass dies ein Fehler ist, wenden Sie sich bitte an Ihren Administrator.
            </p>
          </div>

          {/* Role hierarchy explanation */}
          <div className="border rounded-lg p-4">
            <p className="text-sm font-medium mb-3">Rollenhierarchie:</p>
            <div className="flex items-center gap-2 flex-wrap">
              {roleHierarchy.slice().reverse().map((r, index) => {
                const info = roleLabels[r];
                const isCurrentRole = r === role;
                const hasAccess = requiredRoles.includes(r);
                return (
                  <div key={r} className="flex items-center gap-2">
                    <Badge 
                      variant={isCurrentRole ? "default" : "outline"}
                      className={`${isCurrentRole ? info.color + ' text-white' : ''} ${hasAccess ? 'ring-2 ring-green-500 ring-offset-1' : ''}`}
                    >
                      <info.icon className="h-3 w-3 mr-1" />
                      {info.label}
                    </Badge>
                    {index < 3 && <span className="text-muted-foreground">→</span>}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Rollen mit grünem Rahmen haben Zugriff auf diese Seite.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={goBack}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück
            </Button>
            <Button 
              className="flex-1"
              onClick={() => navigate("/")}
            >
              <Home className="h-4 w-4 mr-2" />
              Zum Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
