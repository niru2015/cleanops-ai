"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { performSupplyAction } from "@/app/supplies/actions";
import type { SupplyWorkspace } from "@/integrations/supplies/supabase-supplies";
import type { AccessSite, AppRole } from "@/services/access-context";

type DraftItem = { itemId:string;packCount:string;baseUnitsPerPack:string;pricePerPack:string;
  priceSource:"supplier_quote"|"catalogue"|"invoice"|"manual_estimate";priceReference:string };
const blankItem = ():DraftItem=>({itemId:"",packCount:"1",baseUnitsPerPack:"1",pricePerPack:"0",
  priceSource:"manual_estimate",priceReference:""});
const money = (value:number)=>new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(value);
const date = (value:string)=>new Date(value).toLocaleString("en-CA",{dateStyle:"medium",timeStyle:"short"});

export function SupplyWorkspaceView({workspace,sites,siteId,month,role,userId}:{
  workspace:SupplyWorkspace;sites:AccessSite[];siteId:string;month:string;role:AppRole;userId:string;
}) {
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  const [notice,setNotice]=useState<{ok:boolean;message:string}|null>(null);
  const [drafts,setDrafts]=useState<DraftItem[]>([blankItem()]);
  const [movementKind,setMovementKind]=useState("issue");
  const keys=useRef<Record<string,string>>({});
  const requestForm=useRef<HTMLFormElement>(null);
  const approver=["area_manager","operations_manager","organization_administrator"].includes(role);
  const director=role==="organization_administrator";
  const key=(name:string)=>keys.current[name]??=crypto.randomUUID();
  const run=(name:string,input:unknown)=>startTransition(async()=>{
    const result=await performSupplyAction(input);
    setNotice(result);
    if(result.ok){delete keys.current[name];if(name==="submit"){setDrafts([blankItem()]);requestForm.current?.reset();}router.refresh();}
  });
  const changeDraft=(index:number,field:keyof DraftItem,value:string)=>setDrafts(previous=>previous.map((entry,i)=>
    i===index?{...entry,[field]:value}:entry));
  const itemName=(id:string)=>workspace.options.find(option=>option.id===id)?.name??"Inventory item";
  return <div>
    <p className="eyebrow">Operational supplies · {sites.find(site=>site.id===siteId)?.name}</p>
    <h1>Supply requests and stock</h1>
    <p className="recordNote">Synthetic demo records. Requested and approved amounts are estimates. A receipt changes stock; only a separately approved expense posting contributes an operational supply cost. Accounting recognition and reconciliation remain in Finance. Issued stock is not labelled consumption.</p>
    <nav aria-label="Supply site selection"><p>{sites.map(site=><a key={site.id}
      className={site.id===siteId?"reviewButton reviewButton-primary":"reviewButton reviewButton-secondary"}
      href={`/supplies?siteId=${encodeURIComponent(site.id)}&month=${encodeURIComponent(month)}`}>{site.name}</a>)}</p></nav>
    {notice?<p role="status" aria-live="polite" className={notice.ok?"recordNote":"importIssue importIssueError"}>{notice.message}</p>:null}

    <section className="financePanel" aria-labelledby="supply-request-title">
      <h2 id="supply-request-title">Request supplies</h2>
      <p className="recordNote">Each item records pack count, base-unit conversion and where its price came from. A manager must approve before ordering. A partial receipt may record only the remaining ordered quantity; an over-receipt is refused.</p>
      <form ref={requestForm} className="financeForm" onSubmit={event=>{
        event.preventDefault();const form=new FormData(event.currentTarget);
        run("submit",{kind:"submit",siteId,purpose:String(form.get("purpose")),requestKey:key("submit"),
          items:drafts.map(entry=>({itemId:entry.itemId,packCount:Number(entry.packCount),
            baseUnitsPerPack:Number(entry.baseUnitsPerPack),pricePerPack:Number(entry.pricePerPack),
            priceSource:entry.priceSource,priceReference:entry.priceReference||undefined}))});
      }}>
        <label>Purpose<input name="purpose" required minLength={3} maxLength={500}/></label>
        {drafts.map((entry,index)=><fieldset key={index}><legend>Item {index+1}</legend>
          <label>Catalogue item<select required value={entry.itemId} onChange={event=>changeDraft(index,"itemId",event.target.value)}>
            <option value="">Select an item</option>{workspace.options.map(option=><option key={option.id} value={option.id}>
              {option.name} · {option.sku??"no SKU"} · base unit {option.unit_of_measure}</option>)}</select></label>
          <label>Packs requested<input type="number" min="0.001" step="0.001" required value={entry.packCount}
            onChange={event=>changeDraft(index,"packCount",event.target.value)}/></label>
          <label>Base units per pack<input type="number" min="0.001" step="0.001" required value={entry.baseUnitsPerPack}
            onChange={event=>changeDraft(index,"baseUnitsPerPack",event.target.value)}/></label>
          <label>CAD per pack<input type="number" min="0" step="0.01" required value={entry.pricePerPack}
            onChange={event=>changeDraft(index,"pricePerPack",event.target.value)}/></label>
          <label>Price source<select value={entry.priceSource} onChange={event=>changeDraft(index,"priceSource",event.target.value)}>
            <option value="manual_estimate">Manual estimate</option><option value="supplier_quote">Supplier quote</option>
            <option value="catalogue">Catalogue</option><option value="invoice">Invoice</option></select></label>
          <label>Price reference<input maxLength={200} required={entry.priceSource!=="manual_estimate"}
            value={entry.priceReference} onChange={event=>changeDraft(index,"priceReference",event.target.value)}/></label>
          <p className="recordNote">{Number(entry.packCount||0)*Number(entry.baseUnitsPerPack||0)} base units · requested estimate {money(Number(entry.packCount||0)*Number(entry.pricePerPack||0))}</p>
          {drafts.length>1?<button type="button" className="reviewButton reviewButton-secondary"
            onClick={()=>setDrafts(previous=>previous.filter((_,i)=>i!==index))}>Remove item</button>:null}
        </fieldset>)}
        <button type="button" className="reviewButton reviewButton-secondary" disabled={drafts.length>=20}
          onClick={()=>setDrafts(previous=>[...previous,blankItem()])}>Add item</button>
        <button type="submit" className="reviewButton reviewButton-primary" disabled={pending||!workspace.options.length}>Submit request</button>
      </form>
    </section>

    <section className="financePanel" aria-labelledby="supply-requests-title"><h2 id="supply-requests-title">Requests and decisions</h2>
      {workspace.requests.length?workspace.requests.map(request=>{
        const items=workspace.items.filter(item=>item.request_id===request.id);
        const canChange=request.requested_by===userId||approver;
        return <article key={request.id} className="financePanel">
          <h3>{request.purpose} · {request.state.replaceAll("_"," ")}</h3>
          <p className="recordNote">{date(request.created_at)} · version {request.version} · contract supplies: {request.supply_responsibility}
            {request.order_reference?` · order ${request.order_reference}`:""}</p>
          <p>Requested estimate {money(items.reduce((sum,item)=>sum+item.requested_amount,0))} · approved expense posting: separate Director action.</p>
          {items.map(item=>{
            const remaining=item.base_quantity-item.received_base_quantity;
            return <div key={item.id}>
              <p><strong>{itemName(item.inventory_item_id)}</strong>: {item.pack_count} packs × {item.base_units_per_pack} base units = {item.base_quantity} requested; {["approved","ordered","partially_received","received"].includes(request.state)?item.base_quantity:0} approved; {["ordered","partially_received","received"].includes(request.state)?item.base_quantity:0} ordered; {item.received_base_quantity} received. {money(item.price_per_pack)} per pack from {item.price_source}{item.price_reference?` (${item.price_reference})`:""}.</p>
              {canChange&&["requested","approved"].includes(request.state)?<form className="financeForm" onSubmit={event=>{
                event.preventDefault();const form=new FormData(event.currentTarget);
                run(`revise:${item.id}`,{kind:"revise",itemId:item.id,item:{itemId:String(form.get("itemId")),
                  packCount:Number(form.get("packCount")),baseUnitsPerPack:Number(form.get("factor")),
                  pricePerPack:Number(form.get("price")),priceSource:String(form.get("source")),
                  priceReference:String(form.get("reference"))}});
              }}><details><summary>Revise item · resets approval</summary>
                <label>Item<select name="itemId" defaultValue={item.inventory_item_id}>{workspace.options.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
                <label>Packs<input name="packCount" type="number" min="0.001" step="0.001" defaultValue={item.pack_count} required/></label>
                <label>Base units per pack<input name="factor" type="number" min="0.001" step="0.001" defaultValue={item.base_units_per_pack} required/></label>
                <label>CAD per pack<input name="price" type="number" min="0" step="0.01" defaultValue={item.price_per_pack} required/></label>
                <label>Price source<select name="source" defaultValue={item.price_source}><option value="manual_estimate">Manual estimate</option><option value="supplier_quote">Supplier quote</option><option value="catalogue">Catalogue</option><option value="invoice">Invoice</option></select></label>
                <label>Price reference<input name="reference" defaultValue={item.price_reference??""}/></label>
                <button type="submit" disabled={pending} className="reviewButton reviewButton-secondary">Save revision</button>
              </details></form>:null}
              {["ordered","partially_received"].includes(request.state)&&remaining>0?<form className="financeForm" onSubmit={event=>{
                event.preventDefault();const form=new FormData(event.currentTarget);
                run(`receipt:${item.id}`,{kind:"receive",requestItemId:item.id,baseQuantity:Number(form.get("quantity")),receiptKey:key(`receipt:${item.id}`)});
              }}><label>Receive base units, up to {remaining}<input name="quantity" type="number" min="0.001" max={remaining} step="0.001" required/></label>
                <button type="submit" disabled={pending} className="reviewButton reviewButton-primary">Record receipt</button></form>:null}
            </div>;
          })}
          {approver&&request.state==="requested"?<form className="financeForm" onSubmit={event=>{
            event.preventDefault();const form=new FormData(event.currentTarget);
            run(`decision:${request.id}`,{kind:"decide",requestId:request.id,decision:String(form.get("decision")),reason:String(form.get("reason"))});
          }}><label>Decision<select name="decision"><option value="approved">Approve</option><option value="rejected">Reject</option></select></label>
            <label>Reason<input name="reason" maxLength={500}/></label>
            <button type="submit" disabled={pending} className="reviewButton reviewButton-primary">Record decision</button></form>:null}
          {approver&&request.state==="approved"?<form className="financeForm" onSubmit={event=>{
            event.preventDefault();const form=new FormData(event.currentTarget);
            run(`order:${request.id}`,{kind:"order",requestId:request.id,orderReference:String(form.get("reference"))});
          }}><label>Order reference<input name="reference" minLength={3} maxLength={160} required/></label>
            <button type="submit" disabled={pending} className="reviewButton reviewButton-primary">Mark ordered</button></form>:null}
          {canChange&&["requested","approved","ordered"].includes(request.state)?<form className="financeForm" onSubmit={event=>{
            event.preventDefault();const form=new FormData(event.currentTarget);
            run(`cancel:${request.id}`,{kind:"cancel",requestId:request.id,reason:String(form.get("reason"))});
          }}><label>Cancellation reason<input name="reason" minLength={3} maxLength={500} required/></label>
            <button type="submit" disabled={pending} className="reviewButton reviewButton-secondary">Cancel request</button></form>:null}
          <details><summary>Audit trail</summary><ol>{workspace.events.filter(event=>event.request_id===request.id)
            .map(event=><li key={event.id}>{date(event.created_at)} · {event.event_kind}</li>)}</ol></details>
        </article>;
      }):<p>No supply requests for this site yet.</p>}
    </section>

    <section className="financePanel" aria-labelledby="stock-title"><h2 id="stock-title">Site stock</h2>
      <p className="recordNote">On hand = opening + receipts + transfers in + returns + positive count adjustments − issues − transfers out − negative count adjustments. Issues and transfers cannot make stock negative. N/A means a legacy movement needs review. {workspace.history.length?`Latest recorded movement: ${date(workspace.history[0].occurred_at)}.`:"No stock movement has been recorded for this site."} Recent history shows at most 100 movements.</p>
      <div style={{overflowX:"auto"}}><table><thead><tr><th scope="col">Item</th><th scope="col">Base unit</th><th scope="col">On hand</th></tr></thead><tbody>
        {workspace.stock.map(stock=><tr key={stock.inventory_item_id}><th scope="row">{stock.item_name}</th><td>{stock.unit_of_measure}</td><td>{stock.on_hand??"N/A"}</td></tr>)}
      </tbody></table></div>
      <form className="financeForm" onSubmit={event=>{
        event.preventDefault();const form=new FormData(event.currentTarget);
        run("movement",{kind:"movement",siteId,itemId:String(form.get("item")),movementKind:String(form.get("kind")),
          quantity:Number(form.get("quantity")),key:key("movement"),reason:String(form.get("reason")),
          targetSiteId:String(form.get("target"))||undefined});
      }}><label>Stock action<select name="kind" value={movementKind} onChange={event=>setMovementKind(event.target.value)}>
        <option value="opening">Opening balance</option><option value="issue">Issue to site</option><option value="return">Return to stock</option>
        <option value="transfer">Transfer to another site</option><option value="count">Count and adjust</option></select></label>
        <label>Item<select name="item" required><option value="">Select</option>{workspace.options.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        <label>{movementKind==="count"?"Counted base units":"Base units"}<input name="quantity" type="number" min={movementKind==="count"?"0":"0.001"} step="0.001" required/></label>
        {movementKind==="transfer"?<label>Target site<select name="target" required><option value="">Select</option>{sites.filter(site=>site.id!==siteId).map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label>:null}
        <label>Reason<input name="reason" minLength={3} maxLength={500} required/></label>
        <button type="submit" disabled={pending} className="reviewButton reviewButton-primary">Record stock action</button>
      </form>
      <details><summary>Recent stock history</summary><ol>{workspace.history.map(entry=><li key={entry.id}>
        {date(entry.occurred_at)} · {itemName(entry.inventory_item_id)} · {entry.transaction_type.replaceAll("_"," ")} {entry.quantity} · {entry.notes??"no note"}</li>)}</ol></details>
    </section>

    {approver?<section className="financePanel" aria-labelledby="comparison-title"><h2 id="comparison-title">Site and item comparison</h2>
      <form method="get" className="financeForm"><input type="hidden" name="siteId" value={siteId}/>
        <label>Month<input name="month" type="month" defaultValue={month} required/></label><button className="reviewButton reviewButton-secondary" type="submit">Compare</button></form>
      <p className="recordNote">Live site records. Requested/currently approved estimates use the request date; received units use the receipt date; linked approved expense uses the claim date. Accounting reconciliation remains in Finance. The denominator is approved labour hours in the selected month. N/A is not zero.</p>
      <div style={{overflowX:"auto"}}><table><thead><tr><th scope="col">Site</th><th scope="col">Item</th><th scope="col">Requested</th><th scope="col">Approved</th><th scope="col">Received units</th><th scope="col">Approved expense</th><th scope="col">Approved hours</th><th scope="col">Expense per hour</th></tr></thead><tbody>
        {workspace.comparison.map(row=><tr key={`${row.site_id}:${row.inventory_item_id}`}><th scope="row">{sites.find(site=>site.id===row.site_id)?.name??"Assigned site"}</th><td>{row.item_name}</td>
          <td>{money(row.requested_amount)}</td><td>{money(row.approved_amount)}</td><td>{row.received_base_quantity}</td>
          <td>{money(row.approved_expense)}</td><td>{row.approved_labour_hours??"N/A"}</td><td>{row.expense_per_approved_hour===null?"N/A":money(row.expense_per_approved_hour)}</td></tr>)}
      </tbody></table></div>
      {!workspace.comparison.length?<p>No requests in this month for assigned sites.</p>:null}
    </section>:null}

    {director?<section className="financePanel" aria-labelledby="expense-link-title"><h2 id="expense-link-title">Link approved supply expense</h2>
      <p className="recordNote">The link identifies the financial source for a receipt. It does not create another posting or supplier payment.</p>
      {workspace.receipts.filter(receipt=>!workspace.links.some(link=>link.receipt_id===receipt.id)).map(receipt=><form key={receipt.id} className="financeForm" onSubmit={event=>{
        event.preventDefault();const form=new FormData(event.currentTarget);
        run(`link:${receipt.id}`,{kind:"link_expense",receiptId:receipt.id,expensePostingId:String(form.get("posting"))});
      }}><label>Receipt {receipt.id.slice(0,8)} · {receipt.base_quantity} base units<select name="posting" required><option value="">Select approved posting</option>
        {workspace.expenses.filter(expense=>!workspace.links.some(link=>link.expense_posting_id===expense.id)).map(expense=><option key={expense.id} value={expense.id}>
          {date(expense.posted_at)} · {expense.currency} {expense.amount.toFixed(2)} · {expense.id.slice(0,8)}</option>)}</select></label>
        <button type="submit" disabled={pending} className="reviewButton reviewButton-secondary">Link source</button></form>)}
      {!workspace.receipts.length?<p>No received supply orders to link.</p>:null}
    </section>:null}
  </div>;
}
