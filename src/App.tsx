import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Entities from "./pages/Entities";
import Leases from "./pages/Leases";
import LeaseForm from "./pages/LeaseForm";
import LeaseDetail from "./pages/LeaseDetail";
import Users from "./pages/Users";
import Disclosures from "./pages/Disclosures";
import Reports from "./pages/Reports";
import MasterConfig from "./pages/MasterConfig";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppLayout />}>
      <Route path="/" element={<Dashboard />} />
        <Route path="/leases" element={<Leases />} />
        <Route path="/leases/new" element={<LeaseForm />} />
        <Route path="/leases/:id" element={<LeaseDetail />} />
        <Route path="/leases/:id/edit" element={<LeaseForm />} />
        <Route path="/disclosures" element={<Disclosures />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/master/users" element={<Users />} />
        <Route path="/master/groups" element={<Entities />} />
        <Route path="/master/entities" element={<Entities />} />
        <Route path="/master/config" element={<MasterConfig />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
