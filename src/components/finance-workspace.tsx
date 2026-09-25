"use client";

import { useState, useTransition } from "react";
import { acceptFinanceImport, performFinanceAction, previewFinanceImport, type FinanceActionState } from "@/app/finance/actions";
import type { FinanceWorkspace } from "@/integrations/finance/supabase-finance";
import type { FinanceImportPreview } from "@/services/finance-csv";
import { formatUtcTimestamp } from "@/lib/format-utc-timestamp";
import { Alert, Button, FilterBar, KpiCard, KpiCardGrid, SelectField, StatusBadge, TextField } from "@/components/ui";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const importedMoney = (amount: number, currency: string) => `${currency || "—"} ${amount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const now = () => new Date().toISOString();
const date = () => new Date().toISOString().slice(0, 10);

export function FinanceWorkspace({
  workspace,
  editable,
  siteId,
}: {
  workspace: FinanceWorkspace;
  editable: boolean;
  siteId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<FinanceActionState | null>(null);
  const [importFile, setImportFile] = useState<{ fileName: string; csv: string } | null>(null);
  const [preview, setPreview] = useState<FinanceImportPreview | null>(null);
  const [completeness, setCompleteness] = useState<"complete" | "incomplete" | "estimated">("complete");
  const [supersedesBatchId, setSupersedesBatchId] = useState("");
  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);
  const [editingLabourId, setEditingLabourId] = useState<string | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState("");
  const [labourFilter, setLabourFilter] = useState("");
  const act = (input: Parameters<typeof performFinanceAction>[0]) => {
    setNotice(null);
    startTransition(async () => setNotice(await performFinanceAction(input)));
  };

  const filteredInventory = workspace.inventory.filter((entry) => {
    const needle = inventoryFilter.trim().toLowerCase();
    if (!needle) return true;
    return entry.item.toLowerCase().includes(needle) || (entry.vendor ?? "").toLowerCase().includes(needle) || (entry.notes ?? "").toLowerCase().includes(needle);
  });
  const filteredLabour = workspace.labour.filter((entry) => {
    const needle = labourFilter.trim().toLowerCase();
    if (!needle) return true;
    return (entry.worker ?? "").toLowerCase().includes(needle) || (entry.notes ?? "").toLowerCase().includes(needle);
  });

  return (
    <div className="financeWorkspace">
      <header className="financeHeader">
        <div>
          <p className="eyebrow">{editable ? "Director-controlled records" : "Area Manager financial view"}</p>
          <h1>Finance &amp; inventory</h1>
          <p>
            {editable
              ? "Record supplier receipts, consumption and labour against the selected casino. Totals are derived in the database."
              : "Financial records for the selected casino are read only for Area Managers."}
          </p>
        </div>
        <StatusBadge tone="neutral">{workspace.items.length} active items</StatusBadge>
      </header>

      {notice ? <Alert tone={notice.ok ? "success" : "danger"}>{notice.message}</Alert> : null}
      {pending ? <Alert tone="info">Saving financial record…</Alert> : null}
      {!workspace.accountingAvailable && <Alert tone="danger">Accounting imports are unavailable because this database has not received the finance import schema. The other finance records remain available.</Alert>}
      {!workspace.timeAvailable && <Alert tone="danger">Approved time is unavailable because this database has not received the time and labour schema.</Alert>}

      <section className="financePanel financeReconciliation" aria-labelledby="reconciliation-title">
        <div className="panelHeading"><div><p className="eyebrow">Approved actuals</p><h2 id="reconciliation-title">Site contribution</h2></div></div>
        {workspace.reconciliations.length ? workspace.reconciliations.map((entry) => {
          const margin = entry.revenue === 0 ? null : entry.contribution / entry.revenue;
          return <div key={`${entry.period}-${entry.reconciledAt}`}>
            <KpiCardGrid>
              <KpiCard label="Revenue" value={importedMoney(entry.revenue, entry.currency)} />
              <KpiCard label="Direct cost" value={importedMoney(entry.labour + entry.supplies + entry.repairs + entry.otherDirectCost, entry.currency)} />
              <KpiCard label="Direct contribution" value={importedMoney(entry.contribution, entry.currency)} />
              <KpiCard label="Contribution margin" value={margin === null ? "N/A" : `${(margin * 100).toFixed(1)}%`} />
            </KpiCardGrid>
            <p className="recordNote">{entry.period} · {entry.completeness} · reconciled {formatUtcTimestamp(entry.reconciledAt)}</p>
          </div>;
        }) : <p className="recordNote">No accepted accounting import is available for this casino.</p>}
        <p className="recordNote">Direct contribution is revenue less direct labour, supplies, repairs and other direct costs. It is not net profit; overhead, depreciation and tax are excluded.</p>
      </section>

      {editable ? (
        <>
          {workspace.accountingAvailable && <section className="financePanel" aria-labelledby="finance-import-title">
            <div className="panelHeading"><div><p className="eyebrow">Director-controlled import</p><h2 id="finance-import-title">Accounting CSV</h2></div></div>
            <form className="financeForm" onSubmit={(event) => {
              event.preventDefault();
              if (!importFile) return;
              setNotice(null);
              startTransition(async () => {
                const result = await previewFinanceImport(importFile);
                setPreview(result.preview ?? null);
                setNotice(result);
              });
            }}>
              <label>CSV file<input name="financeCsv" type="file" accept=".csv,text/csv" required onChange={async (event) => {
                const file = event.target.files?.[0];
                setPreview(null);
                setImportFile(file ? { fileName: file.name, csv: await file.text() } : null);
              }} /></label>
              <Button variant="secondary" type="submit" disabled={pending || !importFile}>Preview import</Button>
            </form>
            {preview ? <div className="financeImportPreview">
              <KpiCardGrid>
                <KpiCard label="Rows" value={preview.rows.length} />
                <KpiCard label="Revenue" value={importedMoney(preview.totals.revenue, preview.currency)} />
                <KpiCard label="Direct cost" value={importedMoney(preview.totals.directCost, preview.currency)} />
                <KpiCard label="Contribution" value={importedMoney(preview.totals.directContribution, preview.currency)} />
              </KpiCardGrid>
              {preview.errors.map((message) => <p className="importIssue importIssueError" key={message}>{message}</p>)}
              {preview.warnings.map((message) => <p className="importIssue" key={message}>{message}</p>)}
              {!preview.errors.length ? <div className="financeImportAccept">
                <SelectField label="Import status" value={completeness} onChange={(event) => setCompleteness(event.target.value as typeof completeness)}>
                  <option value="complete">Complete</option><option value="incomplete">Incomplete</option><option value="estimated">Estimated</option>
                </SelectField>
                <SelectField label="Correction of" value={supersedesBatchId} onChange={(event) => setSupersedesBatchId(event.target.value)}>
                  <option value="">New import</option>{workspace.imports.filter((entry) => entry.state === "accepted").map((entry) => <option key={entry.id} value={entry.id}>{entry.fileName}</option>)}
                </SelectField>
                <Button variant="primary" type="button" disabled={pending || !importFile} onClick={() => {
                  if (!importFile) return;
                  startTransition(async () => {
                    const result = await acceptFinanceImport({ ...importFile, completeness, supersedesBatchId: supersedesBatchId || undefined });
                    setNotice(result);
                    if (result.ok) setPreview(null);
                  });
                }}>Accept import</Button>
              </div> : null}
            </div> : null}
            {workspace.imports.length ? <p className="recordNote">Last import: {workspace.imports[0].fileName} · {workspace.imports[0].state} · {workspace.imports[0].acceptedAt ? formatUtcTimestamp(workspace.imports[0].acceptedAt) : "not accepted"}</p> : null}
          </section>}

          <div className="financeGrid">
            <section className="financePanel" aria-labelledby="inventory-entry-title">
              <div className="panelHeading"><div><p className="eyebrow">Site stock movement</p><h2 id="inventory-entry-title">Inventory transaction</h2></div></div>
              <form className="financeForm" onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                act({
                  action: "record_inventory",
                  siteId,
                  vendorId: String(form.get("vendorId") || "") || undefined,
                  inventoryItemId: String(form.get("inventoryItemId")),
                  transactionType: String(form.get("transactionType")) as "receipt" | "issue" | "adjustment" | "count",
                  quantity: Number(form.get("quantity")),
                  unitCost: Number(form.get("unitCost")),
                  occurredAt: now(),
                  notes: String(form.get("notes") || "") || undefined,
                });
                event.currentTarget.reset();
              }}>
                <SelectField label="Item" name="inventoryItemId" required defaultValue="">
                  <option value="" disabled>Select an item</option>{workspace.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}
                </SelectField>
                <SelectField label="Movement" name="transactionType" defaultValue="receipt">
                  <option value="receipt">Supplier receipt</option><option value="issue">Issued to site</option><option value="adjustment">Adjustment</option><option value="count">Stock count</option>
                </SelectField>
                <SelectField label="Supplier" name="vendorId" defaultValue="">
                  <option value="">No supplier reference</option>{workspace.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                </SelectField>
                <div className="financeFormRow">
                  <TextField label="Quantity" name="quantity" type="number" min="0.001" step="0.001" required />
                  <TextField label="Unit cost" name="unitCost" type="number" min="0" step="0.01" required />
                </div>
                <TextField label="Note" name="notes" maxLength={1000} placeholder="Optional receiving or issue note" />
                <Button variant="primary" type="submit" disabled={pending}>Record inventory</Button>
              </form>
            </section>

            <section className="financePanel" aria-labelledby="labour-entry-title">
              <div className="panelHeading"><div><p className="eyebrow">Administrative adjustment</p><h2 id="labour-entry-title">Direct labour cost adjustment</h2></div></div>
              <p>Use approved time and effective worker rates for normal labour cost. This form records a separately audited adjustment or import reference.</p>
              <form className="financeForm" onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                act({
                  action: "record_labour",
                  siteId,
                  workerId: String(form.get("workerId") || "") || undefined,
                  taskRunId: String(form.get("taskRunId") || "") || undefined,
                  workDate: String(form.get("workDate")),
                  hours: Number(form.get("hours")),
                  hourlyCost: Number(form.get("hourlyCost")),
                  costType: String(form.get("costType")) as "regular" | "overtime" | "contractor",
                  notes: String(form.get("notes")),
                });
                event.currentTarget.reset();
              }}>
                <SelectField label="Worker" name="workerId" defaultValue="">
                  <option value="">Unassigned labour</option>{workspace.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
                </SelectField>
                <SelectField label="Task reference" name="taskRunId" defaultValue="">
                  <option value="">No task reference</option>{workspace.tasks.map((task) => <option key={task.id} value={task.id}>{task.name} · {task.state}</option>)}
                </SelectField>
                <div className="financeFormRow">
                  <TextField label="Work date" name="workDate" type="date" defaultValue={date()} required />
                  <SelectField label="Cost type" name="costType" defaultValue="regular">
                    <option value="regular">Regular</option><option value="overtime">Overtime</option><option value="contractor">Contractor</option>
                  </SelectField>
                </div>
                <div className="financeFormRow">
                  <TextField label="Hours" name="hours" type="number" min="0.01" max="24" step="0.25" required />
                  <TextField label="Hourly cost" name="hourlyCost" type="number" min="0" step="0.01" required />
                </div>
                <TextField label="Adjustment reason or import reference" name="notes" minLength={4} maxLength={1000} required placeholder="Explain this direct ledger adjustment" />
                <Button variant="primary" type="submit" disabled={pending}>Record adjustment</Button>
              </form>
            </section>
          </div>

          <div className="financeGrid financeGrid-secondary">
            <section className="financePanel">
              <div className="panelHeading"><div><p className="eyebrow">Organization setup</p><h2>Add supplier</h2></div></div>
              <form className="financeForm financeCompact" onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                act({
                  action: "create_vendor",
                  siteId,
                  name: String(form.get("name")),
                  vendorCode: String(form.get("vendorCode") || "") || undefined,
                  contactReference: String(form.get("contactReference") || "") || undefined,
                });
                event.currentTarget.reset();
              }}>
                <TextField label="Name" name="name" required maxLength={200} />
                <TextField label="Code" name="vendorCode" maxLength={80} />
                <TextField label="Contact reference" name="contactReference" maxLength={200} />
                <Button variant="secondary" type="submit" disabled={pending}>Add supplier</Button>
              </form>
            </section>

            <section className="financePanel">
              <div className="panelHeading"><div><p className="eyebrow">Organization setup</p><h2>Add inventory item</h2></div></div>
              <form className="financeForm financeCompact" onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                act({
                  action: "create_inventory_item",
                  siteId,
                  name: String(form.get("name")),
                  sku: String(form.get("sku") || "") || undefined,
                  category: String(form.get("category") || "") || undefined,
                  unitOfMeasure: String(form.get("unit")),
                  reorderLevel: Number(form.get("reorderLevel")),
                });
                event.currentTarget.reset();
              }}>
                <TextField label="Name" name="name" required maxLength={200} />
                <div className="financeFormRow">
                  <TextField label="SKU" name="sku" maxLength={80} />
                  <TextField label="Unit" name="unit" required maxLength={40} placeholder="case" />
                </div>
                <div className="financeFormRow">
                  <TextField label="Category" name="category" maxLength={100} />
                  <TextField label="Reorder level" name="reorderLevel" type="number" min="0" step="0.001" defaultValue="0" required />
                </div>
                <Button variant="secondary" type="submit" disabled={pending}>Add inventory item</Button>
              </form>
            </section>
          </div>
        </>
      ) : (
        <Alert tone="restricted">Read-only finance view. Director access is required to add or change financial records.</Alert>
      )}

      <section className="financePanel financeLedger" aria-labelledby="inventory-ledger-title">
        <div className="panelHeading"><div><p className="eyebrow">Recent site records</p><h2 id="inventory-ledger-title">Inventory ledger</h2></div></div>
        {workspace.inventory.length ? (
          <>
            <FilterBar
              searchLabel="Search inventory ledger"
              searchValue={inventoryFilter}
              onSearchChange={setInventoryFilter}
              resultCount={filteredInventory.length}
              onClear={() => setInventoryFilter("")}
            />
            <div className="financeTable">
              <div className={editable ? "financeTableHead financeTableHead-editable" : "financeTableHead"}><span>Item</span><span>Movement</span><span>Supplier</span><span>Quantity</span><span>Total</span>{editable ? <span>Actions</span> : null}</div>
              {filteredInventory.map((entry) => editingInventoryId === entry.id ? (
                <form key={entry.id} className="financeEditRow" onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  act({
                    action: "update_inventory",
                    id: entry.id,
                    siteId,
                    vendorId: String(form.get("vendorId") || "") || undefined,
                    inventoryItemId: String(form.get("inventoryItemId")),
                    transactionType: String(form.get("transactionType")) as "receipt" | "issue" | "adjustment" | "count",
                    quantity: Number(form.get("quantity")),
                    unitCost: Number(form.get("unitCost")),
                    occurredAt: entry.occurredAt,
                    notes: String(form.get("notes") || "") || undefined,
                  });
                  setEditingInventoryId(null);
                }}>
                  <label>Item<select name="inventoryItemId" required defaultValue={entry.itemId}>{workspace.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label>
                  <div className="financeFormRow">
                    <label>Movement<select name="transactionType" defaultValue={entry.type}><option value="receipt">Supplier receipt</option><option value="issue">Issued to site</option><option value="adjustment">Adjustment</option><option value="count">Stock count</option></select></label>
                    <label>Supplier<select name="vendorId" defaultValue={entry.vendorId ?? ""}><option value="">No supplier reference</option>{workspace.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
                    <label>Quantity<input name="quantity" type="number" min="0.001" step="0.001" defaultValue={entry.quantity} required /></label>
                    <label>Unit cost<input name="unitCost" type="number" min="0" step="0.01" defaultValue={entry.unitCost} required /></label>
                  </div>
                  <label>Note<input name="notes" maxLength={1000} defaultValue={entry.notes ?? ""} /></label>
                  <div className="financeRowActions">
                    <Button variant="primary" type="submit" disabled={pending}>Save</Button>
                    <Button variant="secondary" type="button" disabled={pending} onClick={() => setEditingInventoryId(null)}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <div key={entry.id} id={entry.id} className={editable ? "financeTableRow financeTableRow-editable" : "financeTableRow"}>
                  <strong>{entry.item}<small>{formatUtcTimestamp(entry.occurredAt)}</small></strong><span>{entry.type}</span><span>{entry.vendor ?? "—"}</span><span>{entry.quantity} {entry.unit}</span><span>{money.format(entry.totalCost)}</span>
                  {editable ? <div className="financeRowActions">
                    <Button variant="secondary" type="button" disabled={pending} onClick={() => setEditingInventoryId(entry.id)}>Edit</Button>
                    <Button variant="danger" type="button" disabled={pending} onClick={() => {
                      if (window.confirm(`Delete this ${entry.item} ${entry.type} of ${entry.quantity} ${entry.unit}? This is recorded in the finance audit trail.`)) {
                        act({ action: "delete_inventory", id: entry.id, siteId });
                      }
                    }}>Delete</Button>
                  </div> : null}
                </div>
              ))}
            </div>
          </>
        ) : <p className="recordNote">No inventory movements have been recorded.</p>}
      </section>

      <section className="financePanel financeLedger" aria-labelledby="labour-ledger-title">
        <div className="panelHeading"><div><p className="eyebrow">Recent site records</p><h2 id="labour-ledger-title">Labour ledger</h2></div></div>
        {workspace.labourRestricted ? (
          <p className="recordNote">Individual labour entries are restricted to Directors. The aggregate labour cost for this casino is in the site contribution summary above.</p>
        ) : workspace.labour.length ? (
          <>
            <FilterBar
              searchLabel="Search labour ledger"
              searchValue={labourFilter}
              onSearchChange={setLabourFilter}
              resultCount={filteredLabour.length}
              onClear={() => setLabourFilter("")}
            />
            <div className="financeTable">
              <div className={editable ? "financeTableHead financeTableHead-editable" : "financeTableHead"}><span>Worker</span><span>Date</span><span>Type</span><span>Hours</span><span>Total</span>{editable ? <span>Actions</span> : null}</div>
              {filteredLabour.map((entry) => editingLabourId === entry.id ? (
                <form key={entry.id} className="financeEditRow" onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  act({
                    action: "update_labour",
                    id: entry.id,
                    siteId,
                    workerId: String(form.get("workerId") || "") || undefined,
                    taskRunId: entry.taskRunId ?? undefined,
                    workDate: String(form.get("workDate")),
                    hours: Number(form.get("hours")),
                    hourlyCost: Number(form.get("hourlyCost")),
                    costType: String(form.get("costType")) as "regular" | "overtime" | "contractor",
                    notes: String(form.get("notes") || "") || undefined,
                  });
                  setEditingLabourId(null);
                }}>
                  <div className="financeFormRow">
                    <label>Worker<select name="workerId" defaultValue={entry.workerId ?? ""}><option value="">Unassigned labour</option>{workspace.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label>
                    <label>Work date<input name="workDate" type="date" defaultValue={entry.workDate} required /></label>
                    <label>Cost type<select name="costType" defaultValue={entry.type}><option value="regular">Regular</option><option value="overtime">Overtime</option><option value="contractor">Contractor</option></select></label>
                    <label>Hours<input name="hours" type="number" min="0.01" max="24" step="0.25" defaultValue={entry.hours} required /></label>
                    <label>Hourly cost<input name="hourlyCost" type="number" min="0" step="0.01" defaultValue={entry.hourlyCost} required /></label>
                  </div>
                  <label>Note<input name="notes" maxLength={1000} defaultValue={entry.notes ?? ""} /></label>
                  <div className="financeRowActions">
                    <Button variant="primary" type="submit" disabled={pending}>Save</Button>
                    <Button variant="secondary" type="button" disabled={pending} onClick={() => setEditingLabourId(null)}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <div key={entry.id} className={editable ? "financeTableRow financeTableRow-editable" : "financeTableRow"}>
                  <strong>{entry.worker ?? "Unassigned labour"}<small>{entry.timeEntryId ? "Approved time · immutable" : entry.notes ?? "Administrative adjustment"}</small></strong><span>{entry.workDate}</span><span>{entry.type}</span><span>{entry.hours}</span><span>{money.format(entry.totalCost)}</span>
                  {editable && !entry.timeEntryId ? <div className="financeRowActions">
                    <Button variant="secondary" type="button" disabled={pending} onClick={() => setEditingLabourId(entry.id)}>Edit</Button>
                    <Button variant="danger" type="button" disabled={pending} onClick={() => {
                      if (window.confirm(`Delete this ${entry.hours}h ${entry.type} labour entry for ${entry.workDate}? This is recorded in the finance audit trail.`)) {
                        act({ action: "delete_labour", id: entry.id, siteId });
                      }
                    }}>Delete</Button>
                  </div> : editable ? <span>Posted time</span> : null}
                </div>
              ))}
            </div>
          </>
        ) : <p className="recordNote">No labour cost entries have been recorded.</p>}
      </section>
    </div>
  );
}
