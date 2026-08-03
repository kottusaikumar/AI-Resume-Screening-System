export type AnnotationTone = "critical" | "review" | "neutral" | "strong";
export type EvidenceConfidence = "high" | "medium";
export type ResumeSection =
  | "summary"
  | "skills"
  | "experience"
  | "projects"
  | "education"
  | "certifications"
  | "training"
  | "achievements"
  | "unknown";

export interface EvidenceClassification {
  tone: AnnotationTone;
  title: string;
  detail: string;
  recommendation: string;
  confidence: EvidenceConfidence;
}

const ACTION_VERBS =
  /^(?:[-\u2022\u2013\u2014]\s*)?(?:achieved|administered|analyzed|applied|architected|assessed|audited|automated|built|cleaned|coded|configured|consolidated|conducted|contributed|converted|coordinated|created|debugged|decreased|defined|delivered|deployed|designed|detected|developed|diagnosed|documented|eliminated|enabled|enforced|engineered|enhanced|established|evaluated|executed|expanded|extracted|facilitated|filtered|forecasted|gathered|generated|hardened|identified|implemented|improved|increased|integrated|investigated|launched|led|maintained|managed|mapped|migrated|modeled|modernized|monitored|optimized|orchestrated|owned|patched|performed|planned|presented|programmed|provisioned|queried|reconciled|recovered|reduced|refactored|remediated|reported|resolved|restricted|reviewed|scaled|secured|standardized|streamlined|supported|tested|trained|transformed|translated|troubleshot|upgraded|utilized|validated|visualized|wrote)\b/i;
const MEASURABLE_EVIDENCE =
  /(?:\b\d+(?:\.\d+)?%|\$\s?\d+(?:[,.]\d+)*(?:[kKmM])?|\b\d+(?:\.\d+)?\s*(?:x|times)\b|\b\d+(?:[,.]\d+)*(?:\+)?\s*(?:(?:[a-z]+|q&a)[ -]+){0,2}(?:ms|milliseconds?|sec(?:onds?)?|minutes?|hours?|days?|weeks?|users?|records?|rows?|models?|apis?|endpoints?|requests?|clients?|customers?|projects?|images?|pairs?|posts?|sessions?|tickets?|incidents?|defects?|tests?|builds?|releases?|servers?|services?)\b|\b(?:accuracy|precision|recall|latency|throughput|availability|uptime|coverage|adoption|conversion|error rate|response time|r\s*[²2]|rmse|mae|f1|auc)\D{0,12}\d+(?:\.\d+)?%?|\b\d+(?:\.\d+)?%?\s*(?:r\s*[²2]?|rmse|mae|f1|auc)\b)/i;
const PARTICIPATION_LANGUAGE =
  /\b(?:responsible for|worked (?:closely )?(?:on|with)|helped with|involved in|participated in|assisted with|collaborated with)\b/i;
const EMPTY_CLAIM_LANGUAGE =
  /\b(?:hard[- ]working|team player|go[- ]getter|results[- ]oriented|excellent communication)\b/i;
const CONCRETE_CONTEXT =
  /\b(?:accessibility|ai|algorithm|analysis|analytics|api|application|architecture|artificial intelligence|authentication|authorization|automation|backend|build|cache|chatbot|chunking|ci\/?cd|client|cloud|cnn|code|compliance|computer vision|configuration|container|customer|dashboard|data|database|deep learning|deployment|documentation|eda|endpoint|etl|feature|framework|frontend|full[- ]stack|git|incident|infrastructure|integration|interface|kubernetes|library|linux|machine learning|migration|mobile|model|monitoring|network|nlp|pipeline|platform|process|product|project|quality|query|rag|release|repository|requirement|reranking|rest|retrieval|scoring|script|security|server|service|software|stakeholder|support|system|tableau|test|ticket|tool|ui|user|ux|validation|visualization|vulnerability|web|workflow)\b/i;
