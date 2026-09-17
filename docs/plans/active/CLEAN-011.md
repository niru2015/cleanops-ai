# CLEAN-011 — Real mobile camera and image upload

Status: active on `codex/clean-011-real-mobile-upload`; GitHub issue #22.

## Outcome

Replace the simulated one-pixel capture on `/mobile` with the cleaner's actual selected image.
Support a phone rear-camera prompt and a separate photo-library/file picker. Store the image in the
existing private evidence bucket and reuse deterministic evidence validation and task linkage.

## Acceptance checks

- A cleaner with an active assigned task and selected zone can take or choose a JPEG, PNG or WebP
  image up to 10 MiB, preview it locally and upload it.
- The image uploads directly to private Supabase Storage with a server-issued, single-path token;
  privileged credentials never reach the browser.
- The server verifies authenticated role/site/task access, signed finalization ticket, file
  signature, size and SHA-256 before linking before/after evidence.
- Unsupported, oversized, interrupted, expired or tampered uploads show a retryable error without
  reporting task completion.
- Before must precede after; successful uploads survive reload and appear in the existing evidence
  and review workflows.
- `typecheck`, `lint`, `test`, `build`, database regression tests and a small-screen browser journey
  pass. Production is verified with an actual uploaded image, not the old synthetic action.

## Changed paths

- `src/app/mobile/actions.ts`
- `src/components/mobile-task.tsx`
- `src/schemas/operations.ts`
- `src/services/mobile-upload-ticket.ts`
- `src/lib/supabase/client.ts`
- `src/app/globals.css`
- focused unit and browser tests plus canonical demo/security documentation

## Non-goals

No image editing, compression, background uploads, offline queue, HEIC conversion, native app,
live WhatsApp media, face recognition or real casino data.
