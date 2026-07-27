# NeuralRecruit — UI Text & Microcopy

Based on the existing `index.tsx` screen (Scan Center: Upload → Analyzing → Results). Copy follows the app's confident, "precision-engineering" voice — short, declarative, slightly technical — while staying scannable and accessible.

---

## 1. Global Navigation

### Sidebar
| Element | Text |
|---|---|
| Brand name | NeuralRecruit |
| Brand tagline (mono label) | PRECISION · HR · v2.1 |
| Nav item | Scanner |
| Nav item | History |
| Nav item | Skills DB |
| Nav item | Analytics |
| Nav item | Settings |
| Primary button | New Scan |
| User card name | Alex Thorne |
| User card role | Senior Recruiter |
| User menu tooltip (logout icon) | Log out |

### Top Bar
| Element | Text |
|---|---|
| Status label | SYSTEM STATUS |
| Status value (upload) | SCAN_CENTER |
| Status value (analyzing) | ANALYSIS_ACTIVE |
| Status value (results) | REPORT_READY |
| Nav link | Dashboard |
| Nav link (active) | Scanner |
| Nav link | Reports |
| Icon button tooltip | Notifications |
| Icon button tooltip | Switch to light mode / Switch to dark mode |
| Button | Export |
| Notification empty state | No new notifications |

---

## 2. Upload Screen ("Scan Center")

### Header
- **Eyebrow (mono):** `// initiate_talent_scan`
- **H1:** Initiate **Neural** Talent Scan
- **Subtitle:** Upload a candidate's resume and paste the role brief — our engine extracts skills, validates work history, and benchmarks fit with fully explainable scoring.

### Resume Upload card
| Element | Text |
|---|---|
| Section title | Resume Upload |
| File constraints label | PDF · DOCX · Max 10MB |
| Dropzone heading (empty) | Drop the candidate's resume here |
| Dropzone subtext (empty) | or click to browse · encrypted end-to-end |
| Dropzone button | Select File |
| Dropzone heading (loaded) | Resume loaded |
| Replace link | Remove |
| Recent files label (mono) | RECENT |
| Recent file score | Match: 92% |

**Error / validation microcopy (recommended additions):**
- Wrong file type: *"We couldn't read that file. Please upload a PDF or DOCX."*
- File too large: *"This file is over 10MB. Try compressing it or uploading a smaller version."*
- Upload failed: *"Upload failed — check your connection and try again."*
- Empty/corrupted PDF: *"This file appears to be empty or unreadable. Try a different file."*

### Job Description card
| Element | Text |
|---|---|
| Section title | Job Description |
| Status label (mono) | AUTO-DETECT: ON |
| Textarea placeholder | Paste the job description here — responsibilities, required skills, experience level, and culture fit. The more detail you include, the more accurate the match. |
| Quick templates label (mono) | QUICK TEMPLATES |
| Template chip | Software Engineer |
| Template chip | Product Manager |
| Template chip | Data Scientist |
| Template chip | Designer |
| Stat label | TOKENS |
| Stat label | MODEL |
| Stat label | BIAS FILTER |

**Validation microcopy (recommended):**
- JD too short: *"Add a bit more detail to the job description (at least a few sentences) for an accurate match."*
- Helper text under textarea (optional): *"Tip: paste the full posting — our model ignores boilerplate like EEO statements automatically."*

### Run bar
| Element | Text |
|---|---|
| Status (incomplete) | Awaiting inputs |
| Status (ready) | Ready to scan |
| Checklist item | resume |
| Checklist item | job description |
| Primary CTA | Run Neural Analysis |
| Disabled CTA tooltip | Upload a resume and add a job description to continue |

### Feature highlights
| Title | Description |
|---|---|
| Secure Enclave | Your candidate data is encrypted end-to-end and never used to train external models. |
| Contextual Matching | Goes beyond keyword matching to understand real project impact and seniority. |
| Predictive Tenure | Uses statistical modeling to estimate candidate-role fit and likely tenure. |

---

## 3. Analyzing Screen

### Header
- **Eyebrow (mono):** `// live_process · 0xF4A`
- **H1:** Analyzing Resume Data
- **Subtitle:** Our engine is extracting structured data and mapping skills against your role's benchmark. This usually takes a few seconds.

