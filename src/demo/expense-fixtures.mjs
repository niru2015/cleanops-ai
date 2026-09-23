import sharp from "sharp";
import { createHash } from "node:crypto";

export function expenseMessage(item,siteName){
  return `Expense: ${item.category.replaceAll("_"," ")}; Vendor: ${item.vendor}; Date: ${item.date}; Total: CAD $${(item.cents/100).toFixed(2)}; Payment: ${item.paymentMethod.replaceAll("_"," ")}; Site: ${siteName};${item.projectReference?` Project: ${item.projectReference};`:""} Synthetic demo only.`;
}
export async function syntheticReceipt(item,siteName){
  const escape=value=>String(value).replaceAll("&","&amp;").replaceAll("<","&lt;");
  const lines=["SYNTHETIC DEMONSTRATION RECEIPT",`Vendor: ${item.vendor}`,
    `Date: ${item.date}`,`Site: ${siteName}`,`Category: ${item.category}`,
    `Total: CAD $${(item.cents/100).toFixed(2)}`,"No real customer or payment data"];
  const text=lines.map((line,index)=>`<text x="48" y="${75+index*44}" font-family="Arial" font-size="25">${escape(line)}</text>`).join("");
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="500"><rect width="100%" height="100%" fill="white"/>${text}</svg>`)).png().toBuffer();
}
export function receiptSha(bytes){return createHash("sha256").update(bytes).digest("hex");}
