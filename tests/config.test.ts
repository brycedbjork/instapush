import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  configPath,
  defaultFastModelForProvider,
  defaultSmartModelForProvider,
  readStoredConfig,
  resolveAiConfig,
  suggestedModelsForProvider,
} from "../src/lib/config.js";
import {
  setupIsolatedRuntime,
  writeTestConfig,
} from "./helpers/test-harness.js";

setupIsolatedRuntime();

describe("user promise: configuration is predictable", () => {
  test("resolves defaults for openai when only env key is present", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-config-default-"));
    process.env.GJ_CONFIG_PATH = path.join(root, "missing-config.json");
    process.env.OPENAI_API_KEY = "openai-key";

    const resolved = await resolveAiConfig();
    expect(resolved.provider).toBe("openai");
    expect(resolved.apiKey).toBe("openai-key");
    expect(resolved.smartModel).toBe(defaultSmartModelForProvider("openai"));
    expect(resolved.fastModel).toBe(defaultFastModelForProvider("openai"));
  });

  test("uses stored provider and dual-model config", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-config-stored-"));
    await writeTestConfig(root, {
      apiKey: "anthropic-config-key",
      fastModel: "anthropic-fast",
      provider: "anthropic",
      smartModel: "anthropic-smart",
    });

    const resolved = await resolveAiConfig();
    expect(resolved).toEqual({
      apiKey: "anthropic-config-key",
      fastModel: "anthropic-fast",
      provider: "anthropic",
      smartModel: "anthropic-smart",
    });
  });

  test("supports legacy single-model config fallback", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-config-legacy-"));
    const configFilePath = path.join(root, "legacy.json");
    process.env.GJ_CONFIG_PATH = configFilePath;
    await writeFile(
      configFilePath,
      JSON.stringify({
        apiKey: "legacy-key",
        model: "legacy-model",
        provider: "openai",
      }),
      "utf8"
    );

    const resolved = await resolveAiConfig();
    expect(resolved.smartModel).toBe("legacy-model");
    expect(resolved.fastModel).toBe("legacy-model");
  });

  test("env overrides provider and model tiers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-config-overrides-"));
    await writeTestConfig(root, {
      apiKey: "stored-key",
      fastModel: "stored-fast",
      provider: "google",
      smartModel: "stored-smart",
    });

    process.env.GJ_AI_PROVIDER = "openai";
    process.env.GJ_SMART_MODEL = "env-smart";
    process.env.GJ_FAST_MODEL = "env-fast";
    process.env.OPENAI_API_KEY = "env-openai-key";

    const resolved = await resolveAiConfig();
    expect(resolved).toEqual({
      apiKey: "env-openai-key",
      fastModel: "env-fast",
      provider: "openai",
      smartModel: "env-smart",
    });
  });

  test("throws when provider key is missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-config-missing-key-"));
    process.env.GJ_CONFIG_PATH = path.join(root, "missing.json");

    await expect(resolveAiConfig()).rejects.toThrow(
      "Missing API key for openai"
    );
  });

  test("accepts GEMINI_API_KEY as google key fallback", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-config-gemini-key-"));
    process.env.GJ_CONFIG_PATH = path.join(root, "missing.json");
    process.env.GJ_AI_PROVIDER = "google";
    process.env.GEMINI_API_KEY = "gemini-key";

    const resolved = await resolveAiConfig();
    expect(resolved.provider).toBe("google");
    expect(resolved.apiKey).toBe("gemini-key");
  });

  test("rejects invalid json config files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-config-bad-json-"));
    const filePath = path.join(root, "bad.json");
    process.env.GJ_CONFIG_PATH = filePath;
    await writeFile(filePath, "{ this is not valid json", "utf8");

    await expect(readStoredConfig()).rejects.toThrow("Failed to read config");
  });

  test("provider override does not reuse mismatched stored key", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-config-provider-miss-"));
    await writeTestConfig(root, {
      apiKey: "anthropic-config-key",
      fastModel: "anthropic-fast",
      provider: "anthropic",
      smartModel: "anthropic-smart",
    });
    process.env.GJ_AI_PROVIDER = "openai";

    await expect(resolveAiConfig()).rejects.toThrow(
      "Missing API key for openai"
    );
  });

  test("suggested models are unique and start with defaults", () => {
    const models = suggestedModelsForProvider("openai", "smart");
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toBe(defaultSmartModelForProvider("openai"));
    expect(new Set(models).size).toBe(models.length);
  });

  test("configPath tracks GJ_CONFIG_PATH at call time", () => {
    const first = "/tmp/gj-config-one.json";
    const second = "/tmp/gj-config-two.json";

    process.env.GJ_CONFIG_PATH = first;
    expect(configPath()).toBe(path.resolve(first));

    process.env.GJ_CONFIG_PATH = second;
    expect(configPath()).toBe(path.resolve(second));
  });
});
