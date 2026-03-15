import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { listCodexCustomPrompts, resolveCodexPromptHomePath } from "./codexCatalog";

const tempDirs = new Set<string>();
const originalCodexHome = process.env.CODEX_HOME;

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.add(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
  if (typeof originalCodexHome === "string") {
    process.env.CODEX_HOME = originalCodexHome;
  } else {
    delete process.env.CODEX_HOME;
  }
  vi.restoreAllMocks();
});

describe("resolveCodexPromptHomePath", () => {
  it("prefers the explicit homePath input", () => {
    process.env.CODEX_HOME = "/env/codex-home";
    expect(resolveCodexPromptHomePath({ homePath: "/custom/home" })).toBe(
      path.resolve("/custom/home"),
    );
  });

  it("falls back to CODEX_HOME and then ~/.codex", () => {
    process.env.CODEX_HOME = "/env/codex-home";
    expect(resolveCodexPromptHomePath()).toBe(path.resolve("/env/codex-home"));

    delete process.env.CODEX_HOME;
    vi.spyOn(os, "homedir").mockReturnValue("/Users/tester");
    expect(resolveCodexPromptHomePath()).toBe(path.resolve("/Users/tester/.codex"));
  });
});

describe("listCodexCustomPrompts", () => {
  it("discovers top-level markdown prompts, parses frontmatter, and sorts by name", async () => {
    const codexHome = makeTempDir("t3code-codex-prompts-");
    const promptsDir = path.join(codexHome, "prompts");
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(promptsDir, "beta.md"),
      ["---", "description: Beta prompt", "argument-hint: FILE=", "---", "Review $FILE"].join("\n"),
      "utf8",
    );
    fs.writeFileSync(path.join(promptsDir, "alpha.md"), "Summarize $1", "utf8");
    fs.mkdirSync(path.join(promptsDir, "nested"), { recursive: true });
    fs.writeFileSync(path.join(promptsDir, "nested", "ignored.md"), "Ignore me", "utf8");

    await expect(listCodexCustomPrompts({ homePath: codexHome })).resolves.toEqual({
      prompts: [
        {
          name: "alpha",
          content: "Summarize $1",
        },
        {
          name: "beta",
          description: "Beta prompt",
          argumentHint: "FILE=",
          content: "Review $FILE",
        },
      ],
    });
  });

  it("loads project-local .codex/prompts and prefers them over global prompts", async () => {
    const projectRoot = makeTempDir("t3code-project-prompts-");
    const projectPromptsDir = path.join(projectRoot, ".codex", "prompts");
    fs.mkdirSync(projectPromptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectPromptsDir, "review.md"),
      ["---", "description: Project review prompt", "---", "Project review $FILE"].join("\n"),
      "utf8",
    );

    const codexHome = makeTempDir("t3code-global-prompts-");
    const globalPromptsDir = path.join(codexHome, "prompts");
    fs.mkdirSync(globalPromptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalPromptsDir, "review.md"),
      ["---", "description: Global review prompt", "---", "Global review $FILE"].join("\n"),
      "utf8",
    );
    fs.writeFileSync(path.join(globalPromptsDir, "summarize.md"), "Summarize $1", "utf8");

    await expect(
      listCodexCustomPrompts({ homePath: codexHome, projectPath: projectRoot }),
    ).resolves.toEqual({
      prompts: [
        {
          name: "review",
          description: "Project review prompt",
          content: "Project review $FILE",
        },
        {
          name: "summarize",
          content: "Summarize $1",
        },
      ],
    });
  });

  it("expands ~ in projectPath before resolving .codex/prompts", async () => {
    const fakeHome = makeTempDir("t3code-codex-project-home-");
    const projectRoot = path.join(fakeHome, "project");
    const projectPromptsDir = path.join(projectRoot, ".codex", "prompts");
    const codexHome = makeTempDir("t3code-codex-project-global-");
    fs.mkdirSync(projectPromptsDir, { recursive: true });
    fs.writeFileSync(path.join(projectPromptsDir, "review.md"), "Review $FILE", "utf8");
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);

    await expect(
      listCodexCustomPrompts({ homePath: codexHome, projectPath: "~/project" }),
    ).resolves.toEqual({
      prompts: [{ name: "review", content: "Review $FILE" }],
    });
  });

  it("uses CODEX_HOME when explicit input is missing", async () => {
    const codexHome = makeTempDir("t3code-codex-prompts-env-");
    const promptsDir = path.join(codexHome, "prompts");
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, "env.md"), "From env", "utf8");
    process.env.CODEX_HOME = codexHome;

    await expect(listCodexCustomPrompts()).resolves.toEqual({
      prompts: [{ name: "env", content: "From env" }],
    });
  });

  it("falls back to ~/.codex when CODEX_HOME is unset", async () => {
    const fakeHome = makeTempDir("t3code-codex-home-");
    const codexHome = path.join(fakeHome, ".codex");
    const promptsDir = path.join(codexHome, "prompts");
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, "default.md"), "Default prompt", "utf8");
    delete process.env.CODEX_HOME;
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);

    await expect(listCodexCustomPrompts()).resolves.toEqual({
      prompts: [{ name: "default", content: "Default prompt" }],
    });
  });

  it("skips invalid prompt files instead of failing the whole result", async () => {
    const codexHome = makeTempDir("t3code-codex-prompts-invalid-");
    const promptsDir = path.join(codexHome, "prompts");
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, "good.md"), "Good prompt", "utf8");
    fs.writeFileSync(path.join(promptsDir, "broken.md"), "---\ndescription: Missing end", "utf8");

    await expect(listCodexCustomPrompts({ homePath: codexHome })).resolves.toEqual({
      prompts: [{ name: "good", content: "Good prompt" }],
    });
  });

  it("accepts empty frontmatter blocks", async () => {
    const codexHome = makeTempDir("t3code-codex-prompts-empty-frontmatter-");
    const promptsDir = path.join(codexHome, "prompts");
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(promptsDir, "empty.md"),
      ["---", "---", "Prompt body"].join("\n"),
      "utf8",
    );

    await expect(listCodexCustomPrompts({ homePath: codexHome })).resolves.toEqual({
      prompts: [{ name: "empty", content: "Prompt body" }],
    });
  });
});
