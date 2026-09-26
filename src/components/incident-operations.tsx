"use client";

import { useState, useTransition } from "react";
import { performIncidentAction, type ReportingActionState } from "@/app/incidents/actions";
import type { IncidentWorkspace } from "@/integrations/reporting/supabase-reporting";

export function IncidentOperations({ workspace }: { workspace: IncidentWorkspace }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ReportingActionState | null>(null);
  const act = (input: Parameters<typeof performIncidentAction>[0]) => {
    setNotice(null);
    startTransition(async () => setNotice(await performIncidentAction(input)));
  };

  return (
    <div className="reportingWorkspace">
      <header className="reportingHeader">
        <div><p className="eyebrow">Golden demo · Sunday night</p><h1>Incident &amp; equipment desk</h1><p>Structured reports at {workspace.siteName}, preserved as reported and separated from conclusions.</p></div>
        <span className="recordLabel">Internal records</span>
      </header>
      {notice ? <div className={`reviewNotice ${notice.ok ? "reviewNoticeSuccess" : "reviewNoticeError"}`} role="status">{notice.message}</div> : null}
      {pending ? <div className="reviewProgress" role="status">Saving operational record…</div> : null}

      <div className="reportingGrid">
        <section className="reportingPanel" aria-labelledby="incident-title">
          <div className="panelHeading"><div><p className="eyebrow">00:17 · Slot Bank 14</p><h2 id="incident-title">Reported scratch</h2></div><span className="neutralBadge">Cause undetermined</span></div>
          {workspace.incident ? (
            <>
              <dl className="recordFacts"><div><dt>Status</dt><dd>{workspace.incident.state}</dd></div><div><dt>Attributed to</dt><dd>{workspace.incident.worker}</dd></div><div><dt>Zone</dt><dd>{workspace.incident.zone}</dd></div></dl>
              <div className="recordSummary"><span>Recorded summary</span><strong>{workspace.incident.summary}</strong></div>
              <blockquote className="statementCard"><span>Attributed statement</span><p>{workspace.incident.statement}</p></blockquote>
              <p className="actionRecord"><strong>Recorded action:</strong> {workspace.incident.action}</p>
              {!workspace.incident.corrected ? <button className="reviewButton reviewButton-secondary" type="button" disabled={pending} onClick={() => act({ action: "correct_incident", incidentId: workspace.incident!.id })}>Clarify wording &amp; audit</button> : <p className="completeLine">✓ Wording correction audited</p>}
              <ol className="incidentTimeline" aria-label="Incident timeline">{workspace.incident.timeline.map((event) => <li key={event.id}><time>{event.time}</time><span /><p>{event.description}</p></li>)}</ol>
            </>
          ) : (
            <div className="reportingEmpty"><p>No incident has been recorded for the 00:17 event.</p><button className="reviewButton reviewButton-primary" type="button" disabled={pending} onClick={() => act({ action: "record_incident" })}>Record reported incident</button></div>
          )}
        </section>

        <section className="reportingPanel" aria-labelledby="equipment-title">
          <div className="panelHeading"><div><p className="eyebrow">02:05 · operator report</p><h2 id="equipment-title">Equipment intake</h2></div><span className="neutralBadge">Report only</span></div>
          {workspace.equipment ? (
            <>
              <div className="equipmentState"><span>Current state</span><strong>{workspace.equipment.state}</strong></div>
              <h3>{workspace.equipment.label}</h3><p className="equipmentIssue">{workspace.equipment.issue}</p>
              <dl className="recordFacts"><div><dt>Reported by</dt><dd>{workspace.equipment.worker}</dd></div><div><dt>Zone</dt><dd>{workspace.equipment.zone}</dd></div><div><dt>Maintenance ref.</dt><dd>{workspace.equipment.maintenanceReference ?? "None"}</dd></div></dl>
              <div className="boundaryCallout"><strong>No completed repair claimed by this intake</strong><p>Review separate attributed maintenance actions and approval in the asset history before describing repair completion.</p></div>
            </>
          ) : (
            <div className="reportingEmpty"><p>No equipment issue has been recorded for the 02:05 event.</p><button className="reviewButton reviewButton-primary" type="button" disabled={pending} onClick={() => act({ action: "record_equipment" })}>Record scrubber report</button></div>
          )}
        </section>
      </div>
      <a className="nextJourneyLink" href="/reports"><span>Shift close</span><strong>Prepare client report →</strong></a>
    </div>
  );
}
