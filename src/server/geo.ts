import type { ComplaintCategory, Severity, Ward, WardHealthScore } from '../shared/types.ts';

export interface DemoWardSeed {
  id: string;
  code: string;
  name: string;
  zone: string;
  populationDemo: number;
  areaSqkm: number;
  centerLat: number;
  centerLng: number;
  // GeoJSON Polygon coordinates: [[[lng, lat], ...]]
  boundaryGeojson: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

/**
 * Clearly labeled DEMO municipal ward polygons covering Greater Hyderabad Demo Zone.
 * Used for genuine deterministic point-in-polygon geospatial boundary mapping.
 */
export const DEMO_WARDS: DemoWardSeed[] = [
  {
    id: 'ward-14',
    code: 'W-14',
    name: 'Banjara Hills',
    zone: 'Central Demo Zone',
    populationDemo: 64200,
    areaSqkm: 6.4,
    centerLat: 17.4156,
    centerLng: 78.4347,
    boundaryGeojson: {
      type: 'Polygon',
      coordinates: [[
        [78.4160, 17.4020],
        [78.4520, 17.4020],
        [78.4520, 17.4300],
        [78.4160, 17.4300],
        [78.4160, 17.4020],
      ]],
    },
  },
  {
    id: 'ward-18',
    code: 'W-18',
    name: 'Jubilee Hills',
    zone: 'West Demo Zone',
    populationDemo: 58900,
    areaSqkm: 7.2,
    centerLat: 17.4310,
    centerLng: 78.4010,
    boundaryGeojson: {
      type: 'Polygon',
      coordinates: [[
        [78.3820, 17.4120],
        [78.4160, 17.4120],
        [78.4160, 17.4480],
        [78.3820, 17.4480],
        [78.3820, 17.4120],
      ]],
    },
  },
  {
    id: 'ward-22',
    code: 'W-22',
    name: 'Madhapur',
    zone: 'IT Corridor Demo Zone',
    populationDemo: 82400,
    areaSqkm: 8.1,
    centerLat: 17.4483,
    centerLng: 78.3740,
    boundaryGeojson: {
      type: 'Polygon',
      coordinates: [[
        [78.3580, 17.4300],
        [78.3820, 17.4300],
        [78.3820, 17.4650],
        [78.3580, 17.4650],
        [78.3580, 17.4300],
      ]],
    },
  },
  {
    id: 'ward-27',
    code: 'W-27',
    name: 'Gachibowli',
    zone: 'IT Corridor Demo Zone',
    populationDemo: 74500,
    areaSqkm: 9.5,
    centerLat: 17.4399,
    centerLng: 78.3420,
    boundaryGeojson: {
      type: 'Polygon',
      coordinates: [[
        [78.3200, 17.4180],
        [78.3580, 17.4180],
        [78.3580, 17.4600],
        [78.3200, 17.4600],
        [78.3200, 17.4180],
      ]],
    },
  },
  {
    id: 'ward-09',
    code: 'W-09',
    name: 'Begumpet',
    zone: 'North-Central Demo Zone',
    populationDemo: 61800,
    areaSqkm: 5.9,
    centerLat: 17.4435,
    centerLng: 78.4640,
    boundaryGeojson: {
      type: 'Polygon',
      coordinates: [[
        [78.4520, 17.4280],
        [78.4820, 17.4280],
        [78.4820, 17.4580],
        [78.4520, 17.4580],
        [78.4520, 17.4280],
      ]],
    },
  },
  {
    id: 'ward-04',
    code: 'W-04',
    name: 'Secunderabad',
    zone: 'North Demo Zone',
    populationDemo: 79300,
    areaSqkm: 7.8,
    centerLat: 17.4420,
    centerLng: 78.4980,
    boundaryGeojson: {
      type: 'Polygon',
      coordinates: [[
        [78.4820, 17.4260],
        [78.5180, 17.4260],
        [78.5180, 17.4600],
        [78.4820, 17.4600],
        [78.4820, 17.4260],
      ]],
    },
  },
];

export const DEMO_LANDMARKS: Array<{
  label: string;
  wardId: string;
  lat: number;
  lng: number;
}> = [
  { label: 'Road No. 12, Banjara Hills (Near Virinchi Junction)', wardId: 'ward-14', lat: 17.4126, lng: 78.4368 },
  { label: 'Road No. 1, Banjara Hills (Care Hospital Stretch)', wardId: 'ward-14', lat: 17.4178, lng: 78.4472 },
  { label: 'Road No. 36, Jubilee Hills (Metro Pillar 1620)', wardId: 'ward-18', lat: 17.4318, lng: 78.4045 },
  { label: 'Film Nagar Crossroad, Jubilee Hills', wardId: 'ward-18', lat: 17.4184, lng: 78.4085 },
  { label: 'Ayyappa Society Main Road, Madhapur', wardId: 'ward-22', lat: 17.4512, lng: 78.3782 },
  { label: 'Hitech City Main Road, Madhapur', wardId: 'ward-22', lat: 17.4455, lng: 78.3720 },
  { label: 'DLF Cyber City Gate 2, Gachibowli', wardId: 'ward-27', lat: 17.4476, lng: 78.3522 },
  { label: 'Indira Nagar Lane 4, Gachibowli', wardId: 'ward-27', lat: 17.4418, lng: 78.3484 },
  { label: 'Prakash Nagar Flyover Service Road, Begumpet', wardId: 'ward-09', lat: 17.4438, lng: 78.4664 },
  { label: 'Greenlands Junction, Begumpet', wardId: 'ward-09', lat: 17.4362, lng: 78.4582 },
  { label: 'Paradise Circle Arterial Road, Secunderabad', wardId: 'ward-04', lat: 17.4412, lng: 78.4898 },
  { label: 'Clock Tower Market Road, Secunderabad', wardId: 'ward-04', lat: 17.4426, lng: 78.5018 },
];

/**
 * Ray-casting point-in-polygon algorithm for GeoJSON Polygon coordinates.
 * Point: (lat, lng). Ring points are [lng, lat].
 */
export function isPointInPolygon(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Haversine distance in meters between two WGS84 lat/lng points.
 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Deterministic geospatial ward resolver using polygon containment first,
 * falling back to nearest demo ward centroid (explicitly flagged).
 */
export function identifyWardFromBoundaries(
  lat: number,
  lng: number,
  wards: Ward[]
): { ward: Ward | null; matchType: 'exact_polygon' | 'nearest_demo_ward'; distanceMeters: number } {
  for (const ward of wards) {
    const ring = ward.boundaryGeojson?.coordinates?.[0];
    if (ring && isPointInPolygon(lat, lng, ring)) {
      return {
        ward,
        matchType: 'exact_polygon',
        distanceMeters: haversineMeters(lat, lng, ward.centerLat, ward.centerLng),
      };
    }
  }

  let nearest: Ward | null = null;
  let minDist = Infinity;
  for (const ward of wards) {
    const dist = haversineMeters(lat, lng, ward.centerLat, ward.centerLng);
    if (dist < minDist) {
      minDist = dist;
      nearest = ward;
    }
  }

  return {
    ward: nearest,
    matchType: 'nearest_demo_ward',
    distanceMeters: Number.isFinite(minDist) ? minDist : 0,
  };
}

/**
 * Token-based Jaccard similarity for complaint titles + descriptions.
 */
export function computeTextSimilarity(a: string, b: string): number {
  const stopWords = new Set([
    'the', 'is', 'at', 'on', 'in', 'near', 'and', 'for', 'of', 'to', 'a', 'an', 'with', 'from', 'this', 'that', 'very', 'please', 'road',
  ]);
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w))
    );

  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const SEVERITY_RANK: Record<Severity, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

