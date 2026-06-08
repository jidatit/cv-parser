import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole, UserRole } from "@/hooks/useUserRole";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ 
  children, 
  allowedRoles
}: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { role, isCandidate, loading: roleLoading } = useUserRole();
  const location = useLocation();

  // Show loading state while checking auth
  if (authLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Redirect to auth if not logged in
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Redirect candidate users to their portal
  if (isCandidate) {
    return <Navigate to="/candidate-portal" replace />;
  }

  // If no role restrictions, allow access
  if (!allowedRoles) {
    return <>{children}</>;
  }

  // Check if user has required role
  const hasAccess = role && allowedRoles.includes(role);

  if (!hasAccess) {
    return (
      <Navigate 
        to="/access-denied" 
        state={{ 
          requiredRoles: allowedRoles,
          attemptedPath: location.pathname 
        }} 
        replace 
      />
    );
  }

  return <>{children}</>;
}

// Route configuration with role requirements
export const routePermissions: Record<string, UserRole[]> = {
  '/': ['admin', 'manager', 'user', 'viewer'],
  '/candidates': ['admin', 'manager', 'user', 'viewer'],
  '/jobs': ['admin', 'manager', 'user', 'viewer'],
  '/orders': ['admin', 'manager', 'user'],
  '/clients': ['admin', 'manager', 'user'],
  '/pipeline': ['admin', 'manager', 'user'],
  '/recruiting': ['admin', 'manager', 'user'],
  '/tasks': ['admin', 'manager', 'user'],
  '/ai-matches': ['admin', 'manager', 'user'],
  '/settings': ['admin', 'manager', 'user'],
  '/applications': ['admin', 'manager', 'user'],
  '/publication-manager': ['admin', 'manager', 'user'],
  '/analytics': ['admin', 'manager'],
};

export function getAllowedRoles(path: string): UserRole[] | undefined {
  if (routePermissions[path]) {
    return routePermissions[path];
  }
  const basePath = '/' + path.split('/')[1];
  return routePermissions[basePath];
}
