import { useState, useEffect, useCallback } from "react";
import {
  fetchDefectRateBySection,
  fetchBorrowingCompliance,
  fetchSecurityThreatAssessment,
  fetchTopBorrowers,
  fetchAuditAnomalies,
  fetchDefectRateTrend,
  fetchInventoryUtilization,
  fetchAllItemDetails,
  fetchBorrowingItemsBySection,
  fetchDefectiveReturns,
  fetchStockReplenishmentWatchlist,
} from "@/lib/analyticsApi";

/**
 * Master analytics data hook.
 * Fetches all analytics in parallel via Promise.allSettled.
 *
 * @param {number|'all'} timeRangeDays - Number of days to look back (7, 30, 90, or 'all')
 * @returns {{ loading, error, lastUpdated, refetch, ...data }}
 */
export const useAnalytics = (timeRangeDays = 30) => {
  const [data, setData] = useState({
    defectBySection: [],
    borrowingCompliance: null,
    securityThreat: null,
    topBorrowers: [],
    auditAnomalies: null,
    defectTrend: [],
    inventoryUtilization: [],
    itemDetails: [],
    borrowingItemsBySection: [],
    defectiveReturns: 0,
    stockWatchlist: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(() => {
    setLoading(true);
    setError(null);

    // Normalize time range
    const days = timeRangeDays === "all" ? 365 : Number(timeRangeDays);

    Promise.allSettled([
      fetchDefectRateBySection(),
      fetchBorrowingCompliance(days),
      fetchSecurityThreatAssessment(),
      fetchTopBorrowers(90),
      fetchAuditAnomalies(Math.min(days, 30)),
      fetchDefectRateTrend(days),
      fetchInventoryUtilization(),
      fetchAllItemDetails(),
      fetchBorrowingItemsBySection(days),
      fetchDefectiveReturns(days),
      fetchStockReplenishmentWatchlist(),
    ]).then((results) => {
      const [
        defectBySection,
        borrowingCompliance,
        securityThreat,
        topBorrowers,
        auditAnomalies,
        defectTrend,
        inventoryUtilization,
        itemDetails,
        borrowingItemsBySection,
        defectiveReturns,
        stockWatchlist,
      ] = results;

      setData({
        defectBySection:
          defectBySection.status === "fulfilled" ? defectBySection.value : [],
        borrowingCompliance:
          borrowingCompliance.status === "fulfilled"
            ? borrowingCompliance.value
            : null,
        securityThreat:
          securityThreat.status === "fulfilled" ? securityThreat.value : null,
        topBorrowers:
          topBorrowers.status === "fulfilled" ? topBorrowers.value : [],
        auditAnomalies:
          auditAnomalies.status === "fulfilled" ? auditAnomalies.value : null,
        defectTrend:
          defectTrend.status === "fulfilled" ? defectTrend.value : [],
        inventoryUtilization:
          inventoryUtilization.status === "fulfilled"
            ? inventoryUtilization.value
            : [],
        itemDetails:
          itemDetails.status === "fulfilled" ? itemDetails.value : [],
        borrowingItemsBySection:
          borrowingItemsBySection.status === "fulfilled"
            ? borrowingItemsBySection.value
            : [],
        defectiveReturns:
          defectiveReturns.status === "fulfilled" ? defectiveReturns.value : 0,
        stockWatchlist:
          stockWatchlist.status === "fulfilled" ? stockWatchlist.value : [],
      });

      const errors = results
        .filter((r) => r.status === "rejected")
        .map((r) => r.reason?.message || "Unknown error");
      if (errors.length > 0) {
        setError(errors.join("; "));
      }

      setLastUpdated(new Date());
      setLoading(false);
    });
  }, [timeRangeDays]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    ...data,
    loading,
    error,
    lastUpdated,
    refetch: fetchAll,
  };
};
