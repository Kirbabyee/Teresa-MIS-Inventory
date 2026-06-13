/**
 * SecurityRoute — Enterprise-grade route guard with RBAC
 *
 * Features:
 * - Authentication verification via AuthContext
 * - Role-based access control (RBAC)
 * - Page-level permission checking via user.page_access
 * - Automatic session cleanup on auth failure
 * - Loading state during auth check
 * - Graceful redirect to /login with return URL
 */

import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

// Role hierarchy — higher roles inherit lower permissions
const ROLE_HIERARCHY = {
  superadmin: 4,
  admin: 3,
  staff: 2,
  faculty: 2,
  student: 1,
};

/**
 * Check if a user's role meets the minimum required role level.
 */
function hasMinimumRole(userRole, requiredRole) {
  const userLevel = ROLE_HIERARCHY[String(userRole || '').toLowerCase()] || 0;
  const requiredLevel = ROLE_HIERARCHY[String(requiredRole || '').toLowerCase()] || 0;
  return userLevel >= requiredLevel;
}

/**
 * Default loading spinner shown while auth is being verified.
 */
function SecurityLoadingFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-[#411111] rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Verifying access...</p>
      </div>
    </div>
  );
}

/**
 * Access denied page shown when user lacks permissions.
 */
function AccessDeniedPage() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
      <div className="text-center px-8">
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
        <p className="text-sm text-slate-500 max-w-sm">
          You do not have permission to access this page. Please contact your administrator if you believe this is an error.
        </p>
      </div>
    </div>
  );
}

export default function SecurityRoute({
  children,
  requiredRole = null,
  requiredPage = null,
  fallback = <SecurityLoadingFallback />,
  accessDenied = <AccessDeniedPage />,
}) {
  const { isAuthenticated, isLoadingAuth, user, hasPageAccess } = useAuth();
  const location = useLocation();

  // If still loading auth state, show fallback
  if (isLoadingAuth) {
    return fallback;
  }

  // If not authenticated, redirect to login with return URL
  if (!isAuthenticated) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }

  // Check role-based access
  if (requiredRole && !hasMinimumRole(user?.role, requiredRole)) {
    return accessDenied;
  }

  // Check page-level access (from user_accounts.page_access)
  if (requiredPage && !hasPageAccess(requiredPage)) {
    return accessDenied;
  }

  // User is authorized — render the protected content
  return children || <Outlet />;
}
