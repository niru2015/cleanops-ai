"use client";

import { useState, useTransition } from "react";
import { performMessageResolution, type FinanceActionState } from "@/app/finance/actions";
import type { MessageWorkspace } from "@/integrations/messages/supabase-message-context";
import { formatUtcTimestamp } from "@/lib/format-utc-timestamp";

export function MessageContextQueue({ workspace }: { workspace: MessageWorkspace }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<FinanceActionState | null>(null);
  const act = (input: Parameters<typeof performMessageResolution>[0]) => {
    setNotice(null);
    startTransition(async () => setNotice(await performMessageResolution(input)));
  };

  return (
    <section className="messageQueue" aria-labelledby="message-queue-title">
      <header className="messageQueueHeader"><div><p className="eyebrow">WhatsApp normalization queue</p><h2 id="message-queue-title">Message context review</h2><p>Casino site is suggested from the registered receiving number. A Director or the casino&apos;s Area Manager confirms the area, task and sender before the message is used for operations or finance.</p></div><span className="recordLabel">{workspace.messages.length} visible</span></header>
      {notice ? <div className={`reviewNotice ${notice.ok ? "reviewNoticeSuccess" : "reviewNoticeError"}`} role="status">{notice.message}</div> : null}
      {pending ? <div className="reviewProgress" role="status">Updating message context…</div> : null}
      {workspace.messages.length ? <div className="messageQueueList">{workspace.messages.map((message) => <article key={message.contextId} className="messageQueueItem"><div className="messageQueueBody"><div><strong>{message.sender}</strong><time dateTime={message.occurredAt}>{formatUtcTimestamp(message.occurredAt)}</time></div><p>{message.text ?? "Media-only message"}</p>{message.media.length ? <div className="messageMediaList">{message.media.map((media) => <span key={media.id}>{media.kind} · {media.status}{media.mimeType ? ` · ${media.mimeType}` : ""}</span>)}</div> : null}</div><form className="messageResolutionForm" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); act({ contextId: message.contextId, siteId: message.siteId, zoneId: String(form.get("zoneId") || "") || undefined, taskRunId: String(form.get("taskRunId") || "") || undefined, senderWorkerId: String(form.get("senderWorkerId") || "") || undefined, senderRole: String(form.get("senderRole")) as "supervisor" | "manager" | "cleaner" | "system" | "unknown" }); }}><span className={`resolutionStatus resolutionStatus-${message.resolutionStatus}`}>{message.resolutionStatus}</span><label>Area<select name="zoneId" defaultValue={message.zoneId ?? ""}><option value="">Not linked</option>{workspace.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label><label>Task<select name="taskRunId" defaultValue={message.taskRunId ?? ""}><option value="">Not linked</option>{workspace.tasks.map((task) => <option key={task.id} value={task.id}>{task.name} · {task.state}</option>)}</select></label><label>Sender role<select name="senderRole" defaultValue={message.senderRole}><option value="supervisor">Supervisor</option><option value="manager">Manager</option><option value="cleaner">Cleaner</option><option value="system">System</option><option value="unknown">Unknown</option></select></label><label>Worker record<select name="senderWorkerId" defaultValue={message.senderWorkerId ?? ""}><option value="">No worker link</option>{workspace.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label><button type="submit" className="reviewButton reviewButton-secondary" disabled={pending}>Confirm context</button></form></article>)}</div> : <div className="reviewEmpty"><h3>No site-scoped messages are ready for review</h3><p>Inbound WhatsApp messages appear here once the worker has normalized them and the receiving number has a registered site.</p></div>}
    </section>
  );
}