/**
 * Transparent deterministic severity guardrail rules combined with Gemini AI assessment.
 * AI never has unilateral unchecked power on public safety hazards.
 */
export function evaluateDeterministicSeverity(
  category: ComplaintCategory,
  text: string,
  aiSeverity: Severity
): {
  deterministicSeverity: Severity;
  finalSeverity: Severity;
  ruleApplied: string | null;
} {
  const lower = text.toLowerCase();
  let deterministicSeverity: Severity = 'Low';
  let ruleApplied: string | null = null;

  if (category === 'Open manholes') {
    deterministicSeverity = 'Critical';
    ruleApplied = 'Safety Rule R-01: Open manholes automatically trigger a Critical minimum severity floor due to immediate fall & fatality hazard.';
  } else if (
    /\b(accident|injured|hospital|school|live wire|electrocution|gas leak|collapsed|sinkhole|submerged|waist deep)\b/i.test(lower)
  ) {
    deterministicSeverity = 'Critical';
    ruleApplied = 'Safety Rule R-02: Report mentions urgent public safety risk (accident, vulnerable zone, structural collapse, or electrical hazard).';
  } else if (category === 'Flooding' || (category === 'Drainage' && /\b(sewage|overflow|entering|stagnant|blocked)\b/i.test(lower))) {
    deterministicSeverity = 'High';
    ruleApplied = 'Public Health Rule R-03: Active flooding or sewage/drainage overflow requires minimum High severity prioritization.';
  } else if (
    (category === 'Potholes' || category === 'Road damage') &&
    /\b(deep|waterlogged|arterial|junction|main road|two-wheeler|bike|skid|dark|night)\b/i.test(lower)
  ) {
    deterministicSeverity = 'High';
    ruleApplied = 'Traffic Safety Rule R-04: Deep, waterlogged, or arterial road hazards require minimum High severity dispatch.';
  } else if (category === 'Water leakage' && /\b(burst|main pipe|gushing|wasting|continuous)\b/i.test(lower)) {
    deterministicSeverity = 'High';
    ruleApplied = 'Utility Rule R-05: Continuous pressurized pipeline leaks trigger minimum High priority.';
  } else if (category === 'Streetlight failure' || category === 'Garbage') {
    deterministicSeverity = 'Medium';
    ruleApplied = 'Civic Baseline Rule R-06: Streetlight outages and uncollected municipal waste maintain a Medium minimum severity baseline.';
  } else {
    deterministicSeverity = 'Low';
  }

  const finalSeverity =
    SEVERITY_RANK[deterministicSeverity] >= SEVERITY_RANK[aiSeverity]
      ? deterministicSeverity
      : aiSeverity;

  return {
    deterministicSeverity,
    finalSeverity,
    ruleApplied:
      SEVERITY_RANK[deterministicSeverity] > SEVERITY_RANK[aiSeverity]
        ? ruleApplied
        : ruleApplied
        ? `${ruleApplied} (Consistent with AI assessment)`
        : null,
  };
}

