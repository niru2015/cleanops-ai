# ADR 010: Private contract source and reviewed extraction

Status: Accepted, 2026-09-23.

## Context

Issue #62 needs PDF, DOCX and scanned source files to contribute proposed terms without bypassing the CLEAN-022 version/approval model. Originals can contain commercial information even when an Operations Manager may review an operational clause.

## Decision

Store originals in a dedicated private Supabase bucket and verified metadata in `contract_documents`. Upload directly from the browser with a short scoped signed token; the server re-reads the object and verifies MIME signature, size, SHA-256 and page bounds. Append extraction runs, immutable field proposals with source spans and human decisions in separate tables. Separate RLS on proposals allows operational snippets to Operations Managers without exposing commercial snippets or originals. The deterministic provider extracts data only; the transaction RPC applies a reviewed value to the existing draft, and CLEAN-022 approval/activation remains the consequential gate. Native PDF/DOCX text precedes bounded local English OCR for images and scanned PDF pages.

## Alternatives

- Proxying files through a Next.js action would couple upload size to function body limits.
- Putting machine output directly in canonical child rows would hide the human decision and make reruns destructive.
- A public bucket would make original contracts reachable outside site authorization.

## Consequences and revisit trigger

OCR can fail or be incomplete; a failed run leaves manual entry available. DOCX has no reliable physical page number from raw text extraction, so its proposals require review instead of claiming a page. English OCR is limited to four scanned PDF pages per run and images are bounded by dimensions. Revisit with a reviewed provider adapter, multilingual requirements or larger contracts; preserve the same immutable proposal and human gate.
