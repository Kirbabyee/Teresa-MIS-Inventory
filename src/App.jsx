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
import ActivateAccount from "./pages/ActivateAccount";
import ForgotPassword from "./pages/ForgotPassword";
import { LoadingPopup } from "@/components/loaders/LoadingPopUp";
import { useAuth } from "@/lib/AuthContext";

const SESSION_KEY = "app_session";
const SESSION_EVENT = "app_session_change";
let cachedSessionRaw = null;
let cachedSessionParsed = null;

const getSessionSnapshot = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    cachedSessionRaw = null;
    cachedSessionParsed = null;
    return null;
  }

  if (raw !== cachedSessionRaw) {
    cachedSessionRaw = raw;
    try {
      cachedSessionParsed = JSON.parse(raw);
    } catch {
      cachedSessionParsed = null;
    }
  }

  const session = cachedSessionParsed;
  if (!session?.email) return null;

  if (session?.expiresAt && Date.now() > Number(session.expiresAt)) {
    return null;
  }

  return session;
};

const subscribeToSessionChanges = (onStoreChange) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const notify = () => onStoreChange();
  window.addEventListener(SESSION_EVENT, notify);
  window.addEventListener("storage", notify);

  return () => {
    window.removeEventListener(SESSION_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
};

const getServerSnapshot = () => null;

const isAdminSession = (session) => {
  const role = String(session?.role || session?.account_type || "").toLowerCase();
  return role === "admin" || role === "superadmin";
};

function AdminRoute({ session, children }) {
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdminSession(session)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppContent({ session, authenticated }) {
  const { isGlobalLoading, globalLoadingMessage } = useAuth();

  return (
    <Router>
      <Routes>
        <Route
          path="/activate-account"
          element={<ActivateAccount />}
        />
        <Route
          path="/login"
          element={authenticated ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/forgot-password"
          element={authenticated ? <Navigate to="/" replace /> : <ForgotPassword />}
        />
        <Route
          path="/"
          element={
            authenticated ? <Layout /> : <Navigate to="/login" replace />
          }
        >
          <Route index element={<Dashboard />} />
          <Route
            path="manage/accounts"
            element={
              <AdminRoute session={session}>
                <UserAccounts />
              </AdminRoute>
            }
          />
          <Route
            path="manage/inventory_manager"
            element={
              <AdminRoute session={session}>
                <Inventory />
              </AdminRoute>
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
          element={<Navigate to={authenticated ? "/" : "/login"} replace />}
        />
      </Routes>
      <LoadingPopup show={isGlobalLoading} message={globalLoadingMessage} color="#ffffff" />
    </Router>
  );
}

function App() {
  const session = useSyncExternalStore(
    subscribeToSessionChanges,
    getSessionSnapshot,
    getServerSnapshot,
  );
  const authenticated = Boolean(session);

  return (
    <QueryClientProvider client={queryClientInstance}>
      <AuthProvider>
        <AppContent session={session} authenticated={authenticated} />
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
