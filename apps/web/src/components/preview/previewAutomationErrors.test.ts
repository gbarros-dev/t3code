import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  confirmPreviewAutomationClickTarget,
  PreviewAutomationTargetLookupHostError,
} from "./previewAutomationErrors";

describe("confirmPreviewAutomationClickTarget", () => {
  const context = {
    requestId: "request-1",
    operation: "click" as const,
    environmentId: EnvironmentId.make("environment-1"),
    threadId: ThreadId.make("thread-1"),
    tabId: "tab-1",
  };

  const lookupError = (
    result:
      | { readonly _tag: "NotSent"; readonly reason: "target-missing" }
      | { readonly _tag: "NotSent"; readonly reason: "target-hidden" }
      | { readonly _tag: "NotSent"; readonly reason: "target-disabled" }
      | {
          readonly _tag: "NotSent";
          readonly reason: "target-ambiguous";
          readonly matchCount: number;
        },
  ) => {
    try {
      confirmPreviewAutomationClickTarget(result, context);
      throw new Error("Expected click target confirmation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PreviewAutomationTargetLookupHostError);
      return error as PreviewAutomationTargetLookupHostError;
    }
  };

  it("maps typed IPC outcomes to visible, disabled, ambiguous, and missing reasons", () => {
    const hidden = lookupError({ _tag: "NotSent", reason: "target-hidden" });
    const disabled = lookupError({ _tag: "NotSent", reason: "target-disabled" });
    const ambiguous = lookupError({
      _tag: "NotSent",
      reason: "target-ambiguous",
      matchCount: 3,
    });
    const missing = lookupError({ _tag: "NotSent", reason: "target-missing" });

    expect(hidden.message).toContain("not visible");
    expect(disabled.message).toContain("disabled");
    expect(ambiguous.message).toContain("matched 3 elements");
    expect(missing.message).toContain("not found");
    expect(hidden.message).not.toContain("secret");
    expect(disabled.message).not.toContain("secret");
    expect(ambiguous.message).not.toContain("secret");
  });
});
