"use client";

import { useState, useTransition } from "react";
import { performMobileAction, type MobileActionState } from "@/app/mobile/actions";
import type { MobileWorkspace } from "@/integrations/operations/supabase-operations";

export function MobileTask({ workspace, demo }: { workspace: MobileWorkspace; demo: boolean }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<MobileActionState | null>(null);
  const act = (input: Parameters<typeof performMobileAction>[0]) => {
    setNotice(null);
    startTransition(async () => setNotice(await performMobileAction(input)));
  };
  const captureRole = workspace.beforeReady ? "after" : "before";

  return (
    <div className="mobileTaskWorkspace">
      <header className="mobileTaskHeader"><div><p className="eyebrow">Worker 182 · Sunday night</p><h1>My tasks</h1></div><span className="shiftPill">On shift</span></header>
      {notice ? <div className={`mobileNotice ${notice.ok ? "mobileNoticeSuccess" : "mobileNoticeError"}`} role="status">{notice.message}</div> : null}
      {pending ? <div className="mobileUploadStatus" role="status"><span className="loadingPulse" /> Uploading securely…</div> : null}
      <section className="mobileTaskCard" aria-labelledby="mobile-task-title">
        <div className="mobileTaskTop"><span className="taskNumber">01</span><span className={`zoneState zoneState-${workspace.state}`}>{workspace.state.replaceAll("_", " ")}</span></div>
        <p>{workspace.zoneName}</p><h2 id="mobile-task-title">{workspace.taskName}</h2><span className="taskDue">Due 23:45 · Before and after required</span>
        {!workspace.contextSelected ? (
          <div className="qrPrompt">
            <div className="qrGraphic" aria-hidden="true"><span /><span /><span /><span /></div>
            <div><strong>Confirm your work area</strong><p>Scan the zone code to attach photos to this task.</p></div>
            <button className="mobilePrimaryButton" type="button" disabled={pending || !demo} onClick={() => act({ action: "select_zone", taskRunId: workspace.taskId })}>Scan Slot Bank 14 code</button>
            <small>A zone code selects context. It does not check you in or prove identity.</small>
          </div>
        ) : (
          <div className="capturePanel">
            <div className="contextConfirmed"><span>✓</span><div><strong>{workspace.zoneName} selected</strong><small>Task context expires after 30 minutes</small></div></div>
            <div className="captureSteps">
              <div className={workspace.beforeReady ? "captureStepComplete" : "captureStepActive"}><span>1</span><div><strong>Before photo</strong><small>{workspace.beforeReady ? "Uploaded and linked" : "Ready to capture"}</small></div></div>
              <div className={workspace.afterReady ? "captureStepComplete" : workspace.beforeReady ? "captureStepActive" : ""}><span>2</span><div><strong>After photo</strong><small>{workspace.afterReady ? "Uploaded and linked" : workspace.beforeReady ? "Ready to capture" : "Available after before photo"}</small></div></div>
            </div>
            {!workspace.afterReady ? <>
              <button className="cameraButton" type="button" disabled={pending || !demo} onClick={() => act({ action: "capture", taskRunId: workspace.taskId, role: captureRole, simulateFailure: false })}><span className="cameraIcon" aria-hidden="true">●</span>Capture {captureRole} photo</button>
              <button className="failureLink" type="button" disabled={pending || !demo} onClick={() => act({ action: "capture", taskRunId: workspace.taskId, role: captureRole, simulateFailure: true })}>Simulate upload failure</button>
            </> : <div className="submissionComplete"><strong>Submission ready for review</strong><span>Both private photos are linked to the task.</span></div>}
          </div>
        )}
      </section>
      <section className="mobileEmptyState"><strong>No other assigned tasks</strong><span>New work will appear here after a supervisor assigns it.</span></section>
    </div>
  );
}
