import { ConfigService } from "@nestjs/config";

const PLACEHOLDER = /x{3,}|^\s*$|changeme|your[-_]|replace/i;

/** The Claude API key, or null when none (or only the placeholder from .env.example) is set. */
export function claudeApiKey(config: ConfigService): string | null {
  const key =
    config.get<string>("CLAUDE_API_KEY") ||
    config.get<string>("ANTHROPIC_API_KEY");
  return key && !PLACEHOLDER.test(key) ? key : null;
}

export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";
