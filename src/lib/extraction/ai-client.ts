import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AI_IMAGE_TYPES, AI_MODEL, AiDocument, canReadWithAi, SYSTEM, type AiReader } from "./ai-read";

// The only place the Anthropic API key is read. "server-only" makes the build
// fail if this is ever imported into code that runs in the browser.

/** A reader using the Claude API, or null when no API key is set (or AI_READING=off). */
export function aiReaderFromEnv(): AiReader | null {
  if (!process.env.ANTHROPIC_API_KEY || process.env.AI_READING === "off") return null;
  const client = new Anthropic();
  return async (file) => {
    if (!canReadWithAi(file.mime, file.bytes.byteLength)) return null;
    const data = Buffer.from(file.bytes).toString("base64");
    const source =
      file.mime === "application/pdf"
        ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
        : ({
            type: "image",
            source: { type: "base64", media_type: file.mime as (typeof AI_IMAGE_TYPES)[number], data },
          } as const);
    const response = await client.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      // If this model declines, the API retries on another model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(AiDocument) },
      system: SYSTEM,
      messages: [{ role: "user", content: [source, { type: "text", text: `Read this document (${file.name}).` }] }],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
    return response.parsed_output;
  };
}
