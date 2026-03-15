import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  CodexCustomPrompt,
  CodexListCustomPromptsInput,
  CodexListCustomPromptsResult,
} from "@t3tools/contracts";

function resolveHomePathSegment(input: string): string {
  if (input === "~") {
    return os.homedir();
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function stripMatchingQuotes(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parsePromptFrontmatter(fileContents: string): {
  description?: string;
  argumentHint?: string;
  content: string;
} | null {
  const normalized = fileContents.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) {
    return { content: normalized };
  }

  const delimiterMatch = /^---\r?\n([\s\S]*?)\r?\n?---(?:\r?\n|$)/.exec(normalized);
  if (!delimiterMatch) {
    return null;
  }

  const frontmatterBlock = delimiterMatch[1] ?? "";
  const bodyStart = delimiterMatch[0].length;
  let description: string | undefined;
  let argumentHint: string | undefined;

  for (const line of frontmatterBlock.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    const rawKey = line.slice(0, separatorIndex).trim().toLowerCase();
    const rawValue = stripMatchingQuotes(line.slice(separatorIndex + 1));
    if (!rawValue) {
      continue;
    }
    if (rawKey === "description") {
      description = rawValue;
      continue;
    }
    if (rawKey === "argument-hint" || rawKey === "argument_hint") {
      argumentHint = rawValue;
    }
  }

  return {
    ...(description ? { description } : {}),
    ...(argumentHint ? { argumentHint } : {}),
    content: normalized.slice(bodyStart),
  };
}

export function resolveCodexPromptHomePath(
  input?: Pick<CodexListCustomPromptsInput, "homePath">,
): string {
  const homePath = input?.homePath?.trim() || process.env.CODEX_HOME?.trim() || "~/.codex";
  return path.resolve(resolveHomePathSegment(homePath));
}

function resolveProjectPromptDir(
  input?: Pick<CodexListCustomPromptsInput, "projectPath">,
): string | null {
  const projectPath = input?.projectPath?.trim();
  if (!projectPath) {
    return null;
  }
  return path.resolve(resolveHomePathSegment(projectPath), ".codex", "prompts");
}

async function readPromptDirectory(promptDir: string): Promise<CodexCustomPrompt[]> {
  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(promptDir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return [];
  }

  const prompts = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map(async (entry): Promise<CodexCustomPrompt | null> => {
        const promptName = entry.name.slice(0, -3).trim();
        if (!promptName) {
          return null;
        }
        const filePath = path.join(promptDir, entry.name);
        try {
          const fileContents = await fs.readFile(filePath, "utf8");
          const parsed = parsePromptFrontmatter(fileContents);
          if (!parsed) {
            return null;
          }
          if (parsed.description && parsed.argumentHint) {
            return {
              name: promptName,
              description: parsed.description,
              argumentHint: parsed.argumentHint,
              content: parsed.content,
            };
          }
          if (parsed.description) {
            return {
              name: promptName,
              description: parsed.description,
              content: parsed.content,
            };
          }
          if (parsed.argumentHint) {
            return {
              name: promptName,
              argumentHint: parsed.argumentHint,
              content: parsed.content,
            };
          }
          return {
            name: promptName,
            content: parsed.content,
          };
        } catch {
          return null;
        }
      }),
  );

  return prompts.filter((prompt): prompt is CodexCustomPrompt => prompt !== null);
}

export async function listCodexCustomPrompts(
  input?: CodexListCustomPromptsInput,
): Promise<CodexListCustomPromptsResult> {
  const projectPromptDir = resolveProjectPromptDir(input);
  const globalPromptDir = path.join(resolveCodexPromptHomePath(input), "prompts");
  const [projectPrompts, globalPrompts] = await Promise.all([
    projectPromptDir ? readPromptDirectory(projectPromptDir) : Promise.resolve([]),
    readPromptDirectory(globalPromptDir),
  ]);

  const promptsByName = new Map<string, CodexCustomPrompt>();
  for (const prompt of projectPrompts) {
    promptsByName.set(prompt.name, prompt);
  }
  for (const prompt of globalPrompts) {
    if (!promptsByName.has(prompt.name)) {
      promptsByName.set(prompt.name, prompt);
    }
  }

  return {
    prompts: Array.from(promptsByName.values()).toSorted((left, right) =>
      left.name.localeCompare(right.name),
    ),
  };
}
