import { describe, expect, it } from "vitest";

import { codexCustomPromptsQueryOptions, codexQueryKeys } from "./codexReactQuery";

describe("codexQueryKeys.customPrompts", () => {
  it("scopes prompt cache keys by project path and Codex home path", () => {
    expect(codexQueryKeys.customPrompts("project-a", "/repo/a", "/home/a")).not.toEqual(
      codexQueryKeys.customPrompts("project-b", "/repo/a", "/home/a"),
    );
    expect(codexQueryKeys.customPrompts("project-a", "/repo/a", "/home/a")).not.toEqual(
      codexQueryKeys.customPrompts("project-a", "/repo/b", "/home/a"),
    );
    expect(codexQueryKeys.customPrompts("project-a", "/repo/a", "/home/a")).not.toEqual(
      codexQueryKeys.customPrompts("project-a", "/repo/a", "/home/b"),
    );
  });
});

describe("codexCustomPromptsQueryOptions", () => {
  it("attaches the project-scoped cache key", () => {
    const options = codexCustomPromptsQueryOptions({
      enabled: true,
      projectId: "project-a",
      projectPath: "/repo/project-a",
      homePath: "/home/a",
    });

    expect(options.queryKey).toEqual(
      codexQueryKeys.customPrompts("project-a", "/repo/project-a", "/home/a"),
    );
  });
});
