/**
 * Page access configuration for Role-Based Access (RBA)
 * These are all available pages that can be assigned to positions
 */

export const ALL_PAGES = [
  // Dashboard
  { path: "/", label: "Dashboard", section: "Core" },

  // Manage
  { path: "/manage/accounts", label: "User Accounts", section: "Manage" },
  { path: "/project-sites", label: "Project Sites", section: "Manage" },
  { path: "/departments", label: "Departments", section: "Manage" },
  { path: "/positions", label: "Positions", section: "Manage" },
  { path: "/tasks", label: "Employee Tasks", section: "Manage" },
  { path: "/org-chart", label: "Org Chart", section: "Manage" },
  { path: "/documents", label: "201 File Management", section: "Manage" },
  { path: "/announcements", label: "Announcements", section: "Manage" },

  // Recruitment
  { path: "/job-postings", label: "Job Postings", section: "Recruitment" },
  { path: "/applicants", label: "Applicant Tracking", section: "Recruitment" },
  { path: "/interviews", label: "Interviews", section: "Recruitment" },
  { path: "/job-offers", label: "Job Offers", section: "Recruitment" },

  // Time & Attendance
  { path: "/attendance", label: "Time Logs", section: "Time & Attendance" },
  { path: "/leaves", label: "Leave Requests", section: "Time & Attendance" },
  { path: "/overtime", label: "Overtime Requests", section: "Time & Attendance" },
  { path: "/holidays", label: "Holiday Setup", section: "Time & Attendance" },
  { path: "/schedules", label: "Schedules", section: "Time & Attendance" },

  // Payroll
  { path: "/payroll", label: "Payroll Periods", section: "Payroll" },
  { path: "/payslips", label: "Payslips", section: "Payroll" },
  { path: "/salary-profiles", label: "Salary Profiles", section: "Payroll" },
  { path: "/allowances", label: "Allowances", section: "Payroll" },
  { path: "/loans", label: "Loans", section: "Payroll" },

  // Performance
  { path: "/evaluations", label: "Evaluations", section: "Performance" },
  { path: "/kpi", label: "KPI Setup", section: "Performance" },
  { path: "/disciplinary", label: "Disciplinary Records", section: "Performance" },
  { path: "/promotions", label: "Promotion History", section: "Performance" },

  // HR Reports
  { path: "/reports/headcount", label: "Headcount Report", section: "HR Reports" },
  { path: "/reports/leaves", label: "Leave Balance Report", section: "HR Reports" },
  { path: "/reports/payroll", label: "Payroll Summary", section: "HR Reports" },
  { path: "/reports/attrition", label: "Attrition Report", section: "HR Reports" },
];

/**
 * Default pages that employees have access to (dashboard only)
 */
export const DEFAULT_EMPLOYEE_PAGES = ["/"];

/**
 * Pages only superadmins can access
 */
export const ADMIN_ONLY_PAGES = [
  "/manage/accounts",
  "/project-sites",
  "/departments",
  "/positions",
  "/tasks",
  "/org-chart",
  "/documents",
  "/announcements",
  "/job-postings",
  "/applicants",
  "/interviews",
  "/job-offers",
  "/payroll",
  "/salary-profiles",
  "/allowances",
  "/loans",
];

/**
 * Get all pages grouped by section
 */
export const getPagesBySection = () => {
  const grouped = {};
  ALL_PAGES.forEach((page) => {
    if (!grouped[page.section]) {
      grouped[page.section] = [];
    }
    grouped[page.section].push(page);
  });
  return grouped;
};

/**
 * Check if a path has access
 */
export const hasPageAccess = (userPageAccess, path) => {
  if (!userPageAccess || !Array.isArray(userPageAccess)) return false;
  // Check for exact match or parent path match for nested routes
  return userPageAccess.some(
    (accessPath) =>
      path === accessPath ||
      path.startsWith(accessPath + "/") ||
      accessPath.startsWith(path + "/")
  );
};

/**
 * Check if user can access a page
 * Superadmins automatically have access to everything
 */
export const canAccessPage = (isSuperAdmin, userPageAccess, path) => {
  if (isSuperAdmin) return true;
  return hasPageAccess(userPageAccess, path);
};
