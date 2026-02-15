import { describe, expect, test } from "bun:test";
import { discoverProviderModelCatalog } from "../src/lib/provider-models.js";
import { setupIsolatedRuntime } from "./helpers/test-harness.js";

setupIsolatedRuntime();

describe("user promise: quickstart model discovery is current and resilient", () => {
  test("loads OpenAI models from live provider data", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-5" },
            { id: "gpt-4o-mini" },
            { id: "o3-mini" },
            { id: "text-embedding-3-large" },
          ],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        }
      );

    const catalog = await discoverProviderModelCatalog("openai", "test-key");
    expect(catalog.source).toBe("live");
    expect(catalog.liveModelCount).toBe(3);
    expect(catalog.smart[0]).toBe("gpt-5");
    expect(catalog.fast).toContain("gpt-4o-mini");
    expect(catalog.fast).not.toContain("text-embedding-3-large");
  });

  test("loads Google models that support generateContent", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          models: [
            {
              name: "models/gemini-2.5-pro",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/text-embedding-004",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        }
      );

    const catalog = await discoverProviderModelCatalog("google", "test-key");
    expect(catalog.source).toBe("live");
    expect(catalog.smart[0]).toBe("gemini-2.5-pro");
    expect(catalog.smart).not.toContain("text-embedding-004");
  });

  test("falls back to presets when live discovery fails", async () => {
    globalThis.fetch = async () =>
      new Response("unauthorized", {
        headers: { "content-type": "text/plain" },
        status: 401,
      });

    const catalog = await discoverProviderModelCatalog("openai", "bad-key");
    expect(catalog.source).toBe("fallback");
    expect(catalog.warning).toContain("OpenAI model listing failed (401)");
    expect(catalog.smart.length).toBeGreaterThan(0);
    expect(catalog.fast.length).toBeGreaterThan(0);
  });
});
