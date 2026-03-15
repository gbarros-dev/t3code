import { memo } from "react";
import { BugIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

function shouldShowCodexPromptDebugBanner(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return false;
  }
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get("debugCodexPrompts") === "1") {
    return true;
  }
  return window.localStorage.getItem("t3code.debug.codexPrompts") === "1";
}

export const CodexPromptDebugBanner = memo(function CodexPromptDebugBanner(props: {
  provider: string;
  activeProjectId: string | null;
  activeProjectPath: string | null;
  effectiveCodexHomePath: string | null;
  shouldLoad: boolean;
  queryStatus: string;
  fetchStatus: string;
  promptCount: number;
  errorMessage: string | null;
}) {
  const globalPromptDir = `${props.effectiveCodexHomePath ?? "~/.codex"}/prompts`;
  const projectPromptDir = props.activeProjectPath
    ? `${props.activeProjectPath}/.codex/prompts`
    : null;

  if (!shouldShowCodexPromptDebugBanner()) {
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl pt-3">
      <Alert variant={props.errorMessage ? "warning" : "info"}>
        <BugIcon />
        <AlertTitle>Custom prompt debug</AlertTitle>
        <AlertDescription className="gap-1.5 font-mono text-[11px] leading-relaxed">
          <div>provider={props.provider}</div>
          <div>activeProjectId={props.activeProjectId ?? "<none>"}</div>
          <div>activeProjectPath={props.activeProjectPath ?? "<none>"}</div>
          <div>projectPromptDir={projectPromptDir ?? "<none>"}</div>
          <div>globalPromptDir={globalPromptDir}</div>
          <div>shouldLoad={String(props.shouldLoad)}</div>
          <div>queryStatus={props.queryStatus}</div>
          <div>fetchStatus={props.fetchStatus}</div>
          <div>promptCount={String(props.promptCount)}</div>
          {props.errorMessage ? <div>error={props.errorMessage}</div> : null}
        </AlertDescription>
      </Alert>
    </div>
  );
});
