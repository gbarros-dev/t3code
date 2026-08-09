import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";

import {
  applyGrokAcpModelSelection,
  buildGrokAcpSpawnInput,
  resolveGrokAcpBaseModelId,
  resolveGrokAuthMethodId,
} from "./GrokAcpSupport.ts";

describe("resolveGrokAcpBaseModelId", () => {
  it("normalizes empty and custom Grok model ids", () => {
    expect(resolveGrokAcpBaseModelId(undefined)).toBe("grok-build");
    expect(resolveGrokAcpBaseModelId("   ")).toBe("grok-build");
    expect(resolveGrokAcpBaseModelId("  grok-test-custom-model  ")).toBe("grok-test-custom-model");
  });
});

describe("buildGrokAcpSpawnInput", () => {
  it("passes the T3 Code referrer through Grok OAuth env", () => {
    const spawn = buildGrokAcpSpawnInput({ binaryPath: "/usr/local/bin/grok" }, "/tmp/project", {
      XAI_API_KEY: "secret",
      GROK_OAUTH2_REFERRER: "other-client",
    });

    expect(spawn).toEqual({
      command: "/usr/local/bin/grok",
      args: ["agent", "stdio"],
      cwd: "/tmp/project",
      env: {
        XAI_API_KEY: "secret",
        GROK_OAUTH2_REFERRER: "t3code",
      },
    });
  });
});

describe("resolveGrokAuthMethodId", () => {
  const initializeResult = (input: {
    readonly authMethodIds?: ReadonlyArray<string>;
    readonly defaultAuthMethodId?: string;
  }): EffectAcpSchema.InitializeResponse => ({
    protocolVersion: 1,
    ...(input.authMethodIds
      ? {
          authMethods: input.authMethodIds.map((id) => ({ id, name: id })),
        }
      : {}),
    ...(input.defaultAuthMethodId
      ? { _meta: { defaultAuthMethodId: input.defaultAuthMethodId } }
      : {}),
  });

  it("uses the agent default when it differs from the process environment heuristic", () => {
    expect(
      resolveGrokAuthMethodId(
        initializeResult({
          authMethodIds: ["xai.api_key", "cached_token", "grok.com"],
          defaultAuthMethodId: "cached_token",
        }),
        { XAI_API_KEY: "secret" },
      ),
    ).toBe("cached_token");
  });

  it("uses an advertised per-model API key method without a global API key", () => {
    expect(
      resolveGrokAuthMethodId(
        initializeResult({
          authMethodIds: ["xai.api_key", "grok.com"],
          defaultAuthMethodId: "xai.api_key",
        }),
        {},
      ),
    ).toBe("xai.api_key");
  });

  it("never returns an unadvertised default or environment-derived method", () => {
    expect(
      resolveGrokAuthMethodId(
        initializeResult({
          authMethodIds: ["grok.com"],
          defaultAuthMethodId: "cached_token",
        }),
        { XAI_API_KEY: "secret" },
      ),
    ).toBe("grok.com");
  });

  it("preserves the legacy environment fallback when auth methods are omitted", () => {
    expect(resolveGrokAuthMethodId(initializeResult({}), {})).toBe("cached_token");
    expect(
      resolveGrokAuthMethodId(initializeResult({}), {
        GROK_CODE_XAI_API_KEY: "legacy-secret",
      }),
    ).toBe("xai.api_key");
  });

  it("declines authentication when the agent explicitly advertises no methods", () => {
    expect(resolveGrokAuthMethodId(initializeResult({ authMethodIds: [] }), {})).toBeUndefined();
  });
});

describe("applyGrokAcpModelSelection", () => {
  const makeRecordingRuntime = (failure?: EffectAcpErrors.AcpError) => {
    const modelCalls: Array<string> = [];
    const runtime = {
      setSessionModel: (modelId: string) =>
        Effect.gen(function* () {
          modelCalls.push(modelId);
          if (failure) return yield* failure;
          return {};
        }),
    };
    return { runtime, modelCalls };
  };

  it.effect("calls session/set_model when the requested model differs from current", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyGrokAcpModelSelection({
        runtime,
        currentModelId: "grok-build",
        requestedModelId: "grok-mock-alt",
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual(["grok-mock-alt"]);
      expect(result).toBe("grok-mock-alt");
    }),
  );

  it.effect("skips set_model when requested matches current", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyGrokAcpModelSelection({
        runtime,
        currentModelId: "grok-build",
        requestedModelId: "grok-build",
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual([]);
      expect(result).toBe("grok-build");
    }),
  );

  it.effect("skips set_model when no model is requested", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyGrokAcpModelSelection({
        runtime,
        currentModelId: "grok-build",
        requestedModelId: undefined,
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual([]);
      expect(result).toBe("grok-build");
    }),
  );

  it.effect("propagates session/set_model failures via mapError", () =>
    Effect.gen(function* () {
      const failure = EffectAcpErrors.AcpRequestError.invalidParams("session id not known");
      const { runtime } = makeRecordingRuntime(failure);
      const error = yield* Effect.flip(
        applyGrokAcpModelSelection({
          runtime,
          currentModelId: "grok-build",
          requestedModelId: "grok-mock-alt",
          mapError: (cause) => cause.message,
        }),
      );
      expect(error).toBe(failure.message);
    }),
  );
});
