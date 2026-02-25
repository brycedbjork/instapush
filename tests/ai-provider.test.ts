import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { createCompletion, createStructuredOutput } from "../src/lib/ai.js";
import {
  type FetchCall,
  mockFetchWithOpenAiText,
  requestBodyFromInput,
  setupIsolatedRuntime,
  writeTestConfig,
} from "./helpers/test-harness.js";

setupIsolatedRuntime();

describe("user promise: AI provider integrations are reliable", () => {
  test("routes OpenAI requests to fast model tier", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-ai-openai-"));
    await writeTestConfig(root, {
      apiKey: "openai-test-key",
      fastModel: "openai-fast-model",
      provider: "openai",
      smartModel: "openai-smart-model",
    });

    const calls = mockFetchWithOpenAiText("openai-response");
    const response = await createCompletion({
      modelTier: "fast",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(response).toBe("openai-response");
    expect(calls).toHaveLength(1);

    const payload = JSON.parse(calls[0]?.body ?? "{}");
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(payload.model).toBe("openai-fast-model");
  });

  test("routes Anthropic requests to smart model tier", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-ai-anthropic-"));
    await writeTestConfig(root, {
      apiKey: "anthropic-test-key",
      fastModel: "anthropic-fast-model",
      provider: "anthropic",
      smartModel: "anthropic-smart-model",
    });

    const calls: FetchCall[] = [];
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const rawBody = await requestBodyFromInput(input, init);
      calls.push({
        body: rawBody,
        method: init?.method || "GET",
        url,
      });

      return new Response(
        JSON.stringify({
          type: "message",
          content: [{ text: "anthropic-response", type: "text" }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        }
      );
    };

    const response = await createCompletion({
      modelTier: "smart",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(response).toBe("anthropic-response");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    const payload = JSON.parse(calls[0]?.body ?? "{}");
    expect(payload.model).toBe("anthropic-smart-model");
  });

  test("supports Google provider with explicit model override", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-ai-google-"));
    await writeTestConfig(root, {
      apiKey: "google-test-key",
      fastModel: "google-fast-model",
      provider: "google",
      smartModel: "google-smart-model",
    });

    const calls: FetchCall[] = [];
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const rawBody = await requestBodyFromInput(input, init);
      calls.push({
        body: rawBody,
        method: init?.method || "GET",
        url,
      });

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "google-response" }],
              },
            },
          ],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        }
      );
    };

    const response = await createCompletion({
      model: "google-custom-model",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(response).toBe("google-response");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain(
      "models/google-custom-model:generateContent"
    );
  });

  test("throws a readable error when OpenAI returns empty content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-ai-openai-empty-"));
    await writeTestConfig(root, {
      apiKey: "openai-test-key",
      fastModel: "openai-fast-model",
      provider: "openai",
      smartModel: "openai-smart-model",
    });

    mockFetchWithOpenAiText("  ");

    await expect(
      createCompletion({
        systemPrompt: "system",
        userPrompt: "user",
      })
    ).rejects.toThrow("AI returned empty content.");
  });

  test("returns validated structured output", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-ai-openai-object-"));
    await writeTestConfig(root, {
      apiKey: "openai-test-key",
      fastModel: "openai-fast-model",
      provider: "openai",
      smartModel: "openai-smart-model",
    });

    const calls = mockFetchWithOpenAiText('{"message":"object result"}');
    const result = await createStructuredOutput({
      schema: z.object({ message: z.string().min(1) }),
      schemaName: "test_output",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(result.message).toBe("object result");
    const payload = JSON.parse(calls[0]?.body ?? "{}");
    expect(payload.response_format.type).toBe("json_schema");
  });

  test("fails when structured output does not match schema", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-ai-openai-bad-object-"));
    await writeTestConfig(root, {
      apiKey: "openai-test-key",
      fastModel: "openai-fast-model",
      provider: "openai",
      smartModel: "openai-smart-model",
    });

    mockFetchWithOpenAiText("not-json");

    await expect(
      createStructuredOutput({
        schema: z.object({ message: z.string().min(1) }),
        schemaName: "test_output",
        systemPrompt: "system",
        userPrompt: "user",
      })
    ).rejects.toThrow();
  });
});
