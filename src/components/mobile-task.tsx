"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  finalizeMobilePhotoUpload,
  performMobileAction,
  prepareMobilePhotoUpload,
  type MobileActionState,
} from "@/app/mobile/actions";
import type { MobileWorkspace } from "@/integrations/operations/supabase-operations";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function MobileTask({ workspace, demo, actorRole, taskOptions }: { workspace: MobileWorkspace; demo: boolean; actorRole: string; taskOptions: { id: string; taskName: string; zoneName: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<MobileActionState | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const captureRole = workspace.beforeReady ? "after" : "before";

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const act = (input: Parameters<typeof performMobileAction>[0]) => {
    setNotice(null);
    startTransition(async () => setNotice(await performMobileAction(input)));
  };

  const chooseFile = (file: File | undefined) => {
    setNotice(null);
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setNotice({ ok: false, message: file.type === "image/heic" || file.type === "image/heif"
        ? "HEIC/HEIF is not supported. Choose a JPEG, PNG, or WebP image from your library."
        : "Choose a JPEG, PNG, or WebP image." });
      return;
    }
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setNotice({ ok: false, message: "Choose an image between 1 byte and 10 MB." });
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (cameraInput.current) cameraInput.current.value = "";
    if (libraryInput.current) libraryInput.current.value = "";
  };

  const uploadSelectedFile = () => {
    if (!selectedFile) return;
    const file = selectedFile;
    setNotice(null);
    setUploadStatus("Checking photo…");

    startTransition(async () => {
      try {
        const prepared = await prepareMobilePhotoUpload({
          taskRunId: workspace.taskId,
          role: captureRole,
          contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
          byteSize: file.size,
          sha256: await sha256(file),
        });
        if (!prepared.ok || !prepared.upload) {
          setNotice({ ok: false, message: prepared.message });
          return;
        }

        setUploadStatus("Uploading photo privately…");
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.storage
          .from("operational-evidence")
          .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, {
            cacheControl: "0",
            contentType: file.type,
            upsert: false,
          });
        if (error) {
          setNotice({ ok: false, message: "The photo could not be uploaded. Keep it selected and try again." });
          return;
        }

        setUploadStatus("Verifying and linking photo…");
        const finalized = await finalizeMobilePhotoUpload({
          taskRunId: workspace.taskId,
          evidenceId: prepared.upload.evidenceId,
          expiresAt: prepared.upload.expiresAt,
          signature: prepared.upload.signature,
        });
        setNotice(finalized);
        if (finalized.ok) clearSelectedFile();
      } catch {
        setNotice({ ok: false, message: "The upload was interrupted. Keep the photo selected and try again." });
      } finally {
        setUploadStatus(null);
      }
    });
  };

  return (
    <div className="mobileTaskWorkspace">
      <header className="mobileTaskHeader"><div><p className="eyebrow">Capture attributed to Worker 182 · signed in as {actorRole}</p><h1>Task evidence</h1></div><span className="shiftPill">Synthetic shift</span></header>
      {notice ? <div className={`mobileNotice ${notice.ok ? "mobileNoticeSuccess" : "mobileNoticeError"}`} role="status">{notice.message}</div> : null}
      {pending ? <div className="mobileUploadStatus" role="status"><span className="loadingPulse" /> {uploadStatus ?? "Saving securely…"}</div> : null}
      <nav aria-label="Assigned evidence tasks" className="captureTaskChoices">
        {taskOptions.map((task) => <a key={task.id} href={`/mobile?taskRunId=${task.id}`} aria-current={task.id === workspace.taskId ? "page" : undefined}>{task.zoneName} · {task.taskName}</a>)}
      </nav>
      <section className="mobileTaskCard" aria-labelledby="mobile-task-title">
        <div className="mobileTaskTop"><span className="taskNumber">01</span><span className={`zoneState zoneState-${workspace.state}`}>{workspace.state.replaceAll("_", " ")}</span></div>
        <p>{workspace.zoneName}</p><h2 id="mobile-task-title">{workspace.taskName}</h2><span className="taskDue">Due {new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", hour: "numeric", minute: "2-digit" }).format(new Date(workspace.dueAt))} · Before and after required</span>
        {!workspace.contextSelected ? (
          <div className="qrPrompt">
            <div className="qrGraphic" aria-hidden="true"><span /><span /><span /><span /></div>
            <div><strong>Confirm your work area</strong><p>Scan the zone code to attach photos to this task.</p></div>
            <button className="mobilePrimaryButton" type="button" disabled={pending || !demo} onClick={() => act({ action: "select_zone", taskRunId: workspace.taskId })}>Select {workspace.zoneName} task</button>
            <small>A zone code selects context. It does not check you in or prove identity.</small>
          </div>
        ) : (
          <div className="capturePanel">
            <div className="contextConfirmed"><span>✓</span><div><strong>{workspace.zoneName} selected</strong><small>Synthetic task context recorded</small></div></div>
            <div className="captureSteps">
              <div className={workspace.beforeReady ? "captureStepComplete" : "captureStepActive"}><span>1</span><div><strong>Before photo</strong><small>{workspace.beforeReady ? "Uploaded and linked" : "Ready to capture"}</small></div></div>
              <div className={workspace.afterReady ? "captureStepComplete" : workspace.beforeReady ? "captureStepActive" : ""}><span>2</span><div><strong>After photo</strong><small>{workspace.afterReady ? "Uploaded and linked" : workspace.beforeReady ? "Ready to capture" : "Available after before photo"}</small></div></div>
            </div>
            {!workspace.afterReady && ["ready", "in_progress", "correction_required"].includes(workspace.state) ? <>
              <div className="photoPickerActions" data-disabled={pending || !demo}>
                <input
                  id="mobile-camera-input"
                  ref={cameraInput}
                  className="visuallyHidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  disabled={pending || !demo}
                  onChange={(event) => chooseFile(event.target.files?.[0])}
                />
                <input
                  id="mobile-library-input"
                  ref={libraryInput}
                  className="visuallyHidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={pending || !demo}
                  onChange={(event) => chooseFile(event.target.files?.[0])}
                />
                <label className="cameraButton" htmlFor="mobile-camera-input" aria-disabled={pending || !demo}><span className="cameraIcon" aria-hidden="true">●</span>Take {captureRole} photo</label>
                <label className="photoLibraryButton" htmlFor="mobile-library-input" aria-disabled={pending || !demo}>Choose {captureRole} photo from library</label>
              </div>
              {selectedFile && previewUrl ? (
                <div className="photoPreview">
                  {/* A local object URL can preview the selected file before it is uploaded. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt={`Selected ${captureRole} evidence preview`} />
                  <div><strong>{selectedFile.name}</strong><span>{formatFileSize(selectedFile.size)} · {captureRole} evidence</span></div>
                  <button className="mobilePrimaryButton" type="button" disabled={pending || !demo} onClick={uploadSelectedFile}>Upload {captureRole} photo</button>
                  <button className="removePhotoButton" type="button" disabled={pending} onClick={clearSelectedFile}>Choose a different photo</button>
                </div>
              ) : <p className="photoPickerHelp">JPEG, PNG, or WebP · Maximum 10 MB · Stored privately</p>}
            </> : <div className="submissionComplete"><strong>Submission ready for review</strong><span>Both private photos are linked to the task.</span></div>}
          </div>
        )}
      </section>
      <section className="mobileEmptyState"><strong>Assigned evidence tasks</strong><span>Choose the correct task above before capturing a photo.</span></section>
    </div>
  );
}
