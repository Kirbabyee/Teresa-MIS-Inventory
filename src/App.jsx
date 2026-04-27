import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { queryClientInstance } from "@/lib/query-client";
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

const SESSION_KEY = "app_session";
const SESSION_EVENT = "app_session_change";

const getSession = () => {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.email) return null;
    if (parsed?.expiresAt && Date.now() > Number(parsed.expiresAt)) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
};

const isAuthenticated = () => {
  return Boolean(getSession());
};

const subscribeToSession = (callback) => {
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(SESSION_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(SESSION_EVENT, handler);
  };
};

const getSessionSnapshot = () => getSession();

function useSession() {
  return useSyncExternalStore(subscribeToSession, getSessionSnapshot, () => null);
}

function App() {
  const session = useSession();

  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <Routes>
          <Route
            path="/login"
            element={session ? <Navigate to="/" replace /> : <Login />}
          />
          <Route
            path="/"
            element={session ? <HRISLayout /> : <Navigate to="/login" replace />}
          >
            <Route index element={<Dashboard />} />
            <Route path="borrowing" element={<Borrowing />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="*" element={<PageNotFound />} />
          </Route>
          <Route path="*" element={<Navigate to={session ? "/" : "/login"} replace />} />
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
