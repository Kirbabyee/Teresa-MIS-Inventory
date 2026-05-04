import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { useSyncExternalStore } from "react";
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
import InventoryTableTest from "./pages/InventoryTableTest";
import Laboratory1 from "./pages/Laboratory1";
import Laboratory2 from "./pages/Laboratory2";
import Laboratory3 from "./pages/Laboratory3";
import Laboratory4 from "./pages/Laboratory4";
import Laboratory5 from "./pages/Laboratory5";
import UserAccounts from "./pages/UserAccounts";
import ActivateAccount from "./pages/ActivateAccount";

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

function App() {
  const session = useSyncExternalStore(
    subscribeToSessionChanges,
    getSessionSnapshot,
    getServerSnapshot,
  );
  const authenticated = Boolean(session);

  return (
    <QueryClientProvider client={queryClientInstance}>
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
              path="manage/inventory"
              element={
                <AdminRoute session={session}>
                  <Inventory />
                </AdminRoute>
              }
            />
            <Route
              path="manage/inventory-table-test"
              element={
                <AdminRoute session={session}>
                  <InventoryTableTest />
                </AdminRoute>
              }
            />
            <Route path="borrowing" element={<Borrowing />} />
            <Route path="inventory" element={<Navigate to="/manage/inventory" replace />} />
            <Route path="inventory/manage" element={<Navigate to="/manage/inventory" replace />} />
            <Route path="inventory/:sectionSlug" element={<InventorySection />} />
            <Route path="laboratory/inventory" element={<Navigate to="/manage/inventory" replace />} />
            <Route path="laboratory/laboratory-1" element={<Laboratory1 />} />
            <Route path="laboratory/laboratory-2" element={<Laboratory2 />} />
            <Route path="laboratory/laboratory-3" element={<Laboratory3 />} />
            <Route path="laboratory/laboratory-4" element={<Laboratory4 />} />
            <Route path="laboratory/laboratory-5" element={<Laboratory5 />} />
            <Route path="*" element={<PageNotFound />} />
          </Route>
          <Route
            path="*"
            element={<Navigate to={authenticated ? "/" : "/login"} replace />}
          />
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
