import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "./contexts/AuthContext";
import { ShortcutsProvider } from "./contexts/ShortcutsContext";
import { AIMatchingProvider } from "./contexts/AIMatchingContext";
import { UrlFixer } from "./components/UrlFixer";
import { Layout } from "./components/layout/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Candidates from "./pages/Candidates";
import CandidateDetail from "./pages/CandidateDetail";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Jobs from "./pages/Jobs";
import Orders from "./pages/Orders";
import JobDetail from "./pages/JobDetail";
import Pipeline from "./pages/Pipeline";
import Recruiting from "./pages/Recruiting";
import Analytics from "./pages/Analytics";
import AIMatches from "./pages/AIMatches";
import Tasks from "./pages/Tasks";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import PublicationManager from "./pages/PublicationManager";
import Applications from "./pages/Applications";
import ContentManager from "./pages/ContentManager";
import MarketRadar from "./pages/MarketRadar";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AccessDenied from "./pages/AccessDenied";
import CandidatePortal from "./pages/CandidatePortal";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <AIMatchingProvider>
          <ShortcutsProvider>
            <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <UrlFixer />
              <Routes>
                {/* Public routes */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/access-denied" element={<AccessDenied />} />
                <Route path="/candidate-portal" element={<CandidatePortal />} />
                
                {/* Protected routes with Layout */}
                <Route path="/" element={<Layout />}>
                  {/* Everyone can access */}
                  <Route index element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user', 'viewer']}>
                      <Dashboard />
                    </ProtectedRoute>
                  } />
                  <Route path="candidates" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user', 'viewer']}>
                      <Candidates />
                    </ProtectedRoute>
                  } />
                  <Route path="candidates/:id" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user', 'viewer']}>
                      <CandidateDetail />
                    </ProtectedRoute>
                  } />
                  <Route path="jobs" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user', 'viewer']}>
                      <Jobs />
                    </ProtectedRoute>
                  } />
                  <Route path="jobs/:id" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user', 'viewer']}>
                      <JobDetail />
                    </ProtectedRoute>
                  } />
                  <Route path="orders" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user']}>
                      <Orders />
                    </ProtectedRoute>
                  } />
                  
                  {/* Recruiters and above */}
                  <Route path="clients" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user']}>
                      <Clients />
                    </ProtectedRoute>
                  } />
                  <Route path="clients/:id" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user']}>
                      <ClientDetail />
                    </ProtectedRoute>
                  } />
                  <Route path="pipeline" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user']}>
                      <Pipeline />
                    </ProtectedRoute>
                  } />
                  <Route path="recruiting" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user']}>
                      <Recruiting />
                    </ProtectedRoute>
                  } />
                  <Route path="tasks" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user']}>
                      <Tasks />
                    </ProtectedRoute>
                  } />
                  <Route path="ai-matches" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user']}>
                      <AIMatches />
                    </ProtectedRoute>
                  } />
                  <Route path="settings" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user']}>
                      <Settings />
                    </ProtectedRoute>
                  } />
                  <Route path="publication-manager" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user']}>
                      <PublicationManager />
                    </ProtectedRoute>
                  } />
                  <Route path="applications" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user']}>
                      <Applications />
                    </ProtectedRoute>
                  } />
                  <Route path="content-manager" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user']}>
                      <ContentManager />
                    </ProtectedRoute>
                  } />
                  <Route path="market-radar" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager', 'user']}>
                      <MarketRadar />
                    </ProtectedRoute>
                  } />
                  
                  {/* Managers and admins only */}
                  <Route path="analytics" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <Analytics />
                    </ProtectedRoute>
                  } />
                </Route>
                
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            </TooltipProvider>
          </ShortcutsProvider>
        </AIMatchingProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
