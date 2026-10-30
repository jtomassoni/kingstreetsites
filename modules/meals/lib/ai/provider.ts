import OpenAI from "openai";
import type { ZodType } from "zod";
import { formatAiErrorMessage } from "@meals/lib/ai/errors";
import { normalizeAiRecipeJson } from "@meals/lib/ai/normalize-recipe-response";
import { PARSE_RECIPE_SYSTEM_PROMPT } from "@meals/lib/recipes/parse-recipe-request";
import { getEnv, isAiEnabled } from "@meals/lib/env";
import {
  aiRecipeSchema,
  aiRecipeBatchSchema,
  mealSuggestionSchema,
  weekNameProposalSchema,
  type AiRecipe,
  type AiRecipeBatch,
  type MealSuggestions,
  type WeekNameProposal,
} from "@meals/lib/ai/schemas";

export interface AiProvider {
  generateRecipe(prompt: string): Promise<{
    data: AiRecipe;
    model: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }>;
  parseRecipe(prompt: string): Promise<{
    data: AiRecipe;
    model: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }>;
  generateRecipeBatch(prompt: string): Promise<{
    data: AiRecipeBatch;
    model: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }>;
  suggestMeals(prompt: string): Promise<{
    data: MealSuggestions;
    model: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }>;
  proposeWeekNames(prompt: string): Promise<{
    data: WeekNameProposal;
    model: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }>;
}

class OpenAiProvider implements AiProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    const env = getEnv();
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      maxRetries: 0,
      timeout: 45_000,
    });
    this.model = env.OPENAI_MODEL || "gpt-5.4-mini";
  }

  private async jsonCompletion<T>(
    system: string,
    user: string,
    schema: ZodType<T>,
    temperature = 0.4,
    normalize?: (value: unknown) => unknown,
  ) {
    const run = async (retryHint?: string) => {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: retryHint ? `${user}\n\n${retryHint}` : user,
          },
        ],
      });
      const content = completion.choices[0]?.message?.content ?? "{}";
      const parsedJson = JSON.parse(content) as unknown;
      return { parsedJson, usage: completion.usage, model: completion.model };
    };

    const validate = (parsedJson: unknown) => {
      const normalized = normalize ? normalize(parsedJson) : parsedJson;
      return schema.safeParse(normalized);
    };

    try {
      let result = await run();
      let validated = validate(result.parsedJson);
      if (!validated.success) {
        const issues = validated.error.issues
          .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
          .join("; ");
        result = await run(
          `Your previous JSON failed validation (${issues}). Return corrected JSON only with the exact field names from the schema.`,
        );
        validated = validate(result.parsedJson);
        if (!validated.success) {
          throw new Error("AI response failed validation after retry");
        }
      }

      return {
        data: validated.data as T,
        model: result.model,
        usage: result.usage
          ? {
              prompt_tokens: result.usage.prompt_tokens,
              completion_tokens: result.usage.completion_tokens,
              total_tokens: result.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "AI response failed validation after retry"
      ) {
        throw err;
      }
      throw new Error(formatAiErrorMessage(err), { cause: err });
    }
  }

  generateRecipe(prompt: string) {
    return this.jsonCompletion(
      "You are a careful home cook assistant. Return ONLY valid JSON matching the recipe schema. Prefer practical weeknight cooking. Write recipes for exactly 1 serving (one portion). Only write recipes for real, widely known dishes — never cocktails, drinks, or invented mashups. Ingredients must be edible groceries only — never list containers, tupperware, portion cups, bags, or other storage ware.",
      prompt,
      aiRecipeSchema,
    );
  }

  parseRecipe(prompt: string) {
    return this.jsonCompletion(
      PARSE_RECIPE_SYSTEM_PROMPT,
      prompt,
      aiRecipeSchema,
      0.2,
      normalizeAiRecipeJson,
    );
  }

  generateRecipeBatch(prompt: string) {
    return this.jsonCompletion(
      "You are a careful home cook assistant. Return ONLY valid JSON with a recipes array. Each recipe must be distinct, practical for home cooking, written for exactly 1 serving, and fully specified (ingredients + steps). Ingredients must be edible groceries only — never list containers, tupperware, portion cups, bags, or other storage ware.",
      prompt,
      aiRecipeBatchSchema,
    );
  }

  suggestMeals(prompt: string) {
    return this.jsonCompletion(
      "You suggest household meal plans. Return ONLY valid JSON with a suggestions array. Do not replace existing meals unless asked. Respect time constraints and preferences.",
      prompt,
      mealSuggestionSchema,
    );
  }

  proposeWeekNames(prompt: string) {
    return this.jsonCompletion(
      "You propose meal TITLE ideas only for a household week plan. This household meal-preps in small batches: every distinct title must appear in at least two slots, interleaved across the week — never the same dish two calendar days in a row. Do not invent a unique dish for every slot. Prefer leftover-friendly, repeatable meals. Return ONLY valid JSON { proposals: [{ dayDate, mealType, title }] }. Titles must be real, widely known dishes or menu items. Never drinks or invented mashups. Do not include ingredients or steps.",
      prompt,
      weekNameProposalSchema,
    );
  }
}

class DisabledAiProvider implements AiProvider {
  async generateRecipe(): Promise<never> {
    throw new Error("AI features are disabled or OPENAI_API_KEY is missing.");
  }
  async parseRecipe(): Promise<never> {
    throw new Error("AI features are disabled or OPENAI_API_KEY is missing.");
  }
  async generateRecipeBatch(): Promise<never> {
    throw new Error("AI features are disabled or OPENAI_API_KEY is missing.");
  }
  async suggestMeals(): Promise<never> {
    throw new Error("AI features are disabled or OPENAI_API_KEY is missing.");
  }
  async proposeWeekNames(): Promise<never> {
    throw new Error("AI features are disabled or OPENAI_API_KEY is missing.");
  }
}

export function getAiProvider(): AiProvider {
  if (!isAiEnabled()) return new DisabledAiProvider();
  return new OpenAiProvider();
}
