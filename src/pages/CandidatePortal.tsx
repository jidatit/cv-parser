import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function CandidatePortal() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">
            Willkommen{userProfile?.full_name ? `, ${userProfile.full_name}` : ""}!
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Vielen Dank für Ihre Bewerbung. Ihr Profil wurde erfolgreich erstellt.
            Unser Team wird sich in Kürze bei Ihnen melden.
          </p>
          <p className="text-sm text-muted-foreground">
            Falls Sie Fragen haben, kontaktieren Sie uns gerne direkt.
          </p>
          <Button variant="outline" onClick={handleLogout} className="mt-4">
            <LogOut className="h-4 w-4 mr-2" />
            Abmelden
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
