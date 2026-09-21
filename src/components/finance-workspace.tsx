"use client";

import { useState, useTransition } from "react";
import { performFinanceAction, type FinanceActionState } from "@/app/finance/actions";
import type { FinanceWorkspace } from "@/integrations/finance/supabase-finance";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const now = () => new Date().toISOString();
const date = () => new Date().toISOString().slice(0, 10);

export function FinanceWorkspace({ workspace }: { workspace: FinanceWorkspace }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<FinanceActionState | null>(null);
  const act = (input: Parameters<typeof performFinanceAction>[0]) => {
    setNotice(null);
    startTransition(async () => setNotice(await performFinanceAction(input)));
  };
  return (
    <div className="financeWorkspace">
      <header className="financeHeader"><div><p className="eyebrow">Supervisor-controlled records</p><h1>Finance &amp; inventory</h1><p>Record supplier receipts, consumption and labour against the casino site. Totals are derived in the database.</p></div><span className="recordLabel">{workspace.items.length} active items</span></header>
      {notice ? <div className={`reviewNotice ${notice.ok ? "reviewNoticeSuccess" : "reviewNoticeError"}`} role="status">{notice.message}</div> : null}
      {pending ? <div className="reviewProgress" role="status">Saving financial record…</div> : null}
      <div className="financeGrid">
        <section className="financePanel" aria-labelledby="inventory-entry-title">
          <div className="panelHeading"><div><p className="eyebrow">Site stock movement</p><h2 id="inventory-entry-title">Inventory transaction</h2></div></div>
          <form className="financeForm" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); act({ action: "record_inventory", vendorId: String(form.get("vendorId") || "") || undefined, inventoryItemId: String(form.get("inventoryItemId")), transactionType: String(form.get("transactionType")) as "receipt" | "issue" | "adjustment" | "count", quantity: Number(form.get("quantity")), unitCost: Number(form.get("unitCost")), occurredAt: now(), notes: String(form.get("notes") || "") || undefined }); event.currentTarget.reset(); }}>
            <label>Item<select name="inventoryItemId" required defaultValue=""> <option value="" disabled>Select an item</option>{workspace.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label>
            <label>Movement<select name="transactionType" defaultValue="receipt"><option value="receipt">Supplier receipt</option><option value="issue">Issued to site</option><option value="adjustment">Adjustment</option><option value="count">Stock count</option></select></label>
            <label>Supplier<select name="vendorId" defaultValue=""><option value="">No supplier reference</option>{workspace.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
            <div className="financeFormRow"><label>Quantity<input name="quantity" type="number" min="0.001" step="0.001" required /></label><label>Unit cost<input name="unitCost" type="number" min="0" step="0.01" required /></label></div>
            <label>Note<input name="notes" maxLength={1000} placeholder="Optional receiving or issue note" /></label><button className="reviewButton reviewButton-primary" type="submit" disabled={pending}>Record inventory</button>
          </form>
        </section>
        <section className="financePanel" aria-labelledby="labour-entry-title">
          <div className="panelHeading"><div><p className="eyebrow">Costed hours</p><h2 id="labour-entry-title">Labour cost</h2></div></div>
          <form className="financeForm" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); act({ action: "record_labour", workerId: String(form.get("workerId") || "") || undefined, taskRunId: String(form.get("taskRunId") || "") || undefined, workDate: String(form.get("workDate")), hours: Number(form.get("hours")), hourlyCost: Number(form.get("hourlyCost")), costType: String(form.get("costType")) as "regular" | "overtime" | "contractor", notes: String(form.get("notes") || "") || undefined }); event.currentTarget.reset(); }}>
            <label>Worker<select name="workerId" defaultValue=""><option value="">Unassigned labour</option>{workspace.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label>
            <label>Task reference<select name="taskRunId" defaultValue=""><option value="">No task reference</option>{workspace.tasks.map((task) => <option key={task.id} value={task.id}>{task.name} · {task.state}</option>)}</select></label>
            <div className="financeFormRow"><label>Work date<input name="workDate" type="date" defaultValue={date()} required /></label><label>Cost type<select name="costType" defaultValue="regular"><option value="regular">Regular</option><option value="overtime">Overtime</option><option value="contractor">Contractor</option></select></label></div>
            <div className="financeFormRow"><label>Hours<input name="hours" type="number" min="0.01" max="24" step="0.25" required /></label><label>Hourly cost<input name="hourlyCost" type="number" min="0" step="0.01" required /></label></div>
            <label>Note<input name="notes" maxLength={1000} placeholder="Optional payroll or contractor note" /></label><button className="reviewButton reviewButton-primary" type="submit" disabled={pending}>Record labour</button>
          </form>
        </section>
      </div>
      <div className="financeGrid financeGrid-secondary">
        <section className="financePanel"><div className="panelHeading"><div><p className="eyebrow">Organization setup</p><h2>Add supplier</h2></div></div><form className="financeForm financeCompact" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); act({ action: "create_vendor", name: String(form.get("name")), vendorCode: String(form.get("vendorCode") || "") || undefined, contactReference: String(form.get("contactReference") || "") || undefined }); event.currentTarget.reset(); }}><label>Name<input name="name" required maxLength={200} /></label><label>Code<input name="vendorCode" maxLength={80} /></label><label>Contact reference<input name="contactReference" maxLength={200} /></label><button className="reviewButton reviewButton-secondary" type="submit" disabled={pending}>Add supplier</button></form></section>
        <section className="financePanel"><div className="panelHeading"><div><p className="eyebrow">Organization setup</p><h2>Add inventory item</h2></div></div><form className="financeForm financeCompact" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); act({ action: "create_inventory_item", name: String(form.get("name")), sku: String(form.get("sku") || "") || undefined, category: String(form.get("category") || "") || undefined, unitOfMeasure: String(form.get("unit")), reorderLevel: Number(form.get("reorderLevel")) }); event.currentTarget.reset(); }}><label>Name<input name="name" required maxLength={200} /></label><div className="financeFormRow"><label>SKU<input name="sku" maxLength={80} /></label><label>Unit<input name="unit" required maxLength={40} placeholder="case" /></label></div><div className="financeFormRow"><label>Category<input name="category" maxLength={100} /></label><label>Reorder level<input name="reorderLevel" type="number" min="0" step="0.001" defaultValue="0" required /></label></div><button className="reviewButton reviewButton-secondary" type="submit" disabled={pending}>Add inventory item</button></form></section>
      </div>
      <section className="financePanel financeLedger" aria-labelledby="inventory-ledger-title"><div className="panelHeading"><div><p className="eyebrow">Recent site records</p><h2 id="inventory-ledger-title">Inventory ledger</h2></div></div>{workspace.inventory.length ? <div className="financeTable"><div className="financeTableHead"><span>Item</span><span>Movement</span><span>Supplier</span><span>Quantity</span><span>Total</span></div>{workspace.inventory.map((entry) => <div key={entry.id} className="financeTableRow"><strong>{entry.item}<small>{new Date(entry.occurredAt).toLocaleString()}</small></strong><span>{entry.type}</span><span>{entry.vendor ?? "—"}</span><span>{entry.quantity} {entry.unit}</span><span>{money.format(entry.totalCost)}</span></div>)}</div> : <p className="recordNote">No inventory movements have been recorded.</p>}</section>
      <section className="financePanel financeLedger" aria-labelledby="labour-ledger-title"><div className="panelHeading"><div><p className="eyebrow">Recent site records</p><h2 id="labour-ledger-title">Labour ledger</h2></div></div>{workspace.labour.length ? <div className="financeTable"><div className="financeTableHead"><span>Worker</span><span>Date</span><span>Type</span><span>Hours</span><span>Total</span></div>{workspace.labour.map((entry) => <div key={entry.id} className="financeTableRow"><strong>{entry.worker ?? "Unassigned labour"}<small>{entry.notes ?? "No note"}</small></strong><span>{entry.workDate}</span><span>{entry.type}</span><span>{entry.hours}</span><span>{money.format(entry.totalCost)}</span></div>)}</div> : <p className="recordNote">No labour cost entries have been recorded.</p>}</section>
    </div>
  );
}