/**
 * Explainable Ward Health & Support Index computed strictly from real database records.
 * Framed constructively to identify wards needing municipal resource allocation.
 */
export function computeWardHealthScore(params: {
  ward: Ward;
  totalComplaints: number;
  openComplaints: number;
  criticalCount: number;
  overdueCount: number;
  recurringClusterCount: number;
  resolvedCount: number;
  avgResolutionHours: number;
  positiveFeedbackCount: number;
  totalFeedbackCount: number;
}): WardHealthScore {
  const {
    ward,
    totalComplaints,
    openComplaints,
    criticalCount,
    overdueCount,
    recurringClusterCount,
    resolvedCount,
    avgResolutionHours,
    positiveFeedbackCount,
    totalFeedbackCount,
  } = params;

  const resolutionRatePct =
    totalComplaints > 0 ? Math.round((resolvedCount / totalComplaints) * 100) : 100;
  const verifiedSatisfactionPct =
    totalFeedbackCount > 0 ? Math.round((positiveFeedbackCount / totalFeedbackCount) * 100) : null;

  let score = 100;
  const factors: WardHealthScore['factors'] = [];

  const overduePenalty = Math.min(30, overdueCount * 10);
  if (overduePenalty > 0) {
    score -= overduePenalty;
    factors.push({
      label: 'Overdue SLA Load',
      impact: -overduePenalty,
      detail: `${overdueCount} open complaint(s) past configured SLA target`,
    });
  }

  const criticalPenalty = Math.min(20, criticalCount * 7);
  if (criticalPenalty > 0) {
    score -= criticalPenalty;
    factors.push({
      label: 'Active Critical Hazards',
      impact: -criticalPenalty,
      detail: `${criticalCount} critical-severity issue(s) requiring rapid response`,
    });
  }

  const recurringPenalty = Math.min(18, recurringClusterCount * 6);
  if (recurringPenalty > 0) {
    score -= recurringPenalty;
    factors.push({
      label: 'Recurring Infrastructure Clusters',
      impact: -recurringPenalty,
      detail: `${recurringClusterCount} cluster(s) showing repeated civic wear`,
    });
  }

  const backlogPenalty = Math.min(16, Math.max(0, Math.round((100 - resolutionRatePct) * 0.18)));
  if (backlogPenalty > 0) {
    score -= backlogPenalty;
    factors.push({
      label: 'Open Backlog Ratio',
      impact: -backlogPenalty,
      detail: `${resolutionRatePct}% resolved (${openComplaints} open of ${totalComplaints} total)`,
    });
  }

  if (verifiedSatisfactionPct !== null) {
    if (verifiedSatisfactionPct >= 75) {
      const bonus = 5;
      score = Math.min(100, score + bonus);
      factors.push({
        label: 'Citizen Verification Confidence',
        impact: bonus,
        detail: `${verifiedSatisfactionPct}% of verified repairs confirmed satisfactory`,
      });
    } else {
      const penalty = 8;
      score -= penalty;
      factors.push({
        label: 'Reopen / Partial Resolution Rate',
        impact: -penalty,
        detail: `${verifiedSatisfactionPct}% citizen satisfaction on closed work`,
      });
    }
  }

  score = Math.max(15, Math.min(100, Math.round(score)));

  const supportTier: WardHealthScore['supportTier'] =
    score >= 75
      ? 'Strong Capacity'
      : score >= 52
      ? 'Moderate Support Needed'
      : 'Priority Support Area';

  return {
    wardId: ward.id,
    wardCode: ward.code,
    wardName: ward.name,
    zone: ward.zone,
    score,
    supportTier,
    metrics: {
      totalComplaints,
      openComplaints,
      criticalCount,
      overdueCount,
      recurringClusterCount,
      resolutionRatePct,
      avgResolutionHours: Math.round(avgResolutionHours * 10) / 10,
      verifiedSatisfactionPct,
    },
    factors,
  };
}
