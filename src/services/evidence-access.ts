import type { EvidenceObjectStorage } from "@/services/evidence-repository";

export interface EvidenceAccessRepository {
  getAuthorizedPath(evidenceId: string): Promise<string | null>;
}

export async function issueEvidenceSignedUrl(
  access: EvidenceAccessRepository,
  storage: EvidenceObjectStorage,
  evidenceId: string,
) {
  const path = await access.getAuthorizedPath(evidenceId);
  if (!path) return null;
  return {
    signedUrl: await storage.createSignedUrl(path, 60),
    expiresIn: 60 as const,
  };
}
