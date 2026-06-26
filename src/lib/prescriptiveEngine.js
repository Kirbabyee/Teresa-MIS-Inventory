/**
 * Prescriptive Analytics Engine
 * Generates actionable recommendations based on analytics data thresholds.
 * Pure functions: analytics data in → insights array out.
 */

export const RECOMMENDATION_TYPES = {
  PROCUREMENT: "procurement",
  POLICY: "policy",
  SECURITY: "security",
  MAINTENANCE: "maintenance",
  TRAINING: "training",
  OPTIMIZATION: "optimization",
  LIFECYCLE: "lifecycle",
  VENDOR_HOLD: "vendor_hold",
};

export const SEVERITY = {
  CRITICAL: "critical",
  WARNING: "warning",
  INFO: "info",
  SUCCESS: "success",
};

// ─── Severity Sort Order ─────────────────────────────────────────────────
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2, success: 3 };

// ─── Thresholds ──────────────────────────────────────────────────────────
const BRAND_DEFECT_THRESHOLD = 15; // % defect rate to flag a brand
const BRAND_MIN_SAMPLE = 3; // minimum items to qualify brand analysis
const AGING_YEARS_WARNING = 5; // years before lifecycle warning
const AGING_YEARS_CRITICAL = 8; // years before lifecycle critical
const AGING_SPIKE_THRESHOLD = 20; // % defect spike for aging hardware

// ─── Helper: Compute defect status from dynamic table row ─────────────────
function isDefective(item) {
  const statusStr = String(
    item.status || item.condition || item.item_status || ""
  ).toLowerCase();
  const dataStr = String(
    item.data
      ? JSON.stringify(item.data)
      : item.remarks || item.notes || item.details || ""
  ).toLowerCase();
  return statusStr.includes("defect") || dataStr.includes("defect");
}

