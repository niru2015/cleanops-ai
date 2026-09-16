"use client";

import { useState, useTransition } from "react";
import { performOperationsAction, type OperationsActionState } from "@/app/operations/actions";
import type { OperationsWorkspace } from "@/integrations/operations/supabase-operations";

const stateLabels: Record<string, string> = { planned: "Scheduled", ready: "Ready", in_progress: "In progress", submitted: "Review due", correction_required: "Correction due", approved: "Approved", empty: "No task" };

export function OperationsCommand({ workspace }: { workspace: OperationsWorkspace }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<OperationsActionState | null>(null);
  const act = (input: Parameters<typeof performOperationsAction>[0]) => {
    setNotice(null);
    startTransition(async () => setNotice(await performOperationsAction(input)));
  };
  const full = workspace.coverage.gap === 0;

  return (
    <div className="opsWorkspace">
      <header className="opsHeader">
        <div><p className="eyebrow">Sunday night · 22:45–06:00</p><h1>Operations command</h1><p>Staffing, task delivery and supervisor work from recorded activity at {workspace.siteName}.</p></div>
        <span className={`coverageBadge ${full ? "coverageBadgeFull" : ""}`}>{full ? "Covered" : `${workspace.coverage.gap} position gap`}</span>
      </header>
      {notice ? <div className={`reviewNotice ${notice.ok ? "reviewNoticeSuccess" : "reviewNoticeError"}`} role="status">{notice.message}</div> : null}
      {pending ? <div className="reviewProgress" role="status">Saving staffing record…</div> : null}
      <section className="opsMetrics" aria-label="Operations summary">
        <article className="coverageMetric"><span>Eligible workers present</span><strong>{workspace.coverage.present}<small> / {workspace.coverage.required}</small></strong><p>Distinct assigned check-ins</p></article>
        <article><span>Review queue</span><strong>{workspace.outstandingReviews}</strong><p>Submitted tasks</p></article>
        <article><span>Corrections</span><strong>{workspace.openCorrections}</strong><p>Open or resubmitted</p></article>
        <article><span>SLA risk</span><strong>{workspace.slaRisks}</strong><p>Due by 23:30, incomplete</p></article>
      </section>
      <div className="opsGrid">
        <section className="opsPanel" aria-labelledby="coverage-title">
          <div className="panelHeading"><div><p className="eyebrow">Coverage from records</p><h2 id="coverage-title">Night shift staffing</h2></div><span className="recordLabel">Live records</span></div>
          <div className="coverageTrack" aria-label={`${workspace.coverage.present} of ${workspace.coverage.required} positions covered`}><span style={{ width: `${Math.min((workspace.coverage.present / workspace.coverage.required) * 100, 100)}%` }} /></div>
          <ol className="coverageTimeline">
            {workspace.timeline.map((point) => <li key={point.time}><time>{point.time}</time><span className={point.present === point.required ? "timelineDotFull" : ""} /><div><strong>{point.present}/{point.required} present</strong><small>{point.present === point.required ? "Coverage complete" : `${point.required - point.present} positions open`}</small></div></li>)}
          </ol>
          <div className="replacementList">
            <h3>Eligible replacement candidates</h3>
            {workspace.candidates.map((candidate) => (
              <article key={candidate.id}>
                <div><strong>{candidate.name}</strong><span>{candidate.checkedIn ? "Checked in" : candidate.selected ? "Assigned · awaiting check-in" : "Eligible · available"}</span></div>
                {!candidate.selected ? <button className="reviewButton reviewButton-secondary" type="button" disabled={pending} onClick={() => act({ action: "select_replacement", workerId: candidate.id })}>Select &amp; assign</button>
                  : !candidate.checkedIn ? <button className="reviewButton reviewButton-primary" type="button" disabled={pending} onClick={() => act({ action: "check_in_replacement", workerId: candidate.id })}>Record check-in</button>
                  : <span className="completeMark" aria-label="Complete">✓</span>}
              </article>
            ))}
          </div>
          <p className="recordNote">Candidate eligibility is a synthetic site permission reviewed by a human. CleanOps does not dispatch automatically.</p>
        </section>
        <section className="opsPanel" aria-labelledby="zones-title">
          <div className="panelHeading"><div><p className="eyebrow">Canonical task states</p><h2 id="zones-title">Site zones</h2></div><span>{workspace.zones.length} zones</span></div>
          <div className="zoneList">
            {workspace.zones.map((zone) => <article key={zone.id}><span className={`zoneSignal zoneSignal-${zone.state}`} /><div><strong>{zone.name}</strong><span>{zone.task}</span></div><span className={`zoneState zoneState-${zone.state}`}>{stateLabels[zone.state] ?? zone.state.replaceAll("_", " ")}</span></article>)}
          </div>
          <a className="mobileJourneyLink" href="/mobile"><span>Cleaner workflow</span><strong>Open mobile task capture →</strong></a>
        </section>
      </div>
    </div>
  );
}