### Process pipeline
| Element | Text |
|---|---|
| Panel label (mono) | PROCESS PIPELINE |
| Step 1 | Parsing resume |
| Step 2 | Validating work history |
| Step 3 | Mapping skills against benchmark |
| Step 4 | Generating fit report |
| Active step note (mono) | running… |
| Progress label (mono) | TOTAL PROGRESS |
| File reference (mono) | FILE: {fileName} · ID: {scanId} |

### Resume scan panel
| Element | Text |
|---|---|
| Panel label (mono) | RESUME SCAN |
| Live indicator | LIVE |
| Floating chip (matched skill) | MATCH: REACT.JS |
| Floating chip (matched skill) | MATCH: UI ARCHITECTURE |
| Floating chip (partial match) | PARTIAL: LEADERSHIP |
| Floating chip (verified) | CREDENTIAL VERIFIED |

### Cancel option (recommended addition)
- Link/button: *"Cancel scan"* — placed near the progress bar so users aren't stuck waiting if they uploaded the wrong file.

---

## 4. Results Screen ("Match Report")

### Header
- **Eyebrow (mono, success):** `// analysis_complete`
- **H1:** Candidate **Match Report**
- **Metadata line (mono):** REPORT ID: {id} · FILE: {fileName} · MODEL: {modelName} · {duration}s

### Header actions
| Button | Text |
|---|---|
| Secondary | Download PDF |
| Primary | Forward to Hiring Manager |
| Tertiary (success) | New Scan |

**Confirmation toast (recommended):**
- On "Forward to Hiring Manager": *"Report sent to [Hiring Manager name]."*
- On "Download PDF": *"Your report is downloading…"*

### Match score card
| Element | Text |
|---|---|
| Label (mono) | CANDIDATE MATCH SCORE |
| Score caption (≥85%) | Exceptional Match |
| Score caption (70–84%) | Strong Match |
| Score caption (50–69%) | Partial Match |
| Score caption (<50%) | Limited Match |
| Mini stat | Retention Risk |
| Mini stat | Technical Fit |
| Mini stat | Years of Experience |
| Mini stat | Salary Fit |

### JD vs Resume Alignment
| Element | Text |
|---|---|
| Section title | JD vs Resume Alignment |
| Confidence label (mono) | CONFIDENCE: 0.94 |
| Mini stat | Experience |
| Mini stat | Education |
| Mini stat | Avg. Tenure |

*Summary copy pattern:* "Candidate shows strong alignment with the **[Role Title]** requirements. Recent experience at **[Company]** matches the **[Key Requirement]** expectations in the JD."

*Gap note pattern:* "A gap was detected in **[Skill Area]**. The JD requires [X]; the resume reflects experience primarily with [Y]."

### Matched Skills / Skill Gaps
| Element | Text |
|---|---|
| Section title | Matched Skills |
| Count label (mono) | {n} MATCHED |
| Section title | Skill Gaps |
| Count label (mono) | {n} GAPS |
| Critical gap label (mono) | CRITICAL GAP |
| Critical gap body pattern | **{Skill}** is listed as a high-priority requirement. We recommend a technical screen to assess this gap before moving forward. |
| Empty state (no gaps) | No significant skill gaps detected — strong alignment across all key requirements. |

### AI Recommendations
| Element | Text |
|---|---|
| Section title | AI Recommendations |
| Count label (mono) | {n} ACTIONS |
| Card title | Interview Focus |
| Card title | Upskilling Path |
| Card title | Recruiter Insight |

### Talent Acquisition Funnel
| Element | Text |
|---|---|
| Section title | Hiring Pipeline |
| Status label (mono) | SCREENING PASSED |
| Stage | Screening |
| Stage | Interview 1 |
| Stage | Review |
| Stage | Offer |
| Stage status | Passed |
| Stage status | Pending |
| Stage status | In progress |
| Stage status | Scheduled |

---

## 5. Cross-cutting microcopy

| Scenario | Message |
|---|---|
| Network/API error (any screen) | "Something went wrong on our end. Please try again — if this keeps happening, contact support." |
| Session timeout | "Your session has expired. Please sign back in to continue." |
| Unsaved scan warning (navigating away mid-analysis) | "Your scan is still running. Leaving now will cancel it — continue?" |
| Loading skeleton label | "Loading…" |
| Empty History page | "No scans yet. Run your first candidate scan to see results here." |
| Empty Skills DB page | "Your skills database is empty. Add skill benchmarks to improve match accuracy." |