// ─── Helper: Parse purchase date from various field names ───────────────
function parsePurchaseDate(item) {
  const dateVal =
    item.purchase_date ||
    item.purchaseDate ||
    item.procurement_date ||
    item.acquired_date ||
    item.date_acquired ||
    item.created_at;
  if (!dateVal) return null;
  const d = new Date(dateVal);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Helper: Calculate age in years ──────────────────────────────────────
function ageInYears(date) {
  if (!date) return null;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

// ─── Brand Reliability Defect Matrix ─────────────────────────────────────
function generateBrandInsights(itemDetails, inventoryUtilization) {
  const insights = [];
  if (!itemDetails || itemDetails.length === 0) return insights;

  // Group items by brand
  const brandMap = new Map();
  for (const item of itemDetails) {
    const brand = String(
      item.brand || item.manufacturer || item.make || "Unknown"
    ).trim();
    if (!brand || brand === "Unknown" || brand === "") continue;

    if (!brandMap.has(brand)) {
      brandMap.set(brand, { total: 0, defective: 0, sections: new Set(), models: new Set() });
    }
    const entry = brandMap.get(brand);
    entry.total++;
    if (isDefective(item)) entry.defective++;
    if (item.section_id) entry.sections.add(item.section_id);
    if (item.model) entry.models.add(item.model);
  }

  // Evaluate each brand against threshold
  for (const [brand, data] of brandMap.entries()) {
    if (data.total < BRAND_MIN_SAMPLE) continue;

    const defectRate = Math.round((data.defective / data.total) * 10000) / 100;

    if (defectRate > BRAND_DEFECT_THRESHOLD) {
      insights.push({
        id: `brand-reliability-${brand}`,
        type: "vendor_hold",
        severity: defectRate > 30 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
        title: "Procurement Vendor Risk Hold",
        message: `${brand} has crossed acceptable defect thresholds with a ${defectRate}% failure rate (${data.defective} of ${data.total} units).`,
        detail: `Recommendation: Freeze future procurement workflows for this specific manufacturer and review warranty eligibility. Cross-reference with batch procurement dates to isolate faulty production lots.`,
        actionLabel: "Review Orders",
        actionTarget: "/inventory",
        data: {
          brand,
          defectRate,
          total: data.total,
          defective: data.defective,
          sections: [...data.sections],
        },
      });
    }
  }

  return insights;
}

// ─── Predictive Stock Replenishment Forecast ──────────────────────────────
function generatePredictiveStockInsights(inventoryUtilization) {
  const insights = [];
  if (!inventoryUtilization || inventoryUtilization.length === 0) return insights;

  for (const section of inventoryUtilization) {
    const available = section.available || 0;
    const borrowed = section.borrowed || 0;
    const total = section.total || 0;
    const utilization = section.utilizationRate || 0;

    // High utilization with critically low remaining pool
    if (utilization > 70 && available < 5 && total > 0) {
      // Estimate days until exhaustion based on borrow pace
      const borrowPace = borrowed / 30;
      const daysLeft = borrowPace > 0 ? Math.round(available / borrowPace) : 999;

      if (daysLeft < 30) {
        insights.push({
          id: `predictive-stock-${section.sectionId}`,
          type: "predictive_stock",
          severity: SEVERITY.WARNING,
          title: "Predictive Stock Replenishment Required",
          message: `${section.sectionName} (${section.tabName}) — current borrow trends indicate item pool exhaustion within ${Math.min(daysLeft, 14)} days.`,
          detail: `${available} of ${total} units available with ${borrowed} currently borrowed (${utilization}% utilization). Accelerate procurement to avoid service disruption.`,
          actionLabel: "Procure Units",
          actionTarget: "/inventory",
          data: {
            sectionId: section.sectionId,
            sectionName: section.sectionName,
            available,
            borrowed,
            utilization,
            daysLeft: Math.min(daysLeft, 14),
          },
        });
      }
    }
  }

  return insights;
}

// ─── Lifecycle / Aging Hardware Analysis ─────────────────────────────────
function generateLifecycleInsights(itemDetails, inventoryUtilization) {
  const insights = [];
  if (!itemDetails || itemDetails.length === 0) return insights;

  // Group by brand+purchase_year for batch analysis
  const batchMap = new Map();
  for (const item of itemDetails) {
    const purchaseDate = parsePurchaseDate(item);
    const age = ageInYears(purchaseDate);
    if (age === null) continue;

    const brand = String(
      item.brand || item.manufacturer || item.make || "Unknown"
    ).trim();
    const year = purchaseDate.getFullYear();
    const key = `${brand}|${year}`;

    if (!batchMap.has(key)) {
      batchMap.set(key, {
        brand,
        year,
        total: 0,
        defective: 0,
        sections: new Set(),
        maxAge: age,
      });
    }
    const entry = batchMap.get(key);
    entry.total++;
    if (isDefective(item)) entry.defective++;
    if (item.section_id) entry.sections.add(item.section_id);
    if (age > entry.maxAge) entry.maxAge = age;
  }

  for (const [key, data] of batchMap.entries()) {
    if (data.total < 2) continue;

    const defectRate = Math.round((data.defective / data.total) * 10000) / 100;
    const isAging = data.maxAge >= AGING_YEARS_WARNING;
    const isCriticalAging = data.maxAge >= AGING_YEARS_CRITICAL;
    const hasSpike = defectRate > AGING_SPIKE_THRESHOLD;

    if (isAging && hasSpike) {
      const sectionNames = [...data.sections].map((sid) => {
        const match = (inventoryUtilization || []).find((s) => s.sectionId === sid);
        return match?.sectionName || sid;
      });
      const sectionList =
        sectionNames.length > 3
          ? `${sectionNames.slice(0, 3).join(", ")} and ${sectionNames.length - 3} more`
          : sectionNames.join(", ");

      const severity = isCriticalAging ? SEVERITY.CRITICAL : SEVERITY.WARNING;
      const title = isCriticalAging
        ? "Lifecycle Replacement Recommended"
        : "Aging Hardware Failure Pattern";

      insights.push({
        id: `lifecycle-${key}`,
        type: RECOMMENDATION_TYPES.LIFECYCLE,
        severity,
        title,
        message: `${data.brand} batch from procurement year ${data.year} (${data.total} units, avg age ${Math.round(data.maxAge)} years) shows ${defectRate}% defect rate in ${sectionList}.`,
        detail: isCriticalAging
          ? `This batch has exceeded its expected service life of ${AGING_YEARS_CRITICAL}+ years. Consider scheduled deprecation, migrating remaining working units to low-utilization rooms, and initiating procurement for replacements.`
          : `Failure velocity is elevated for this age group. Schedule preventive maintenance inspection and begin budgeting for phased replacement within the next 12 months.`,
        actionLabel: "View Section",
        actionTarget: sectionNames.length > 0 ? `/inventory` : "/analytics",
        data: {
          brand: data.brand,
          year: data.year,
          total: data.total,
          defective: data.defective,
          defectRate,
          maxAge: Math.round(data.maxAge),
        },
      });
    }
  }

  return insights;
}

// ─── Inventory Section Insights ──────────────────────────────────────────
function generateInventoryInsights(inventoryUtilization) {
  const insights = [];
  if (!inventoryUtilization) return insights;

  for (const section of inventoryUtilization) {
    if (section.defectRate > 15) {
      insights.push({
        id: `procurement-${section.sectionId}`,
        type: RECOMMENDATION_TYPES.PROCUREMENT,
        severity: SEVERITY.CRITICAL,
        title: "Critical Attrition Threshold Cross",
        message: `${section.sectionName} (${section.tabName}) has a ${section.defectRate}% defect rate.`,
        detail: `${section.defective} out of ${section.total} items are defective — exceeds the 15% threshold. Consider replacing aging units.`,
        actionLabel: "View Section",
        actionTarget: `/inventory`,
        data: { defectRate: section.defectRate, sectionName: section.sectionName },
      });
    } else if (section.defectRate > 10) {
      insights.push({
        id: `maintenance-${section.sectionId}`,
        type: RECOMMENDATION_TYPES.MAINTENANCE,
        severity: SEVERITY.WARNING,
        title: "Maintenance Recommended",
        message: `${section.sectionName} defect rate at ${section.defectRate}%.`,
        detail: `Approaching critical threshold (15%). Schedule preventive maintenance to avoid further degradation.`,
        data: { defectRate: section.defectRate, sectionName: section.sectionName },
      });
    }

    if (section.utilizationRate > 80 && section.available > 0) {
      insights.push({
        id: `utilization-${section.sectionId}`,
        type: RECOMMENDATION_TYPES.OPTIMIZATION,
        severity: SEVERITY.INFO,
        title: "Asset Depletion Velocity Warning",
        message: `${section.sectionName} utilization at ${section.utilizationRate}%.`,
        detail: `${section.borrowed} of ${section.available} available items are currently borrowed. Consider expanding inventory.`,
        data: { utilization: section.utilizationRate, sectionName: section.sectionName },
      });
    }
  }

  return insights;
}

// ─── Borrowing Insights ──────────────────────────────────────────────────
function generateBorrowingInsights(borrowing) {
  const insights = [];
  if (!borrowing) return insights;

  if (borrowing.complianceRate < 70 && borrowing.totalTransactions > 0) {
    insights.push({
      id: "compliance-low",
      type: RECOMMENDATION_TYPES.POLICY,
      severity: SEVERITY.CRITICAL,
      title: "Low Return Compliance",
      message: `Return compliance is ${borrowing.complianceRate}%.`,
      detail: `${borrowing.onTimeReturns} on-time vs ${borrowing.lateReturns} late returns in the selected period. Review borrowing period limits and implement reminder procedures.`,
      actionLabel: "View Borrowing",
      actionTarget: "/borrowing",
      data: { complianceRate: borrowing.complianceRate },
    });
  }

  if (borrowing.avgBorrowDays > 5 && borrowing.totalTransactions > 0) {
    insights.push({
      id: "duration-high",
      type: RECOMMENDATION_TYPES.POLICY,
      severity: SEVERITY.WARNING,
      title: "Extended Borrow Duration",
      message: `Average borrow duration is ${borrowing.avgBorrowDays} days.`,
      detail: "Consider reducing maximum borrow period to improve turnover and availability.",
      actionLabel: "View Borrowing",
      actionTarget: "/borrowing",
      data: { avgDays: borrowing.avgBorrowDays },
    });
  }

  if (borrowing.outstanding > 10) {
    insights.push({
      id: "outstanding-high",
      type: RECOMMENDATION_TYPES.POLICY,
      severity: SEVERITY.WARNING,
      title: "High Outstanding Items",
      message: `${borrowing.outstanding} items are currently outstanding.`,
      detail: "Follow up with borrowers to ensure timely returns.",
      actionLabel: "View Outstanding",
      actionTarget: "/borrowing",
    });
  }

  return insights;
}

// ─── Security Insights ───────────────────────────────────────────────────
function generateSecurityInsights(security) {
  const insights = [];
  if (!security) return insights;

  if (security.threatLevel === "critical") {
    insights.push({
      id: "security-critical",
      type: RECOMMENDATION_TYPES.SECURITY,
      severity: SEVERITY.CRITICAL,
      title: "Critical Security Threat",
      message: `Threat level: CRITICAL (score: ${security.threatScore}/100).`,
      detail: `${security.activeLockouts} active lockouts, ${security.suspiciousIPs.length} suspicious IPs detected. Immediate action recommended.`,
      actionLabel: "View Security",
      actionTarget: "/manage/security",
      data: { threatScore: security.threatScore },
    });
  } else if (security.threatLevel === "elevated") {
    insights.push({
      id: "security-elevated",
      type: RECOMMENDATION_TYPES.SECURITY,
      severity: SEVERITY.WARNING,
      title: "Elevated Security Threat",
      message: `Threat level: ELEVATED (score: ${security.threatScore}/100).`,
      detail: `${security.activeLockouts} active lockouts. Monitor the security dashboard closely.`,
      actionLabel: "View Security",
      actionTarget: "/manage/security",
    });
  }

  for (const ip of security.suspiciousIPs || []) {
    insights.push({
      id: `suspicious-ip-${ip.ip}`,
      type: RECOMMENDATION_TYPES.SECURITY,
      severity: ip.targetedAccounts > 3 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
      title: "Potential Brute Force Attack",
      message: `IP ${ip.ip} attempted access to ${ip.targetedAccounts} different accounts.`,
      detail:
        ip.targetedAccounts > 3
          ? "Consider blocking this IP immediately."
          : "Monitor this IP for further suspicious activity.",
      actionLabel: "View Security",
      actionTarget: "/manage/security",
      data: ip,
    });
  }

  if (security.recentEscalations > 5) {
    insights.push({
      id: "escalation-spike",
      type: RECOMMENDATION_TYPES.SECURITY,
      severity: SEVERITY.CRITICAL,
      title: "Security Escalation Spike",
      message: `${security.recentEscalations} high-severity escalations in the last 24 hours.`,
      detail: "Potential coordinated attack. Review all recent lockout activity.",
      actionLabel: "View Security",
      actionTarget: "/manage/security",
    });
  }

  return insights;
}

// ─── User Compliance Insights ────────────────────────────────────────────
function generateUserInsights(topBorrowers) {
  const insights = [];
  if (!topBorrowers || topBorrowers.length === 0) return insights;

  const offenders = topBorrowers.filter((u) => u.late > 3);
  for (const user of offenders.slice(0, 3)) {
    insights.push({
      id: `user-compliance-${user.idNumber}`,
      type: RECOMMENDATION_TYPES.TRAINING,
      severity: SEVERITY.WARNING,
      title: "User Compliance Issue",
      message: `${user.name} has ${user.late} late returns (${user.complianceRate}% compliance).`,
      detail: `Role: ${user.role || "unknown"}. Schedule a policy review session to prevent further violations.`,
      data: { userId: user.idNumber, lateReturns: user.late },
    });
  }

  return insights;
}

// ─── Audit Insights ──────────────────────────────────────────────────────
function generateAuditInsights(audit) {
  const insights = [];
  if (!audit) return insights;

  if (audit.offHoursCount > 10) {
    insights.push({
      id: "audit-offhours",
      type: RECOMMENDATION_TYPES.SECURITY,
      severity: SEVERITY.WARNING,
      title: "Off-Hours Activity Detected",
      message: `${audit.offHoursCount} changes detected outside business hours.`,
      detail: "Verify all changes were authorized and legitimate. Off-hours changes may indicate unauthorized access.",
      data: { offHoursCount: audit.offHoursCount },
    });
  }

  const highVolumeDays = (audit.dailyChanges || []).filter(
    (d) => d.total > 100
  );
  for (const day of highVolumeDays) {
    insights.push({
      id: `bulk-changes-${day.date}`,
      type: RECOMMENDATION_TYPES.SECURITY,
      severity: SEVERITY.WARNING,
      title: "Bulk Changes Detected",
      message: `${day.total} changes on ${day.date}.`,
      detail: `Includes ${day.insert} inserts, ${day.update} updates, ${day.delete} deletions. Verify authorized activity.`,
      data: { date: day.date, total: day.total },
    });
  }

  return insights;
}

// ─── Main Export ─────────────────────────────────────────────────────────

/**
 * Generate prescriptive insights from analytics data.
 * @param {Object} analytics - Object containing all analytics data:
 *   @param {Array} analytics.inventoryUtilization
 *   @param {Array} analytics.itemDetails - Flat array of all individual items with brand, model, purchase_date, etc.
 *   @param {Object} analytics.borrowing
 *   @param {Object} analytics.security
 *   @param {Array} analytics.topBorrowers
 *   @param {Object} analytics.audit
 * @returns {Array} Sorted array of insight objects (critical first)
 */
export const generateInsights = (analytics) => {
  if (!analytics) return [];

  const allInsights = [
    ...generateBrandInsights(analytics.itemDetails, analytics.inventoryUtilization),
    ...generatePredictiveStockInsights(analytics.inventoryUtilization),
    ...generateLifecycleInsights(analytics.itemDetails, analytics.inventoryUtilization),
    ...generateInventoryInsights(analytics.inventoryUtilization),
    ...generateBorrowingInsights(analytics.borrowing),
    ...generateSecurityInsights(analytics.security),
    ...generateUserInsights(analytics.topBorrowers),
    ...generateAuditInsights(analytics.audit),
  ];

  return allInsights.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
};
