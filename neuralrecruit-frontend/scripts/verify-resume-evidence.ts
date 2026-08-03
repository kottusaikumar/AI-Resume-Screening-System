import assert from "node:assert/strict";
import {
  classifyResumeEvidenceLine,
  detectResumeSection,
  type AnnotationTone,
  type ResumeSection,
} from "../src/lib/resume-evidence.ts";

const sectionCases: Array<[string, ResumeSection]> = [
  ["TECHNICAL SKILLS", "skills"],
  ["Hands-on Training & Practical Knowledge", "training"],
  ["Professional Experience", "experience"],
  ["Personal Projects", "projects"],
  ["Project 2: Network Monitoring Dashboard", "projects"],
  ["AI/ML Intern — Example Labs", "experience"],
  ["Education", "education"],
  ["Certifications", "certifications"],
];

for (const [heading, expected] of sectionCases) {
  assert.equal(detectResumeSection(heading), expected, `section: ${heading}`);
}

const evidenceCases: Array<{
  label: string;
  text: string;
  section: ResumeSection;
  tone: AnnotationTone | null;
}> = [
  {
    label: "software metric",
    text: "Built REST APIs serving 10,000 requests per day",
    section: "experience",
    tone: "strong",
  },
  {
    label: "data engineering contribution",
    text: "Developed a feature pipeline for model training and validation",
    section: "projects",
    tone: "neutral",
  },
  {
    label: "colon inside an experience action is not a skill inventory",
    text: "Implemented dual detection strategy: MTCNN with a low-confidence fallback",
    section: "experience",
    tone: "neutral",
  },
  {
    label: "cloud qualitative outcome",
    text: "Automated the CI/CD deployment workflow for reliable releases",
    section: "experience",
    tone: "strong",
  },
  {
    label: "cybersecurity contribution",
    text: "Configured access controls and firewall policies",
    section: "experience",
    tone: "neutral",
  },
  {
    label: "quality engineering contribution",
    text: "Tested checkout workflows across browsers and mobile devices",
    section: "experience",
    tone: "neutral",
  },
  {
    label: "IT support metric",
    text: "Resolved 120 support tickets within agreed SLAs",
    section: "experience",
    tone: "strong",
  },
  {
    label: "network skill inventory",
    text: "• Protocols: OSPF, EIGRP, BGP, RIP",
    section: "skills",
    tone: "neutral",
  },
  {
    label: "network training inventory",
    text: "• VLAN configuration, trunking, and port security",
    section: "training",
    tone: "neutral",
  },
  {
    label: "education metadata",
    text: "B.Tech in Computer Science and Engineering",
    section: "education",
    tone: null,
  },
  {
    label: "certification metadata",
    text: "AWS Cloud Practitioner, Issued: April 2025",
    section: "certifications",
    tone: null,
  },
  {
    label: "unclear experience ownership",
    text: "• Users can select a hospital and book appointments",
    section: "experience",
    tone: "review",
  },
  {
    label: "unknown section stays conservative",
    text: "• Users can select a hospital and book appointments",
    section: "unknown",
    tone: null,
  },
  {
    label: "wrapped summary line is profile context",
    text: "tools such as Cisco Packet Tracer and GNS3. Possess solid knowledge of network protocols",
    section: "summary",
    tone: "neutral",
  },
  {
    label: "participation wording",
    text: "• Participated in application testing and release validation",
    section: "experience",
    tone: "review",
  },
  {
    label: "vague collaboration keeps a focused ownership review",
    text: "Worked closely with clients to understand business requirements and translate them into technical solutions",
    section: "experience",
    tone: "review",
  },
  {
    label: "system description is valid context",
    text: "A data quality web application that can onboard multiple data sources and execute core data quality rules",
    section: "experience",
    tone: "neutral",
  },
  {
    label: "tool inventory remains valid inside experience",
    text: "Tools: ReactJS, GraphQL, .NET Core, Entity Framework Core, MSSQL, Azure, ADLS",
    section: "experience",
    tone: "neutral",
  },
  {
    label: "dated assignment heading is not evidence",
    text: "Data Quality Service (DQS) January 2024 — Present",
    section: "experience",
    tone: null,
  },
  {
    label: "product behavior is valid context",
    text: "Generates technical interview questions from job descriptions and evaluates candidate responses",
    section: "projects",
    tone: "neutral",
  },
  {
    label: "feature summary is valid context",
    text: "Features real-time updates, detailed bug logs, and a secure database for seamless tracking",
    section: "projects",
    tone: "neutral",
  },
  {
    label: "quantified enhanced contribution is strong",
    text: "Enhanced ReactJS UI performance by optimizing component loading, reducing page load times by 30%",
    section: "achievements",
    tone: "strong",
  },
  {
    label: "dates and versions are not impact metrics",
    text: "Developed the service using Python 3 in 2024",
    section: "experience",
    tone: "neutral",
  },
];

for (const testCase of evidenceCases) {
  const actual = classifyResumeEvidenceLine(testCase.text, testCase.section)?.tone ?? null;
  assert.equal(actual, testCase.tone, testCase.label);
}

console.log(
  `Resume evidence regression suite passed: ${sectionCases.length} headings and ${evidenceCases.length} role-spanning evidence cases.`,
);
