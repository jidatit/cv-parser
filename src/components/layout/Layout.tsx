import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { EnrichmentBanner } from "./EnrichmentBanner";
import { Outlet } from "react-router-dom";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useGlobalScanPolling } from "@/hooks/useGlobalScanPolling";
import { EnrichmentProvider } from "@/contexts/EnrichmentContext";

export function Layout() {
  // Enable global keyboard shortcuts
  useKeyboardShortcuts();
  // Global polling for background market radar scans
  useGlobalScanPolling();

  return (
    <EnrichmentProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </div>
        <EnrichmentBanner />
      </SidebarProvider>
    </EnrichmentProvider>
  );
}
