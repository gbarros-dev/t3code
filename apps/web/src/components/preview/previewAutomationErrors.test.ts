import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { PreviewAutomationOperationError } from "./previewAutomationErrors";

describe("PreviewAutomationOperationError", () => {
  const context = {
    requestId: "request-1",
    operation: "click" as const,
    environmentId: EnvironmentId.make("environment-1"),
    threadId: ThreadId.make("thread-1"),
    tabId: "tab-1",
  };

  it("maps typed not-found failures to a visible/disabled/ambiguous reason", () => {
    const hidden = PreviewAutomationOperationError.fromCause({
      ...context,
      cause: {
        _tag: "PreviewAutomationTargetNotFoundError",
        failureKind: "hidden",
      },
    });
    const disabled = PreviewAutomationOperationError.fromCause({
      ...context,
      cause: {
        _tag: "PreviewAutomationTargetNotFoundError",
        failureKind: "disabled",
      },
    });
    const ambiguous = PreviewAutomationOperationError.fromCause({
      ...context,
      cause: {
        _tag: "PreviewAutomationTargetNotFoundError",
        failureKind: "ambiguous",
        matchCount: 3,
      },
    });
    expect(hidden.message).toContain("not visible");
    expect(disabled.message).toContain("disabled");
    expect(ambiguous.message).toContain("matched 3 elements");
    expect(hidden.message).not.toContain("secret");
    expect(disabled.message).not.toContain("secret");
    expect(ambiguous.message).not.toContain("secret");
  });
});
