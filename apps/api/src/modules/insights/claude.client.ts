import Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DEFAULT_CLAUDE_MODEL, claudeApiKey } from "./claude-config";

export class ClaudeUnavailableError extends Error {
  constructor() {
    super("Claude is not configured");
    this.name = "ClaudeUnavailableError";
  }
}

@Injectable()
export class ClaudeClient {
  constructor(private config: ConfigService) {}

  isConfigured() {
    return claudeApiKey(this.config) !== null;
  }

  get model(): string {
    return this.config.get<string>("CLAUDE_MODEL") || DEFAULT_CLAUDE_MODEL;
  }

  /** One request/response with Claude. Returns the text of the reply. */
  async complete(
    system: string,
    user: string,
    maxTokens = 2500,
  ): Promise<string> {
    const apiKey = claudeApiKey(this.config);
    if (!apiKey) throw new ClaudeUnavailableError();

    const client = new Anthropic({
      apiKey,
      baseURL: this.config.get<string>("ANTHROPIC_BASE_URL") || undefined,
      timeout: 60_000,
      maxRetries: 1,
    });

    const response = await client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });

    return response.content
      .filter(
        (block): block is Extract<typeof block, { type: "text" }> =>
          block.type === "text",
      )
      .map((block) => block.text)
      .join("")
      .trim();
  }
}
