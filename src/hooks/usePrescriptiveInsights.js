import { useMemo } from "react";
import { generateInsights, SEVERITY } from "@/lib/prescriptiveEngine";

/**
 * Derives prescriptive insights from analytics data.
 *
 * @param {Object} analyticsData - The analytics data object from useAnalytics
 * @returns {{ insights, criticalCount, warningCount, infoCount, totalCount, hasCritical }}
 */
export const usePrescriptiveInsights = (analyticsData) => {
  const insights = useMemo(() => {
    if (!analyticsData) return [];
    return generateInsights(analyticsData);
  }, [analyticsData]);

  const criticalCount = insights.filter(
    (i) => i.severity === SEVERITY.CRITICAL
  ).length;
  const warningCount = insights.filter(
    (i) => i.severity === SEVERITY.WARNING
  ).length;
  const infoCount = insights.filter(
    (i) => i.severity === SEVERITY.INFO
  ).length;

  return {
    insights,
    criticalCount,
    warningCount,
    infoCount,
    totalCount: insights.length,
    hasCritical: criticalCount > 0,
  };
};
