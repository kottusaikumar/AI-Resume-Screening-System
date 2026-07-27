"""
pii_redaction.py
-----------------
Optional "blind screening" pre-processing: strips personally-identifying
and demographically-correlated signals from resume text before it is
scored, to reduce the chance that irrelevant attributes (name, gender-coded
first name, address/region, age via graduation year, photo captions, etc.)
influence — even subtly — a match score that should be based on
qualifications alone.

This is a well-established fairness technique in large-scale hiring
pipelines (used, in spirit, by "blind recruitment" programs at companies
and public-sector hiring bodies). It is entirely rule-based:
  - spaCy NER (already loaded in nlp_utils) for PERSON / GPE / LOC entities
  - regex for email, phone numbers, and physical addresses/postal codes

No LLM or external API is used — this is pure pattern matching + the
existing local spaCy pipeline's statistical NER model.

Note on scope: this redacts *text* signals only. It cannot remove bias
that might be encoded in embedded images (e.g. a photo on the resume) —
callers that need to handle photo-bearing PDFs should strip images at the
text-extraction stage.
"""

import re
from typing import List, Tuple

from app.core.nlp_utils import nlp

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
PHONE_RE = re.compile(
    r"(\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b"
)
POSTAL_ADDRESS_RE = re.compile(
    r"\b\d{1,5}\s+[A-Za-z0-9.\s]{3,40}\b(street|st\.?|avenue|ave\.?|road|rd\.?|"
    r"lane|ln\.?|drive|dr\.?|boulevard|blvd\.?|way|court|ct\.?)\b",
    re.I,
)
ZIP_RE = re.compile(r"\b\d{5,6}(-\d{4})?\b")

# NER labels that carry demographic/geographic signal we want to blind.
_REDACT_ENT_LABELS = {"PERSON", "GPE", "LOC", "NORP", "FAC"}


def _redact_spans(text: str, spans: List[Tuple[int, int]], tag: str) -> str:
    """Replace each (start, end) span with a fixed-width redaction tag,
    processed back-to-front so earlier offsets stay valid."""
    for start, end in sorted(spans, key=lambda s: s[0], reverse=True):
        text = text[:start] + tag + text[end:]
    return text


def redact_pii(text: str, max_chars_for_ner: int = 20_000) -> str:
    """
    Returns a copy of `text` with names, locations, emails, phone numbers,
    and street addresses replaced by neutral placeholder tags. Intended to
    be run on resume text (not the JD) before it is fed into the scoring
    pipeline, when the caller opts into blind-screening mode.
    """
    # 1. Regex-based (cheap, high precision): email / phone / address.
    text = EMAIL_RE.sub("[EMAIL]", text)
    text = POSTAL_ADDRESS_RE.sub("[ADDRESS]", text)
    text = PHONE_RE.sub("[PHONE]", text)

    # 2. spaCy NER for names / locations / nationalities / facilities.
    #    Guard against pathologically long documents — NER is O(n) but we
    #    cap it defensively for a request-serving path.
    # spaCy is an optional enhancement in the zero-download production
    # profile. The high-confidence regex redactions above remain active when
    # the model is unavailable; never fail the screening request merely
    # because optional NER could not start.
    if nlp is not None:
        ner_text = text[:max_chars_for_ner]
        doc = nlp(ner_text)
        spans = [
            (ent.start_char, ent.end_char)
            for ent in doc.ents
            if ent.label_ in _REDACT_ENT_LABELS
        ]
        redacted_head = _redact_spans(ner_text, spans, "[REDACTED]")
        text = redacted_head + text[max_chars_for_ner:]

    return text