const QUALITATIVE_OUTCOME =
  /(?:\b(?:enabled|enabling|ensured|ensuring|improved|improving|prevented|preventing|protected|protecting|resolved|resolving|resulting in|supported|supporting|streamlined|streamlining)\b|\bto\s+(?:automate|deliver|detect|enable|enhance|ensure|facilitate|improve|maintain|monitor|predict|prevent|protect|provide|reduce|resolve|scale|secure|simplify|streamline|support|validate|visualize)\b|\bfor\s+(?:automated|real[- ]time|reliable|responsive|scalable|secure)\b|\b(?:accessibility|accuracy|availability|compliance|consistency|maintainability|performance|reliability|resilience|scalability|security|usability)\b)/i;
const PROFILE_CONTEXT =
  /^(?:[-\u2022\u2013\u2014\u25aa\u25cf]\s*)?(?:aspiring|certified|entry[- ]level|experienced|motivated|recent)\b/i;
const STRUCTURED_KNOWLEDGE_ITEM =
  /^(?:[-\u2022\u2013\u2014\u25aa\u25cf]\s*)?(?:(?:[^:]{2,48}:\s*\S)|(?:api|artificial intelligence|backend|ci\/?cd|cli|cloud|data|databases?|devops|diagnostic|dhcp|dns|firewall|frameworks?|frontend|ipv[46]?|languages?|libraries?|linux|machine learning|monitoring|network(?:ing)?|nlp|operating systems?|osi|platforms?|protocols?|routing|security|skills?|spanning tree|subnetting|tcp\/?ip|testing|tools?|udp|version control|vlan|vpn|wireless|windows)\b)/i;
const SYSTEM_DESCRIPTION =
  /^(?:[-\u2022\u2013\u2014\u25aa\u25cf]\s*)?(?:an?|the)\s+(?:(?:[\w./+&-]+\s+){0,5})?(?:application|dashboard|interface|pipeline|platform|portal|service|system|tool|workflow)\b/i;
const FUNCTIONAL_DESCRIPTION =
  /^(?:[-\u2022\u2013\u2014\u25aa\u25cf]\s*)?(?:allows|enables|features|generates|offers|processes|provides|supports)\b/i;
const CONTACT_LINE =
  /(?:@[\w.-]+|\b\S+@\S+\.\S+\b|linkedin\.com|github\.com|\blocation\s*:|\+?\d[\d\s()-]{7,})/i;
const CREDENTIAL_LINE =
  /(?:\b(?:certificate|certification|bootcamp|coursework|training)\b.*\b(?:19|20)\d{2}\b|\bissued\s*:\s*(?:[a-z]+\s+)?(?:19|20)\d{2}\b)/i;
const ROLE_OR_AWARD_HEADING =
  /^(?:[-\u2022\u2013\u2014\u25aa\u25cf]\s*)?[^|]{2,70}\b(?:head|lead|manager|engineer|developer|analyst|intern|volunteer)\b\s*\|/i;
const ACADEMIC_METADATA =
  /^(?:[-\u2022\u2013\u2014\u25aa\u25cf]\s*)?(?:(?:b\.?\s*(?:ca|e|sc|tech)|m\.?\s*(?:ca|e|sc|tech)|mba)\b|[^,]{2,70}\b(?:college|university|institute|school)\b(?:\s*[-,|]|\s*$))/i;
const DATED_HEADING =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2}\s*(?:[-–—]|to)\s*(?:present|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2})\b/i;

const SECTION_PATTERNS: Array<[ResumeSection, RegExp]> = [
  ["summary", /^(?:professional\s+)?(?:summary|profile|objective|about me|career summary)$/i],
  ["skills", /^(?:technical\s+)?(?:skills|skills summary|core competencies|technologies)$/i],
  ["experience", /^(?:professional\s+|work\s+)?(?:experience|employment|work history)$/i],
  ["projects", /^(?:academic\s+|personal\s+|selected\s+)?projects?(?:\s+\d+)?$/i],
  ["education", /^(?:academic\s+)?(?:education|qualifications?)$/i],
  ["certifications", /^(?:licenses?\s*(?:and|&)\s*)?certifications?$/i],
  [
    "training",
    /^(?:hands[- ]on\s+)?(?:training|practical knowledge|training\s*(?:and|&)\s*practical knowledge)$/i,
  ],
  [
    "achievements",
    /^(?:key\s+)?(?:achievements?|accomplishments?|awards?|leadership activities)$/i,
  ],
];

