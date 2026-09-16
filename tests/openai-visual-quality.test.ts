import { describe, expect, it } from "vitest";
import { getLiveQualityConfig, OpenAIQualityError, OpenAIVisualQualityService } from "@/services/openai-visual-quality";

const input = {
  taskRunId: "81000000-0000-4000-8000-000000000001",
  submissionRevision: 1,
  beforeEvidenceId: "e2000000-0000-4000-8000-000000000001",
  afterEvidenceId: "e2000000-0000-4000-8000-000000000002",
  criterionIds: ["mirror.streak_free"],
};
const derivatives = [
  { role: "before" as const, dataUrl: "data:image/png;base64,AA==", byteSize: 1 },
  { role: "after" as const, dataUrl: "data:image/png;base64,AA==", byteSize: 1 },
];

function response(body: unknown, status = 200) {
  return async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("CLEAN-008 OpenAI visual quality adapter", () => {
  it("does not enable live calls without an explicit cap and key", () => {
    expect(getLiveQualityConfig({ OPENAI_QUALITY_LIVE_ENABLED: "true" }).reason).toBe("missing_key");
    expect(getLiveQualityConfig({ OPENAI_QUALITY_LIVE_ENABLED: "true", OPENAI_API_KEY: "key" }).reason).toBe("missing_attempt_cap");
    expect(getLiveQualityConfig({ OPENAI_QUALITY_LIVE_ENABLED: "true", OPENAI_API_KEY: "key", OPENAI_QUALITY_ATTEMPT_CENTS: "2" })).toMatchObject({ enabled: true, model: "gpt-5-mini", attemptCapCents: 2 });
  });

  it("uses strict structured output and attaches only trusted evidence IDs", async () => {
    let request: unknown;
    const service = new OpenAIVisualQualityService("test-key", "gpt-5-mini", async (_url, init) => {
      request = JSON.parse(String(init?.body));
      return response({
        id: "resp_fixture", status: "completed", usage: { input_tokens: 12, output_tokens: 9 },
        output: [{ content: [{ type: "output_text", text: JSON.stringify({
          status: "assessed", score: 86, confidence: 0.82,
          findings: [{ criterion_id: "mirror.streak_free", observation: "A possible streak remains.", severity: "medium", evidence_role: "after" }],
          limitations: ["Synthetic fixture."],
        }) }] }],
      })();
    });

    const result = await service.assessWithMetadata(input, derivatives);
    expect(result.assessment.findings[0]?.evidence_ids).toEqual([input.afterEvidenceId]);
    expect(result.metadata.usage).toEqual({ input_tokens: 12, output_tokens: 9 });
    expect(request).toMatchObject({ store: false, max_output_tokens: 1000, text: { format: { type: "json_schema", strict: true, name: "quality_v1" } } });
  });

  it("rejects a refusal or an invalid provider object before it becomes an assessment", async () => {
    const refused = new OpenAIVisualQualityService("test-key", "gpt-5-mini", response({ status: "completed", output: [{ content: [{ type: "refusal", refusal: "cannot assess" }] }] }));
    await expect(refused.assessWithMetadata(input, derivatives)).rejects.toMatchObject<Partial<OpenAIQualityError>>({ code: "refused" });
    const invalid = new OpenAIVisualQualityService("test-key", "gpt-5-mini", response({ status: "completed", output: [{ content: [{ type: "output_text", text: '{"status":"assessed","score":86}' }] }] }));
    await expect(invalid.assessWithMetadata(input, derivatives)).rejects.toMatchObject<Partial<OpenAIQualityError>>({ code: "invalid_output" });
  });

  it("will not send a provider request without approved redacted derivatives", async () => {
    const service = new OpenAIVisualQualityService("test-key", "gpt-5-mini", response({}));
    await expect(service.assess(input)).rejects.toMatchObject<Partial<OpenAIQualityError>>({ code: "invalid_output" });
  });
});
