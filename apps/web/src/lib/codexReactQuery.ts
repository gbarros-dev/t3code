import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

export const codexQueryKeys = {
  all: ["codex"] as const,
  customPrompts: (projectId: string | null, projectPath: string | null, homePath: string | null) =>
    ["codex", "custom-prompts", projectId, projectPath, homePath] as const,
};

export function codexCustomPromptsQueryOptions(input: {
  enabled: boolean;
  projectId: string | null;
  projectPath: string | null;
  homePath: string | null;
}) {
  return queryOptions({
    queryKey: codexQueryKeys.customPrompts(input.projectId, input.projectPath, input.homePath),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.codex.listCustomPrompts({
        ...(input.homePath ? { homePath: input.homePath } : {}),
        ...(input.projectPath ? { projectPath: input.projectPath } : {}),
      });
    },
    enabled: input.enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
