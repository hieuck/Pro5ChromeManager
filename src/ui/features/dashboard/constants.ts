export const DASHBOARD_WINDOWS = {
  recentIssuesMinutes: 60,
  urgentIssuesMinutes: 15,
  freshnessHotMinutes: 5,
  freshnessWarmMinutes: 30,
} as const;

export const DASHBOARD_THRESHOLDS = {
  hotIssueCount: 3,
  elevatedIssueCount: 5,
  issueRatioHighPercent: 60,
  issueRatioMediumPercent: 30,
  sourceModeFocusedPercent: 80,
  sourceModeMixedPercent: 50,
  incidentSourceShareHotPercent: 60,
  incidentSourceShareWarmPercent: 35,
  incidentConcentrationWarmPercent: 60,
  activitySourceShareFocusedPercent: 50,
} as const;

export const DASHBOARD_LIMITS = {
  topSources: 3,
  workspaceList: 5,
  summaryPreviewLength: 44,
  expandedSummaryLength: 120,
} as const;
