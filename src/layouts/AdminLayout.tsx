import { Suspense } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { useTrackPageVisit } from "@/hooks/useTrackPageVisit";
import { usePrefetchTelas } from "@/hooks/usePrefetchTelas";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";


export default function AdminLayout() {
  const { user, roles, loading } = useAuth();
  useTrackPageVisit();
  usePrefetchTelas();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const hasAccess = roles.includes("super_admin") || roles.includes("admin_rh");
  if (!hasAccess) {
    return <Navigate to="/sem-permissao" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar />
        <div className="flex-1 flex flex-col">

          <main className="flex-1 overflow-auto relative">
            <Suspense fallback={
              <div className="flex items-center justify-center h-full p-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              </div>
            }>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      <CommandPaletteProvider />
    </SidebarProvider>
  );
}
