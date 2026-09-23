import { createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(value).digest();

export function stableUuid(scenarioId, entityPath) {
  const bytes = Buffer.from(hash(`cleanops-scenario-v1:${scenarioId}:${entityPath}`).subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function seededRng(seed, scenarioId) {
  let state = hash(`${scenarioId}:${seed}`).readUInt32BE(0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}
