/**
 * Public Metrics Calculation & Privacy Suppression — B4
 * Uses nearest-rank percentile definition (SPEC §6).
 * Any cell with fewer than 10 issues returns "insufficient".
 * Shared between API endpoints and independent test recomputations.
 */

export interface IssueMetricRecord {
  issue_id: string;
  status: string;
  category_code?: string | null | undefined;
  department_id?: string | null | undefined;
  ward_id?: string | null | undefined;
  sla_breached?: boolean | null | undefined;
  resolution_time_hours?: number | null | undefined;
  reopen_count?: number | null | undefined;
  lat?: number | null | undefined;
  lon?: number | null | undefined;
  created_at?: Date | string | null | undefined;
  resolved_at?: Date | string | null | undefined;
}

export interface CellMetricsResult {
  total_issues: number;
  open_count: number | "insufficient";
  median_resolution_hours: number | "insufficient";
  p90_resolution_hours: number | "insufficient";
  sla_compliance_pct: number | "insufficient";
  reopen_rate_pct: number | "insufficient";
}

/**
 * Nearest-Rank Percentile Definition:
 * For ordinal ranking: P-th percentile of an ordered list of N items is at
 * 1-based rank k = ceil((P / 100) * N).
 * In 0-based array indexing: index = max(0, min(N - 1, ceil((P / 100) * N) - 1)).
 */
export function nearestRankPercentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const rank = Math.ceil((p / 100) * n);
  const index = Math.max(0, Math.min(n - 1, rank - 1));
  return sorted[index] ?? null;
}

const TERMINAL_STATUSES = new Set(["resolved", "closed", "rejected", "duplicate"]);

/**
 * Compute metrics for a cell (tenant overall, department, or ward).
 * If total_issues < 10, all numeric metrics return "insufficient" for DPDP privacy suppression.
 */
export function computeCellMetrics(issues: IssueMetricRecord[]): CellMetricsResult {
  const total = issues.length;

  if (total < 10) {
    return {
      total_issues: total,
      open_count: "insufficient",
      median_resolution_hours: "insufficient",
      p90_resolution_hours: "insufficient",
      sla_compliance_pct: "insufficient",
      reopen_rate_pct: "insufficient",
    };
  }

  const openIssues = issues.filter((i) => !TERMINAL_STATUSES.has(i.status));
  const resolvedIssues = issues.filter(
    (i) => ["resolved", "closed"].includes(i.status) && i.resolution_time_hours != null
  );
  const slaMet = resolvedIssues.filter((i) => i.sla_breached === false);
  const reopenedIssues = issues.filter(
    (i) => i.status === "reopened" || (typeof i.reopen_count === "number" && i.reopen_count > 0)
  );

  const resolutionTimes = resolvedIssues
    .map((i) => Number(i.resolution_time_hours))
    .filter((v) => !isNaN(v));

  const median = nearestRankPercentile(resolutionTimes, 50);
  const p90 = nearestRankPercentile(resolutionTimes, 90);

  const slaCompliancePct =
    resolvedIssues.length > 0 ? Math.round((slaMet.length / resolvedIssues.length) * 100) : 100;

  const totalClosedOrResolved = resolvedIssues.length;
  const reopenRatePct =
    totalClosedOrResolved + reopenedIssues.length > 0
      ? Math.round((reopenedIssues.length / (totalClosedOrResolved + reopenedIssues.length)) * 100)
      : 0;

  return {
    total_issues: total,
    open_count: openIssues.length,
    median_resolution_hours: median != null ? Number(median.toFixed(1)) : "insufficient",
    p90_resolution_hours: p90 != null ? Number(p90.toFixed(1)) : "insufficient",
    sla_compliance_pct: slaCompliancePct,
    reopen_rate_pct: reopenRatePct,
  };
}

export interface HotspotGridCell {
  grid_id: string;
  lat_grid: number;
  lon_grid: number;
  count: number;
  primary_category?: string | null | undefined;
}

/**
 * Snap coordinates to approximately 500m grid cells (~0.005 degrees).
 * Strict anonymity: no personal data, no user IDs, no photos, no landmark strings.
 */
export function computeHotspots(
  issues: {
    lat?: number | null | undefined;
    lon?: number | null | undefined;
    category_code?: string | null | undefined;
  }[]
): HotspotGridCell[] {
  const GRID_SIZE = 0.005; // ~500m at equator/mid-latitudes

  const gridMap = new Map<
    string,
    {
      lat_grid: number;
      lon_grid: number;
      count: number;
      categoryCounts: Map<string, number>;
    }
  >();

  for (const issue of issues) {
    if (issue.lat == null || issue.lon == null) continue;

    const latGrid = Math.round(issue.lat / GRID_SIZE) * GRID_SIZE;
    const lonGrid = Math.round(issue.lon / GRID_SIZE) * GRID_SIZE;
    // Normalize to 5 decimal places to avoid float precision keys
    const latRounded = Number(latGrid.toFixed(4));
    const lonRounded = Number(lonGrid.toFixed(4));
    const key = `${latRounded},${lonRounded}`;

    let cell = gridMap.get(key);
    if (!cell) {
      cell = {
        lat_grid: latRounded,
        lon_grid: lonRounded,
        count: 0,
        categoryCounts: new Map<string, number>(),
      };
      gridMap.set(key, cell);
    }

    cell.count += 1;
    if (issue.category_code) {
      const cur = cell.categoryCounts.get(issue.category_code) ?? 0;
      cell.categoryCounts.set(issue.category_code, cur + 1);
    }
  }

  const result: HotspotGridCell[] = [];
  for (const [key, cell] of gridMap.entries()) {
    let topCat: string | null = null;
    let topCount = 0;
    for (const [cat, count] of cell.categoryCounts.entries()) {
      if (count > topCount) {
        topCount = count;
        topCat = cat;
      }
    }

    result.push({
      grid_id: key,
      lat_grid: cell.lat_grid,
      lon_grid: cell.lon_grid,
      count: cell.count,
      primary_category: topCat,
    });
  }

  return result.sort((a, b) => b.count - a.count);
}
