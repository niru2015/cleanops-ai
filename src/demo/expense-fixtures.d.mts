export type SyntheticExpense = {
  vendor: string;
  date: string;
  category: string;
  cents: number;
  paymentMethod?: string;
  projectReference?: string;
};

export function expenseMessage(item: SyntheticExpense & { paymentMethod: string }, siteName: string): string;
export function syntheticReceipt(item: SyntheticExpense, siteName: string): Promise<Buffer>;
export function receiptSha(bytes: Buffer | Uint8Array): string;
