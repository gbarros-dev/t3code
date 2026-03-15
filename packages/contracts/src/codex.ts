import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

export const CodexCustomPrompt = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  argumentHint: Schema.optional(TrimmedNonEmptyString),
  content: Schema.String,
});
export type CodexCustomPrompt = typeof CodexCustomPrompt.Type;

export const CodexListCustomPromptsInput = Schema.Struct({
  homePath: Schema.optional(TrimmedNonEmptyString),
  projectPath: Schema.optional(TrimmedNonEmptyString),
});
export type CodexListCustomPromptsInput = typeof CodexListCustomPromptsInput.Type;

export const CodexListCustomPromptsResult = Schema.Struct({
  prompts: Schema.Array(CodexCustomPrompt),
});
export type CodexListCustomPromptsResult = typeof CodexListCustomPromptsResult.Type;
