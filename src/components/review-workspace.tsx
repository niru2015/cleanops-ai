"use client";

import { type ReactNode, useState, useTransition } from "react";
import type { ReviewWorkspace as ReviewWorkspaceData } from "@/integrations/review/supabase-review";
import { performReviewAction, type ReviewActionState } from "@/app/review/actions";

const taskId = "81000000-0000-4000-8000-000000000001";

const auditLabels: Record<string, string> = {
  "quality.recorded": "Mock assessment recorded",
  "quality.failed": "Mock assessment unavailable",
  "finding.confirmed": "Supervisor confirmed finding",
  "suggestion.dismissed": "Supervisor dismissed suggestion",
  "correction.submitted": "Cleaner submitted correction",
  "submission.approved": "Supervisor approved submission",
};

function ActionButton({
  children,
  tone = "primary",
  disabled,
  onClick,
}: {
  children: ReactNode;
  tone?: "primary" | "secondary" | "quiet";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`reviewButton reviewButton-${tone}`} type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function EvidenceCard({ role, time, revision }: { role: "Before" | "After"; time: string; revision: number }) {
  return (
    <article className="evidenceCard">
      <div className={`evidencePreview evidencePreview${role}`} aria-label={`${role} synthetic evidence preview`}>
        <span className="evidenceTileMark" aria-hidden="true" />
        <span>Synthetic image</span>
      </div>
      <div className="evidenceMeta">
        <div>
          <strong>{role}</strong>
          <span>{time} · Revision {revision}</span>
        </div>
        <span className="privacyLabel">Private</span>
      </div>
    </article>
  );
}

export function ReviewWorkspace({ workspace, demo }: { workspace: ReviewWorkspaceData; demo: boolean }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ReviewActionState | null>(null);
  const revision = workspace.task.submission_revision;
  const correction = workspace.correctiveActions.at(-1) ?? null;
  const dismissed = workspace.auditEvents.some(
    (event) => event.submission_revision === revision && event.action === "suggestion.dismissed",
  );

  const act = (input: Parameters<typeof performReviewAction>[0]) => {
    setNotice(null);
    startTransition(async () => setNotice(await performReviewAction(input)));
  };

  const status = workspace.task.state === "approved"
    ? "Approved"
    : workspace.task.state === "correction_required"
      ? "Correction required"
      : workspace.pair
        ? "Pending supervisor review"
        : "Awaiting submission";

  return (
    <div className="reviewWorkspace">
      <header className="reviewHeader">
        <div>
          <p className="reviewContext">Aurora Downtown Demo · Sunday night shift</p>
          <h1>Evidence review</h1>
          <p className="reviewLead">Compare the latest submission, decide whether the suggested issue is real, and approve only the current revision.</p>
        </div>
        <div className={`taskState taskState-${workspace.task.state}`}>{status}</div>
      </header>

      {notice ? <div className={`reviewNotice ${notice.ok ? "reviewNoticeSuccess" : "reviewNoticeError"}`} role="status">{notice.message}</div> : null}
      {pending ? <div className="reviewProgress" role="status">Updating the review…</div> : null}

      <section className="reviewSummary" aria-label="Task summary">
        <div><span>Task</span><strong>{workspace.taskName}</strong></div>
        <div><span>Zone</span><strong>{workspace.zoneName}</strong></div>
        <div><span>Worker</span><strong>Worker 182 Demo</strong></div>
        <div><span>Current revision</span><strong>{revision || "—"}</strong></div>
      </section>

      {!workspace.pair ? (
        <section className="reviewEmpty" aria-labelledby="prepare-title">
          <div className="reviewEmptyNumber">23:15 → 23:29</div>
          <h2 id="prepare-title">Prepare the synthetic evidence pair</h2>
          <p>This creates the private BEFORE and AFTER records used by the supervisor workflow.</p>
          <ActionButton disabled={pending || !demo} onClick={() => act({ action: "prepare_initial", taskRunId: taskId })}>
            Prepare submission
          </ActionButton>
          {!demo ? <p className="manualNote">Sign in as an authorized supervisor to review live records.</p> : null}
        </section>
      ) : (
        <div className="reviewGrid">
          <div className="reviewMain">
            <section className="reviewSection" aria-labelledby="pair-title">
              <div className="sectionHeading">
                <div><p>Submission revision {revision}</p><h2 id="pair-title">Before and after</h2></div>
                <span className="sectionTime">{revision > 1 ? "23:34" : "23:29"}</span>
              </div>
              <div className="evidencePair">
                <EvidenceCard role="Before" time={revision > 1 ? "23:33" : "23:15"} revision={revision} />
                <EvidenceCard role="After" time={revision > 1 ? "23:34" : "23:29"} revision={revision} />
              </div>
            </section>

            <section className="reviewSection qualityPanel" aria-labelledby="quality-title">
              <div className="sectionHeading">
                <div><p>Decision support</p><h2 id="quality-title">Visual quality</h2></div>
                <span className="mockLabel">Mock AI</span>
              </div>

              {!workspace.decision ? (
                <div className="qualityAwaiting">
                  <p>No suggestion has been generated. The evidence remains available for manual review.</p>
                  <div className="buttonRow">
                    <ActionButton disabled={pending} onClick={() => act({ action: "run_mock", taskRunId: taskId, revision })}>Run Mock AI</ActionButton>
                    <ActionButton tone="quiet" disabled={pending} onClick={() => act({ action: "simulate_failure", taskRunId: taskId, revision })}>Simulate failure</ActionButton>
                  </div>
                </div>
              ) : workspace.decision.status === "failed" ? (
                <div className="manualReviewBox">
                  <strong>Mock AI unavailable</strong>
                  <p>No automated finding was created. Review the pair manually and record your decision.</p>
                  <ActionButton disabled={pending} onClick={() => act({ action: "approve", taskRunId: taskId, revision, decisionId: workspace.decision?.id ?? null, reason: "Supervisor completed manual visual review after mock failure." })}>
                    Approve after manual review
                  </ActionButton>
                </div>
              ) : (
                <>
                  <div className="scoreRow">
                    <div className="scoreValue"><strong>{workspace.decision.score}</strong><span>/100</span></div>
                    <div><strong>{revision > 1 ? "Correction looks ready for review" : "Possible quality issue"}</strong><p>Advisory score only. Supervisor approval is always required.</p></div>
                  </div>

                  {workspace.decision.observations.map((observation) => (
                    <article className="suggestionCard" key={observation.criterion_id}>
                      <div className="suggestionTop"><span>{observation.severity} severity</span><span>Suggested</span></div>
                      <h3>{observation.observation}</h3>
                      {correction?.source_revision === revision ? (
                        <div className="confirmedState"><strong>Finding confirmed</strong><span>{correction.instruction}</span></div>
                      ) : dismissed ? (
                        <div className="dismissedState">Suggestion dismissed · no finding created</div>
                      ) : (
                        <div className="buttonRow">
                          <ActionButton disabled={pending} onClick={() => act({ action: "confirm", decisionId: workspace.decision!.id, revision, criterionId: observation.criterion_id, instruction: "Re-clean the mirror and submit a corrected AFTER photo." })}>
                            Confirm and request correction
                          </ActionButton>
                          <ActionButton tone="secondary" disabled={pending} onClick={() => act({ action: "dismiss", decisionId: workspace.decision!.id, revision, criterionId: observation.criterion_id, reason: "Supervisor inspected the evidence and found no actionable streak." })}>
                            Dismiss suggestion
                          </ActionButton>
                        </div>
                      )}
                    </article>
                  ))}

                  {workspace.decision.observations.length === 0 && workspace.task.state !== "approved" ? (
                    <div className="approvalCallout">
                      <div><strong>No issue suggested</strong><span>Score {workspace.decision.score} still requires your approval.</span></div>
                      <ActionButton disabled={pending} onClick={() => act({ action: "approve", taskRunId: taskId, revision, decisionId: workspace.decision!.id, reason: null })}>Approve revision {revision}</ActionButton>
                    </div>
                  ) : null}

                  {dismissed && workspace.task.state === "submitted" ? (
                    <div className="approvalCallout">
                      <div><strong>Manual decision required</strong><span>The suggestion was dismissed; approve only after checking the evidence.</span></div>
                      <ActionButton disabled={pending} onClick={() => act({ action: "approve", taskRunId: taskId, revision, decisionId: workspace.decision!.id, reason: "Supervisor dismissed the mock suggestion after manual review." })}>Approve after review</ActionButton>
                    </div>
                  ) : null}
                </>
              )}

              {workspace.task.state === "approved" ? <div className="approvedBox"><strong>Revision {revision} approved</strong><span>Recorded by the supervisor; this mock score did not auto-approve the task.</span></div> : null}
            </section>

            {workspace.task.state === "correction_required" && correction ? (
              <section className="correctionPanel" aria-labelledby="correction-title">
                <div><p>Corrective action</p><h2 id="correction-title">{correction.instruction}</h2><span>Requested against revision {correction.source_revision}</span></div>
                <ActionButton disabled={pending || !demo} onClick={() => act({ action: "submit_correction", taskRunId: taskId })}>Submit corrected evidence</ActionButton>
              </section>
            ) : null}
          </div>

          <aside className="auditPanel" aria-labelledby="audit-title">
            <div className="sectionHeading"><div><p>Append-only record</p><h2 id="audit-title">Review history</h2></div></div>
            <ol className="auditList">
              <li><span className="auditDot" /><div><strong>Evidence submitted</strong><time>{revision > 1 ? "23:34" : "23:29"}</time></div></li>
              {workspace.auditEvents.map((event) => (
                <li key={event.id}><span className="auditDot" /><div><strong>{auditLabels[event.action] ?? event.action}</strong><time>Revision {event.submission_revision}</time></div></li>
              ))}
            </ol>
          </aside>
        </div>
      )}
    </div>
  );
}
