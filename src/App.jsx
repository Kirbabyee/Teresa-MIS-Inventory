import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
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

function RequireAuth({ children }) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <Routes>
          <Route
            path="/login"
            element={isAuthenticated() ? <Navigate to="/" replace /> : <Login />}
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <HRISLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="laboratory/borrowing" element={<Borrowing />} />
            <Route path="laboratory/inventory" element={<Inventory />} />
            <Route path="*" element={<PageNotFound />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
