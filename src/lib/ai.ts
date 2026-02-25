import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  type FlexibleSchema,
  generateText,
  type LanguageModel,
  Output,
} from "ai";
import { type ModelTier, resolveAiConfig } from "./config.js";
import { CliError } from "./errors.js";

interface BaseCompletionOptions {
  systemPrompt: string;
  userPrompt: string;
  modelTier?: ModelTier;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
}

interface CompletionOptions extends BaseCompletionOptions {}

interface StructuredOutputOptions<OBJECT> extends BaseCompletionOptions {
  schema: FlexibleSchema<OBJECT>;
  schemaDescription?: string;
  schemaName?: string;
}

async function resolveLanguageModel(
  options: Pick<BaseCompletionOptions, "model" | "modelTier">
): Promise<LanguageModel> {
  const config = await resolveAiConfig();
  const selectedTier = options.modelTier ?? "smart";
  const selectedModel =
    options.model ??
    (selectedTier === "fast" ? config.fastModel : config.smartModel);

  if (config.provider === "openai") {
    const openai = createOpenAI({ apiKey: config.apiKey });
    return openai.chat(selectedModel);
  }

  if (config.provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey: config.apiKey });
    return anthropic.chat(selectedModel);
  }

  const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
  return google.chat(selectedModel);
}

function asCliError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }
  if (error instanceof Error) {
    return new CliError(error.message);
  }
  return new CliError("AI request failed.");
}

export async function createCompletion(
  options: CompletionOptions
): Promise<string> {
  try {
    const model = await resolveLanguageModel(options);
    const callSettings = {
      ...(options.maxTokens !== undefined && {
        maxOutputTokens: options.maxTokens,
      }),
      ...(options.stop !== undefined && { stopSequences: options.stop }),
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
    };

    const { text } = await generateText({
      model,
      system: options.systemPrompt,
      prompt: options.userPrompt,
      maxRetries: 0,
      ...callSettings,
    });

    const content = text.trim();
    if (!content) {
      throw new CliError("AI returned empty content.");
    }
    return content;
  } catch (error) {
    throw asCliError(error);
  }
}

export async function createStructuredOutput<OBJECT>(
  options: StructuredOutputOptions<OBJECT>
): Promise<OBJECT> {
  try {
    const model = await resolveLanguageModel(options);
    const callSettings = {
      ...(options.maxTokens !== undefined && {
        maxOutputTokens: options.maxTokens,
      }),
      ...(options.stop !== undefined && { stopSequences: options.stop }),
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
    };

    const { output } = await generateText({
      model,
      output: Output.object({
        ...(options.schemaDescription !== undefined && {
          description: options.schemaDescription,
        }),
        ...(options.schemaName !== undefined && {
          name: options.schemaName,
        }),
        schema: options.schema,
      }),
      system: options.systemPrompt,
      prompt: options.userPrompt,
      maxRetries: 0,
      ...callSettings,
    });

    return output;
  } catch (error) {
    throw asCliError(error);
  }
}
