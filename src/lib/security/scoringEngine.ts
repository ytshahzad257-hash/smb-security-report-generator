export const SCORE_CATEGORIES = [
  "HTTP Security Headers",
  "SSL/TLS",
  "Email Security",
  "Technology Detection",
] as const;

export const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

export type FindingSeverity = (typeof severityOrder)[number];
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];
export type Grade = "A" | "B" | "C" | "D" | "F";

export type ScoreFinding = {
  title: string;
  severity: FindingSeverity;
  category: string;
  evidence?: string | null;
  fix?: string | null;
};

export type SeverityCounts = Record<FindingSeverity, number>;

export type CategoryScore = {
  category: ScoreCategory;
  score: number;
  grade: Grade;
  findingCount: number;
  severityCounts: SeverityCounts;
  status: string;
  explanation: string;
};

export type PriorityFix = {
  title: string;
  severity: FindingSeverity;
  category: string;
  recommendation: string;
};

export type ScoreExplanation = {
  title: "Automated posture score";
  score: number;
  grade: Grade;
  penaltySummary: string;
  totalPenalty: number;
  highestSeverityFound: FindingSeverity | "NONE";
  findingsCounted: number;
  notes: string[];
};

const severityPenalties: Record<FindingSeverity, number> = {
  CRITICAL: 25,
  HIGH: 15,
  MEDIUM: 8,
  LOW: 3,
  INFO: 0,
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

function isScoredFinding(finding: ScoreFinding) {
  if (finding.severity === "INFO") {
    return false;
  }

  const haystack = `${finding.title} ${finding.evidence ?? ""}`.toLowerCase();

  if (
    haystack.includes("not_checked") ||
    haystack.includes("not checked") ||
    haystack.includes("inconclusive") ||
    haystack.includes("http 404") ||
    haystack.includes("responded with http 403")
  ) {
    return false;
  }

  return true;
}

function getScoredFindings(findings: ScoreFinding[]) {
  return findings.filter(isScoredFinding);
}

function calculatePenalty(findings: ScoreFinding[]) {
  return getScoredFindings(findings).reduce(
    (total, finding) => total + severityPenalties[finding.severity],
    0,
  );
}

function createSeverityCounts(findings: ScoreFinding[]): SeverityCounts {
  return severityOrder.reduce<SeverityCounts>(
    (counts, severity) => {
      counts[severity] = findings.filter((finding) => finding.severity === severity).length;
      return counts;
    },
    {
      CRITICAL: 0,
      HIGH: 0,
      INFO: 0,
      LOW: 0,
      MEDIUM: 0,
    },
  );
}

function formatSeverity(severity: FindingSeverity) {
  return severity[0] + severity.slice(1).toLowerCase();
}

function getHighestSeverity(findings: ScoreFinding[]) {
  return severityOrder.find((severity) =>
    findings.some((finding) => finding.severity === severity),
  );
}

export function calculateRiskScore(findings: ScoreFinding[]) {
  return clampScore(100 - calculatePenalty(findings));
}

export function calculateGrade(score: number): Grade {
  if (score >= 90) {
    return "A";
  }

  if (score >= 75) {
    return "B";
  }

  if (score >= 60) {
    return "C";
  }

  if (score >= 40) {
    return "D";
  }

  return "F";
}

export function calculateSeverityCounts(findings: ScoreFinding[]) {
  return createSeverityCounts(findings);
}

export function calculateCategoryScores(findings: ScoreFinding[]) {
  return SCORE_CATEGORIES.map((category): CategoryScore => {
    const categoryFindings = findings.filter((finding) => finding.category === category);
    const score = calculateRiskScore(categoryFindings);
    const grade = calculateGrade(score);

    return {
      category,
      explanation:
        categoryFindings.length === 0
          ? "No issue detected by completed automated checks"
          : "Based on findings from completed scanner modules",
      findingCount: categoryFindings.length,
      grade,
      score,
      severityCounts: createSeverityCounts(categoryFindings),
      status:
        categoryFindings.length === 0
          ? "No issue detected by completed automated checks"
          : "Findings detected by completed automated checks",
    };
  });
}

export function buildPriorityFixList(findings: ScoreFinding[]) {
  return [...findings]
    .filter((finding) => finding.severity !== "INFO" && isScoredFinding(finding))
    .sort(
      (first, second) =>
        severityOrder.indexOf(first.severity) - severityOrder.indexOf(second.severity) ||
        first.title.localeCompare(second.title),
    )
    .map((finding): PriorityFix => ({
      category: finding.category,
      recommendation: finding.fix ?? "Review this finding and define a remediation.",
      severity: finding.severity,
      title: finding.title,
    }));
}

export function buildScoreExplanation(
  findings: ScoreFinding[],
  score: number,
  grade: Grade,
): ScoreExplanation {
  const countedFindings = getScoredFindings(findings);
  const severityCounts = createSeverityCounts(countedFindings);
  const penaltyParts = severityOrder
    .filter((severity) => severityCounts[severity] > 0)
    .map(
      (severity) =>
        `${severityCounts[severity]} ${formatSeverity(severity)} x ${severityPenalties[severity]}`,
    );

  return {
    findingsCounted: countedFindings.length,
    grade,
    highestSeverityFound: getHighestSeverity(countedFindings) ?? "NONE",
    notes: [
      "Automated posture score",
      "Based on findings from completed scanner modules",
      "This is not a penetration test score",
      "This is not OWASP compliance certification",
      "Info observations are shown in findings but do not reduce the score.",
    ],
    penaltySummary: penaltyParts.length > 0 ? penaltyParts.join(", ") : "No severity penalties applied",
    score,
    title: "Automated posture score",
    totalPenalty: calculatePenalty(findings),
  };
}