function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function stripHeadingDecoration(text: string) {
  return normalize(text)
    .replace(/^[-\u2022\u2013\u2014\u25aa\u25cf]+\s*/, "")
    .replace(/[:|]+$/, "")
    .trim();
}

export function detectResumeSection(text: string): ResumeSection | null {
  const candidate = stripHeadingDecoration(text);
  if (/^project\s*\d+\s*:/i.test(candidate)) return "projects";
  if (
    /\b(?:administrator|analyst|consultant|developer|engineer|intern|specialist|technician)\b\s*(?:[-–—|]|$)/i.test(
      candidate,
    )
  ) {
    return "experience";
  }
  if (candidate.length > 48) return null;
  return SECTION_PATTERNS.find(([, pattern]) => pattern.test(candidate))?.[0] ?? null;
}

function neutralKnowledge(confidence: EvidenceConfidence): EvidenceClassification {
  return {
    tone: "neutral",
    title: "Technical knowledge evidence",
    detail:
      "This line is a structured inventory of technical knowledge, tools, protocols, or practical training rather than an achievement claim.",
    recommendation:
      "No action verb or metric is required here. Keep the terminology specific, relevant, and grouped for quick scanning.",
    confidence,
  };
}

export function classifyResumeEvidenceLine(
  text: string,
  section: ResumeSection = "unknown",
): EvidenceClassification | null {
  const normalized = normalize(text);
  if (
    normalized.length < 24 ||
    detectResumeSection(normalized) ||
    CONTACT_LINE.test(normalized) ||
    CREDENTIAL_LINE.test(normalized) ||
    ROLE_OR_AWARD_HEADING.test(normalized) ||
    ACADEMIC_METADATA.test(normalized) ||
    (DATED_HEADING.test(normalized) && !ACTION_VERBS.test(normalized))
  ) {
    return null;
  }

  if (section === "education" || section === "certifications") return null;

  const looksLikeBullet =
    /^[-\u2022\u2013\u2014\u25aa\u25cf]/.test(normalized) ||
    ACTION_VERBS.test(normalized) ||
    PARTICIPATION_LANGUAGE.test(normalized);
  const isStructuredKnowledge = STRUCTURED_KNOWLEDGE_ITEM.test(normalized);
  const isProfileContext = PROFILE_CONTEXT.test(normalized);

  if (section === "skills" || section === "training") {
    if (isStructuredKnowledge || looksLikeBullet) return neutralKnowledge("high");
    return null;
  }

  if (section === "summary") {
    if (EMPTY_CLAIM_LANGUAGE.test(normalized)) {
      return {
        tone: "critical",
        title: "Unsupported self-description",
        detail: "This wording makes a broad personal claim without showing observable work.",
        recommendation:
          "Replace the claim with a concrete example of an action, its context, and the contribution you made.",
        confidence: "high",
      };
    }
    if (normalized.length > 220) {
      return {
        tone: "critical",
        title: "Dense profile statement",
        detail: "This profile statement carries too many ideas for a quick recruiter review.",
        recommendation: "Condense it into two or three focused sentences.",
        confidence: "high",
      };
    }
    return {
      tone: "neutral",
      title: "Profile context",
      detail:
        "This is descriptive profile context, not an achievement bullet, so an action verb or metric is not required.",
      recommendation:
        "Keep it concise and ensure the stated direction is supported by skills, projects, training, or experience elsewhere in the resume.",
      confidence: "high",
    };
  }

  if (
    (SYSTEM_DESCRIPTION.test(normalized) && CONCRETE_CONTEXT.test(normalized)) ||
    FUNCTIONAL_DESCRIPTION.test(normalized)
  ) {
    return {
      tone: "neutral",
      title: "System context",
      detail:
        "This line describes the purpose or behavior of a system, product, or service rather than claiming an individual achievement.",
      recommendation:
        "Keep it as context. Use nearby contribution bullets to show what the candidate personally designed, built, improved, or supported.",
      confidence: "high",
    };
  }

  if (!looksLikeBullet && !isProfileContext && !isStructuredKnowledge) return null;

  if (EMPTY_CLAIM_LANGUAGE.test(normalized)) {
    return {
      tone: "critical",
      title: "Unsupported self-description",
      detail: "This wording makes a broad personal claim without showing observable work.",
      recommendation:
        "Replace the claim with a concrete example of an action, its context, and the contribution you made.",
      confidence: "high",
    };
  }

  if (normalized.length > 220) {
    return {
      tone: "critical",
      title: "Dense achievement line",
      detail: "This line carries too many ideas for a quick recruiter or ATS review.",
      recommendation:
        "Split it into two concise bullets, keeping one action and one outcome in each.",
      confidence: "high",
    };
  }

  if (PARTICIPATION_LANGUAGE.test(normalized)) {
    return {
      tone: "review",
      title: "Ownership could be clearer",
      detail:
        "The line describes collaboration or participation, but the candidate's individual contribution is not immediately clear.",
      recommendation:
        "Name the part personally analyzed, designed, configured, tested, supported, or delivered while preserving the team context.",
      confidence: section === "unknown" ? "medium" : "high",
    };
  }

  if (isProfileContext) {
    return {
      tone: "neutral",
      title: "Profile context",
      detail:
        "This is a descriptive profile statement, not an achievement bullet, so an action verb or metric is not required.",
      recommendation:
        "Keep it concise and ensure the stated direction is supported by skills, projects, training, or experience elsewhere in the resume.",
      confidence: "medium",
    };
  }

  if (isStructuredKnowledge && !ACTION_VERBS.test(normalized)) {
    return neutralKnowledge(section === "unknown" ? "medium" : "high");
  }

  if (!ACTION_VERBS.test(normalized)) {
    if (section === "unknown") return null;
    return {
      tone: "review",
      title: "Action is unclear",
      detail: "The line does not begin with a clear, outcome-oriented action verb.",
      recommendation:
        "Lead with a specific verb such as Built, Designed, Automated, Improved, or Reduced.",
      confidence: "high",
    };
  }

  if (MEASURABLE_EVIDENCE.test(normalized)) {
    return {
      tone: "strong",
      title: "Strong evidence",
      detail: "This achievement combines a clear action with measurable evidence.",
      recommendation:
        "Keep this evidence and be prepared to explain the measurement in an interview.",
      confidence: "high",
    };
  }

  if (CONCRETE_CONTEXT.test(normalized) && QUALITATIVE_OUTCOME.test(normalized)) {
    return {
      tone: "strong",
      title: "Strong qualitative evidence",
      detail:
        "This line connects a clear action and technical context to a meaningful non-numeric outcome.",
      recommendation:
        "Keep it as written. Add a metric only when it is truthful, attributable, and useful.",
      confidence: "high",
    };
  }

  if (CONCRETE_CONTEXT.test(normalized)) {
    return {
      tone: "neutral",
      title: "Clear technical contribution",
      detail:
        "This is valid descriptive evidence: it states a concrete action and relevant technical context.",
      recommendation:
        "Keep it as written. Add an outcome only if it adds truthful and useful context; a number is not required.",
      confidence: "high",
    };
  }

  const descriptiveWordCount = normalized
    .replace(/^[-\u2022\u2013\u2014\u25aa\u25cf]\s*/, "")
    .split(/\s+/)
    .filter(Boolean).length;
  if (descriptiveWordCount >= 5) {
    return {
      tone: "neutral",
      title: "Clear descriptive contribution",
      detail:
        "This is a sufficiently specific action-led contribution. It remains valid without a number or recognized technology keyword.",
      recommendation:
        "Keep it as written. Add purpose or impact only when that information is truthful and makes the contribution more useful.",
      confidence: "medium",
    };
  }

  return {
    tone: "review",
    title: "Context could be clearer",
    detail: "The action is readable, but the object, scope, or purpose is not specific enough.",
    recommendation:
      "Add the system, process, user need, or technical context that makes this contribution understandable.",
    confidence: "high",
  };
}
