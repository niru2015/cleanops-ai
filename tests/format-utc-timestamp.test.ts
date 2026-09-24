import { describe, expect, it } from "vitest";
import { formatUtcTimestamp } from "@/lib/format-utc-timestamp";

describe("finance timestamps", () => {
  it("shows the same UTC instant for offsets on either side of midnight", () => {
    expect(formatUtcTimestamp("2026-06-01T12:00:00Z")).toBe("2026-06-01 12:00 UTC");
    expect(formatUtcTimestamp("2026-06-01T05:00:00-07:00")).toBe("2026-06-01 12:00 UTC");
  });
});
