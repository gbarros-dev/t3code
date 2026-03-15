import { describe, expect, it } from "vitest";

import type { CodexCustomPrompt } from "@t3tools/contracts";
import {
  buildCustomPromptInsertText,
  expandCustomPromptInvocation,
  findNextCustomPromptArgCursor,
  getCustomPromptArgumentHint,
} from "./codex";

function makePrompt(
  input: Partial<CodexCustomPrompt> & Pick<CodexCustomPrompt, "name" | "content">,
): CodexCustomPrompt {
  return {
    name: input.name,
    content: input.content,
    ...(input.description ? { description: input.description } : {}),
    ...(input.argumentHint ? { argumentHint: input.argumentHint } : {}),
  };
}

describe("getCustomPromptArgumentHint", () => {
  it("prefers explicit argument hints", () => {
    expect(
      getCustomPromptArgumentHint(
        makePrompt({
          name: "review",
          argumentHint: "FILE= LEVEL=",
          content: "Review $FILE at $LEVEL",
        }),
      ),
    ).toBe("FILE= LEVEL=");
  });

  it("infers named argument hints from placeholders", () => {
    expect(
      getCustomPromptArgumentHint(
        makePrompt({
          name: "review",
          content: "Review $FILE at $LEVEL",
        }),
      ),
    ).toBe("FILE= LEVEL=");
  });

  it("returns [args] for positional prompts", () => {
    expect(
      getCustomPromptArgumentHint(
        makePrompt({
          name: "summarize",
          content: "Summarize $1 and $ARGUMENTS",
        }),
      ),
    ).toBe("[args]");
  });
});

describe("buildCustomPromptInsertText", () => {
  it("builds prompt scaffolding and targets the first argument value", () => {
    expect(
      buildCustomPromptInsertText(
        makePrompt({
          name: "review",
          content: "Review $FILE with $LEVEL",
        }),
      ),
    ).toEqual({
      text: '/prompts:review FILE="" LEVEL=""',
      cursorOffset: '/prompts:review FILE="'.length,
    });
  });
});

describe("expandCustomPromptInvocation", () => {
  it("expands named placeholders", () => {
    const prompt = makePrompt({
      name: "review",
      content: "Review $FILE with priority $LEVEL",
    });
    expect(
      expandCustomPromptInvocation('/prompts:review FILE="src/app.ts" LEVEL=high', [prompt]),
    ).toEqual({
      expanded: "Review src/app.ts with priority high",
    });
  });

  it("expands positional placeholders and $ARGUMENTS", () => {
    const prompt = makePrompt({
      name: "summarize",
      content: "Summarize $1 using $2. Extra: $ARGUMENTS",
    });
    expect(expandCustomPromptInvocation("/prompts:summarize repo quick detail", [prompt])).toEqual({
      expanded: "Summarize repo using quick. Extra: repo quick detail",
    });
  });

  it("returns a parse error for malformed named arguments", () => {
    const prompt = makePrompt({
      name: "review",
      content: "Review $FILE",
    });
    expect(expandCustomPromptInvocation("/prompts:review src/app.ts", [prompt])).toEqual({
      error:
        "Could not parse /prompts:review: expected key=value but found 'src/app.ts'. Wrap values in double quotes if they contain spaces.",
    });
  });

  it("returns a missing arg error for incomplete named arguments", () => {
    const prompt = makePrompt({
      name: "review",
      content: "Review $FILE with $LEVEL",
    });
    expect(expandCustomPromptInvocation('/prompts:review FILE="src/app.ts"', [prompt])).toEqual({
      error:
        "Missing required args for /prompts:review: LEVEL. Provide as key=value (quote values with spaces).",
    });
  });

  it("ignores non-prompt slash commands", () => {
    const prompt = makePrompt({
      name: "review",
      content: "Review $FILE",
    });
    expect(expandCustomPromptInvocation("/plan", [prompt])).toBeNull();
  });
});

describe("findNextCustomPromptArgCursor", () => {
  it("jumps across generated prompt argument placeholders", () => {
    const text = '/prompts:review FILE="" LEVEL=""';
    const firstCursor = '/prompts:review FILE="'.length;
    const secondCursor = '/prompts:review FILE="" LEVEL="'.length;

    expect(findNextCustomPromptArgCursor(text, firstCursor)).toBe(secondCursor);
    expect(findNextCustomPromptArgCursor(text, secondCursor)).toBeNull();
  });
});
