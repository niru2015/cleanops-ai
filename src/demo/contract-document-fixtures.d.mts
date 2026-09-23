export function simpleContractPdf(lines: string[]): Buffer;
export function contractSourceLines(contract: {
  identity: { name: string };
  versions: Array<{ effective_from: string }>;
  terms: Array<{ amount: string }>;
  staffing: Array<{ required_positions: number }>;
  obligations: Array<{ name: string }>;
}, amended?: boolean): string[];
export function scannedContractPng(lines: string[]): Promise<Buffer>;
export function hashFixture(bytes: Uint8Array): string;
