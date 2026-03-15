import type { CodexCustomPrompt } from "@t3tools/contracts";

const CUSTOM_PROMPTS_COMMAND_PREFIX = "prompts:";
const CUSTOM_PROMPT_NAMED_ARG_REGEX = /\$[A-Z][A-Z0-9_]*/g;

function normalizeQuotes(input: string): string {
  return input.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
}

function promptArgumentNames(content: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const matches = content.matchAll(CUSTOM_PROMPT_NAMED_ARG_REGEX);
  for (const match of matches) {
    const index = match.index ?? 0;
    if (index > 0 && content[index - 1] === "$") {
      continue;
    }
    const name = match[0].slice(1);
    if (name === "ARGUMENTS") {
      continue;
    }
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function promptHasNumericPlaceholders(content: string): boolean {
  if (content.includes("$ARGUMENTS")) {
    return true;
  }
  for (let index = 0; index + 1 < content.length; index += 1) {
    if (content[index] === "$" && /[1-9]/.test(content[index + 1] ?? "")) {
      return true;
    }
  }
  return false;
}

function parseSlashName(text: string): { name: string; rest: string } | null {
  if (!text.startsWith("/")) {
    return null;
  }
  const stripped = text.slice(1);
  let nameEnd = stripped.length;
  for (let index = 0; index < stripped.length; index += 1) {
    if (/\s/.test(stripped[index] ?? "")) {
      nameEnd = index;
      break;
    }
  }
  const name = stripped.slice(0, nameEnd);
  if (!name) {
    return null;
  }
  return {
    name,
    rest: stripped.slice(nameEnd).trimStart(),
  };
}

function splitShlex(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (!inSingle && char === "\\") {
      escaped = true;
      continue;
    }

    if (!inDouble && char === "'") {
      inSingle = !inSingle;
      continue;
    }

    if (!inSingle && char === '"') {
      inDouble = !inDouble;
      continue;
    }

    if (!inSingle && !inDouble && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaped) {
    current += "\\";
  }
  if (current) {
    tokens.push(current);
  }

  return tokens;
}

type PromptArgsError =
  | { kind: "MissingAssignment"; token: string }
  | { kind: "MissingKey"; token: string };

function formatPromptArgsError(command: string, error: PromptArgsError): string {
  if (error.kind === "MissingAssignment") {
    return `Could not parse ${command}: expected key=value but found '${error.token}'. Wrap values in double quotes if they contain spaces.`;
  }
  return `Could not parse ${command}: expected a name before '=' in '${error.token}'.`;
}

function parsePromptInputs(
  rest: string,
): { values: Record<string, string> } | { error: PromptArgsError } {
  const values: Record<string, string> = {};
  if (!rest.trim()) {
    return { values };
  }
  const tokens = splitShlex(normalizeQuotes(rest));
  for (const token of tokens) {
    const equalsIndex = token.indexOf("=");
    if (equalsIndex <= 0) {
      if (equalsIndex === 0) {
        return { error: { kind: "MissingKey", token } };
      }
      return { error: { kind: "MissingAssignment", token } };
    }
    values[token.slice(0, equalsIndex)] = token.slice(equalsIndex + 1);
  }
  return { values };
}

function parsePositionalArgs(rest: string): string[] {
  return splitShlex(normalizeQuotes(rest));
}

function expandNamedPlaceholders(content: string, inputs: Record<string, string>): string {
  return content.replace(CUSTOM_PROMPT_NAMED_ARG_REGEX, (match, offset) => {
    if (offset > 0 && content[offset - 1] === "$") {
      return match;
    }
    const key = match.slice(1);
    return inputs[key] ?? match;
  });
}

function expandNumericPlaceholders(content: string, args: string[]): string {
  let output = "";
  let index = 0;
  let joinedArguments: string | null = null;

  while (index < content.length) {
    const nextDollar = content.indexOf("$", index);
    if (nextDollar === -1) {
      output += content.slice(index);
      break;
    }
    output += content.slice(index, nextDollar);
    const rest = content.slice(nextDollar);
    const nextChar = rest[1];

    if (nextChar === "$" && rest.length >= 2) {
      output += "$$";
      index = nextDollar + 2;
      continue;
    }

    if (nextChar && /[1-9]/.test(nextChar)) {
      const argIndex = Number(nextChar) - 1;
      if (Number.isFinite(argIndex) && args[argIndex]) {
        output += args[argIndex];
      }
      index = nextDollar + 2;
      continue;
    }

    if (rest.length > 1 && rest.slice(1).startsWith("ARGUMENTS")) {
      if (args.length > 0) {
        if (joinedArguments === null) {
          joinedArguments = args.join(" ");
        }
        output += joinedArguments;
      }
      index = nextDollar + 1 + "ARGUMENTS".length;
      continue;
    }

    output += "$";
    index = nextDollar + 1;
  }

  return output;
}

function isCustomPromptCommandLine(line: string): boolean {
  return line.startsWith(`/${CUSTOM_PROMPTS_COMMAND_PREFIX}`);
}

function findCustomPromptArgRanges(line: string): Array<{ start: number; end: number }> {
  if (!isCustomPromptCommandLine(line)) {
    return [];
  }
  const normalized = normalizeQuotes(line);
  const ranges: Array<{ start: number; end: number }> = [];
  let index = 0;
  while (index < normalized.length) {
    const assignIndex = normalized.indexOf('="', index);
    if (assignIndex === -1) {
      break;
    }
    const valueStart = assignIndex + 2;
    let end = valueStart;
    let foundClosingQuote = false;
    while (end < normalized.length) {
      const char = normalized[end];
      if (char === '"' && normalized[end - 1] !== "\\") {
        foundClosingQuote = true;
        break;
      }
      end += 1;
    }
    if (!foundClosingQuote) {
      break;
    }
    ranges.push({ start: valueStart, end });
    index = end + 1;
  }
  return ranges;
}

export function getCustomPromptArgumentHint(prompt: CodexCustomPrompt): string | undefined {
  const hint = prompt.argumentHint?.trim();
  if (hint) {
    return hint;
  }
  const names = promptArgumentNames(prompt.content);
  if (names.length > 0) {
    return names.map((name) => `${name}=`).join(" ");
  }
  if (promptHasNumericPlaceholders(prompt.content)) {
    return "[args]";
  }
  return undefined;
}

export function buildCustomPromptInsertText(prompt: CodexCustomPrompt): {
  text: string;
  cursorOffset?: number;
} {
  const names = promptArgumentNames(prompt.content);
  let text = `/${CUSTOM_PROMPTS_COMMAND_PREFIX}${prompt.name}`;
  let cursorOffset: number | undefined;
  for (const name of names) {
    if (cursorOffset === undefined) {
      cursorOffset = text.length + 1 + name.length + 2;
    }
    text += ` ${name}=""`;
  }
  return typeof cursorOffset === "number" ? { text, cursorOffset } : { text };
}

export function expandCustomPromptInvocation(
  text: string,
  prompts: ReadonlyArray<CodexCustomPrompt>,
): { expanded: string } | { error: string } | null {
  const parsed = parseSlashName(text);
  if (!parsed || !parsed.name.startsWith(CUSTOM_PROMPTS_COMMAND_PREFIX)) {
    return null;
  }
  const promptName = parsed.name.slice(CUSTOM_PROMPTS_COMMAND_PREFIX.length);
  if (!promptName) {
    return null;
  }
  const prompt = prompts.find((entry) => entry.name === promptName);
  if (!prompt) {
    return null;
  }

  const requiredNames = promptArgumentNames(prompt.content);
  if (requiredNames.length > 0) {
    const parsedInputs = parsePromptInputs(parsed.rest);
    if ("error" in parsedInputs) {
      return {
        error: formatPromptArgsError(`/${parsed.name}`, parsedInputs.error),
      };
    }
    const missingNames = requiredNames.filter((name) => !(name in parsedInputs.values));
    if (missingNames.length > 0) {
      return {
        error: `Missing required args for /${parsed.name}: ${missingNames.join(", ")}. Provide as key=value (quote values with spaces).`,
      };
    }
    return {
      expanded: expandNamedPlaceholders(prompt.content, parsedInputs.values),
    };
  }

  return {
    expanded: expandNumericPlaceholders(prompt.content, parsePositionalArgs(parsed.rest)),
  };
}

export function findNextCustomPromptArgCursor(text: string, cursor: number): number | null {
  const lineEnd = text.indexOf("\n");
  const safeLineEnd = lineEnd === -1 ? text.length : lineEnd;
  if (cursor > safeLineEnd) {
    return null;
  }
  const line = text.slice(0, safeLineEnd);
  const ranges = findCustomPromptArgRanges(line);
  if (ranges.length === 0) {
    return null;
  }
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    if (!range) {
      continue;
    }
    if (cursor >= range.start && cursor <= range.end) {
      return ranges[index + 1]?.start ?? null;
    }
    if (cursor < range.start) {
      return range.start;
    }
  }
  return null;
}
