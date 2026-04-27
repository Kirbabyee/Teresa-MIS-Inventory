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
import HRISLayout from "./components/HRISLayout";
import Dashboard from "./pages/Dashboard";
import Borrowing from "./pages/Borrowing";
import Inventory from "./pages/Inventory";
import Laboratory1 from "./pages/Laboratory1";
import UserAccounts from "./pages/UserAccounts";

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
            path="/login"
            element={authenticated ? <Navigate to="/" replace /> : <Login />}
          />
          <Route
            path="/"
            element={
              authenticated ? <HRISLayout /> : <Navigate to="/login" replace />
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="manage/accounts" element={<UserAccounts />} />
            <Route path="laboratory/borrowing" element={<Borrowing />} />
            <Route path="laboratory/inventory" element={<Inventory />} />
            <Route path="laboratory/laboratory-1" element={<Laboratory1 />} />
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
