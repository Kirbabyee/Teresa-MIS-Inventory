import { Toaster } from "@/components/ui/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { useSyncExternalStore } from "react";
import { AuthProvider } from "@/lib/AuthContext";
import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Borrowing from "./pages/Borrowing";
import Inventory from "./pages/Inventory";
import InventorySection from "./pages/InventorySection";
import ComputerLaboratoryInventory from "./pages/ComputerLaboratoryInventory";
import UserAccounts from "./pages/UserAccounts";
import SecurityMonitor from "./pages/SecurityMonitor";
import ActivateAccount from "./pages/ActivateAccount";
import ForgotPassword from "./pages/ForgotPassword";
import PublicBorrow from "./pages/PublicBorrow";
import { LoadingPopup } from "@/components/loaders/LoadingPopUp";
import { useAuth } from "@/lib/AuthContext";
import SecurityRoute from "@/components/SecurityRoute";

function AppContent() {
  const { isAuthenticated, isGlobalLoading, globalLoadingMessage } = useAuth();

  return (
    <Router>
      <Routes>
        <Route path="/activate-account" element={<ActivateAccount />} />
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
        />
        <Route path="/public-borrow" element={<PublicBorrow />} />
        <Route
          path="/forgot-password"
          element={isAuthenticated ? <Navigate to="/" replace /> : <ForgotPassword />}
        />
        <Route
          path="/"
          element={
            isAuthenticated ? <Layout /> : <Navigate to="/login" replace />
          }
        >
          <Route index element={<Dashboard />} />

          {/* ── Admin-only: User Accounts ──────────────────────── */}
          <Route
            path="manage/accounts"
            element={
              <SecurityRoute requiredRole="admin">
                <UserAccounts />
              </SecurityRoute>
            }
          />

          {/* ── Admin-only: Inventory Manager ──────────────────── */}
          <Route
            path="manage/inventory_manager"
            element={
              <SecurityRoute requiredRole="admin">
                <Inventory />
              </SecurityRoute>
            }
          />

          {/* ── Admin-only: Security Monitor ───────────────────── */}
          <Route
            path="manage/security"
            element={
              <SecurityRoute requiredRole="admin">
                <SecurityMonitor />
              </SecurityRoute>
            }
          />

          <Route path="borrowing" element={<Borrowing />} />
          <Route path="inventory" element={<Navigate to="/manage/inventory" replace />} />
          <Route path="inventory/manage" element={<Navigate to="/manage/inventory" replace />} />
          <Route path="inventory/laboratory" element={<ComputerLaboratoryInventory />} />
          <Route path="inventory/:sectionSlug" element={<InventorySection />} />
          <Route path="laboratory/inventory" element={<Navigate to="/inventory/laboratory" replace />} />
          <Route path="laboratory/computer-laboratory-inventory" element={<Navigate to="/inventory/laboratory" replace />} />
          <Route path="laboratory/comlab" element={<Navigate to="/inventory/laboratory" replace />} />
          <Route path="*" element={<PageNotFound />} />
        </Route>
        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />}
        />
      </Routes>
      <LoadingPopup show={isGlobalLoading} message={globalLoadingMessage} color="#ffffff" />
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
