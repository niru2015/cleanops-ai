"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { extractContractDocument, finalizeContractDocumentUpload,
  prepareContractDocumentUpload, recordContractExtractionDecision } from "@/app/finance/contracts/document-actions";

export type DocumentView = { id: string; file_name: string; status: string; detected_mime: string | null;
  page_count: number | null; created_at: string };
export type ProposalView = { id: string; field_key: string; category: string; business_state: string;
  proposed_value: unknown; source_page: number | null; source_span: string | null };
export type DecisionView = { proposal_id: string; decision: string; reviewed_value: unknown;
  reviewed_at: string; reason: string | null; canonical_table: string | null };

const accepted = new Set(["application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg", "image/png", "image/webp"]);
async function digest(file: File) {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), (item) => item.toString(16).padStart(2, "0")).join("");
}

export function ContractDocumentPanel({ contractId, canUpload, canReadDocuments, operationalOnly, documents, proposals,
  decisions }: { contractId: string; canUpload: boolean; canReadDocuments: boolean; operationalOnly: boolean;
  documents: DocumentView[]; proposals: ProposalView[]; decisions: DecisionView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<File | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});

  function upload() {
    if (!selected) return;
    const file = selected;
    startTransition(async () => {
      try {
        if (!accepted.has(file.type) || file.size < 1 || file.size > 15 * 1024 * 1024)
          throw new Error("Choose a PDF, DOCX, JPEG, PNG or WebP file up to 15 MB.");
        setNotice("Preparing private upload…");
        const prepared = await prepareContractDocumentUpload({ contractId, fileName: file.name,
          mime: file.type, byteSize: file.size, sha256: await digest(file) });
        if (!prepared.ok) throw new Error(prepared.message);
        if (prepared.duplicateId) {
          setNotice("This document was already uploaded to this draft.");
          setSelected(null);
          router.refresh();
          return;
        }
        if (!prepared.upload) throw new Error("Upload preparation was incomplete.");
        setNotice("Uploading directly to private storage…");
        const uploaded = await createSupabaseBrowserClient().storage.from("contract-documents")
          .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file,
            { contentType: file.type, upsert: false, cacheControl: "0" });
        if (uploaded.error) throw new Error("The private upload failed. Try again.");
        setNotice("Verifying file integrity…");
        const finalized = await finalizeContractDocumentUpload({ contractId,
          documentId: prepared.upload.documentId, expiresAt: prepared.upload.expiresAt,
          signature: prepared.upload.signature });
        if (!finalized.ok) throw new Error(finalized.message);
        setSelected(null);
        setNotice("Document verified. Run extraction to review proposed terms.");
        router.refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The upload could not be completed.");
      }
    });
  }
  function extract(documentId: string) {
    startTransition(async () => {
      setNotice("Reading the source and preparing proposals…");
      const result = await extractContractDocument({ contractId, documentId });
      setNotice(result.message);
      router.refresh();
    });
  }
  function decide(proposalId: string, decision: "accept" | "edit" | "reject" | "unknown") {
    startTransition(async () => {
      const result = await recordContractExtractionDecision({ contractId, proposalId, decision,
        reviewedValue: decision === "edit" ? edits[proposalId] : undefined });
      setNotice(result.message);
      router.refresh();
    });
  }
  return <section aria-labelledby="document-review-title">
    <h2 id="document-review-title">Source documents and human review</h2>
    <p>Machine values are proposals. Reviewing a proposal does not approve or activate the contract.</p>
    {notice && <p role="status">{notice}</p>}
    {canUpload && <div>
      <label>Contract PDF, DOCX or scanned image <input type="file" accept=".pdf,.docx,image/jpeg,image/png,image/webp"
        onChange={(event) => setSelected(event.target.files?.[0] ?? null)} /></label>
      <button type="button" disabled={!selected || pending} onClick={upload}>Upload private contract</button>
    </div>}
    {canReadDocuments && documents.length > 0 && <ul>{documents.map((document) =>
      <li key={document.id}>{document.file_name} · {document.status}
        {document.page_count ? ` · ${document.page_count} page${document.page_count === 1 ? "" : "s"}` : ""}
        {document.status === "ready" && <>
          {" · "}<a href={`/api/finance/contracts/documents/${document.id}/download`}>Download original</a>
          {canUpload && <>{" · "}<button type="button" disabled={pending} onClick={() => extract(document.id)}>Extract proposed terms</button></>}
        </>}
      </li>)}</ul>}
    {proposals.length > 0 && <div>
      <h3>Proposed terms</h3>
      {proposals.map((proposal) => {
        const reviewed = decisions.find((item) => item.proposal_id === proposal.id);
        return <article key={proposal.id} className="reviewCard">
          <h4>{proposal.field_key.replaceAll("_", " ")} · {proposal.business_state.replaceAll("_", " ")}</h4>
          <p>Source: {proposal.source_page ? `page ${proposal.source_page}` : "page unavailable"}
            {proposal.source_span ? ` · “${proposal.source_span}”` : " · no matching source clause"}</p>
          <p>Proposed CleanOps value: <code>{proposal.proposed_value == null ? "Unresolved" : JSON.stringify(proposal.proposed_value)}</code></p>
          {reviewed ? <p>Human decision: {reviewed.decision}
            {reviewed.reviewed_value == null ? "" : ` · ${JSON.stringify(reviewed.reviewed_value)}`}
            {reviewed.canonical_table ? ` · saved to ${reviewed.canonical_table}` : ""}</p>
            : <>
              <label>Edited value as JSON <textarea value={edits[proposal.id] ?? JSON.stringify(proposal.proposed_value)}
                onChange={(event) => setEdits((prior) => ({ ...prior, [proposal.id]: event.target.value }))} /></label>
              <div className="reviewActions">
                {proposal.business_state === "clear" && <button type="button" disabled={pending}
                  onClick={() => decide(proposal.id, "accept")}>Accept</button>}
                <button type="button" disabled={pending} onClick={() => decide(proposal.id, "edit")}>Save edited value</button>
                <button type="button" disabled={pending} onClick={() => decide(proposal.id, "reject")}>Reject</button>
                <button type="button" disabled={pending} onClick={() => decide(proposal.id, "unknown")}>Mark unknown</button>
              </div>
            </>}
          {operationalOnly && <p>Operational review only. A Director or Area Manager applies canonical draft values.</p>}
        </article>;
      })}
    </div>}
  </section>;
}
