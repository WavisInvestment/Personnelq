import * as http from "http";
import { AddressInfo } from "net";
import { ClaudeClient, ClaudeUnavailableError } from "./claude.client";

describe("ClaudeClient (the real Anthropic SDK against a local fake server)", () => {
  let server: http.Server;
  let baseUrl: string;
  let last: {
    url?: string;
    headers: http.IncomingHttpHeaders;
    body: any;
  } | null;
  let reply: () => { status: number; json: unknown };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        last = {
          url: req.url,
          headers: req.headers,
          body: raw ? JSON.parse(raw) : null,
        };
        const { status, json } = reply();
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(
    () =>
      new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      }),
  );

  beforeEach(() => {
    last = null;
  });

  const message = (text: string) => ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-test",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 20 },
  });

  const client = (env: Record<string, string | undefined> = {}) =>
    new ClaudeClient({
      get: (k: string) =>
        ({
          CLAUDE_API_KEY: "sk-ant-api03-realkey1234567890",
          ANTHROPIC_BASE_URL: baseUrl,
          ...env,
        })[k],
    } as any);

  it("is configured only with a real-looking key, not the .env.example placeholder", () => {
    expect(client().isConfigured()).toBe(true);
    expect(client({ CLAUDE_API_KEY: "sk-ant-xxxxx" }).isConfigured()).toBe(
      false,
    );
    expect(
      client({
        CLAUDE_API_KEY: undefined,
        ANTHROPIC_API_KEY: undefined,
      }).isConfigured(),
    ).toBe(false);
  });

  it("also accepts the key under the ANTHROPIC_API_KEY name", () => {
    expect(
      client({
        CLAUDE_API_KEY: undefined,
        ANTHROPIC_API_KEY: "sk-ant-api03-another1234567890",
      }).isConfigured(),
    ).toBe(true);
  });

  it("sends the system prompt, the user message, the model and the key, and returns the reply text", async () => {
    reply = () => ({ status: 200, json: message('{"ok":true}') });

    const text = await client({ CLAUDE_MODEL: "claude-test-model" }).complete(
      "You are careful.",
      "Scores: ...",
      1234,
    );

    expect(text).toBe('{"ok":true}');
    expect(last!.url).toBe("/v1/messages");
    expect(last!.headers["x-api-key"]).toBe("sk-ant-api03-realkey1234567890");
    expect(last!.headers["anthropic-version"]).toBeDefined();
    expect(last!.body).toMatchObject({
      model: "claude-test-model",
      max_tokens: 1234,
      system: "You are careful.",
      messages: [{ role: "user", content: "Scores: ..." }],
    });
  });

  it("joins several text blocks and ignores non-text blocks", async () => {
    reply = () => ({
      status: 200,
      json: {
        ...message(""),
        content: [
          { type: "text", text: "Hello " },
          { type: "tool_use", id: "t", name: "x", input: {} },
          { type: "text", text: "world" },
        ],
      },
    });
    expect(await client().complete("s", "u")).toBe("Hello world");
  });

  it("defaults to the current Sonnet model", async () => {
    reply = () => ({ status: 200, json: message("x") });
    await client().complete("s", "u");
    expect(last!.body.model).toBe("claude-sonnet-5-5");
  });

  it("refuses to call out without a key", async () => {
    reply = () => ({ status: 200, json: message("x") });
    await expect(
      client({ CLAUDE_API_KEY: "sk-ant-xxxxx" }).complete("s", "u"),
    ).rejects.toBeInstanceOf(ClaudeUnavailableError);
    expect(last).toBeNull();
  });

  it("surfaces an API error instead of returning an empty answer", async () => {
    reply = () => ({
      status: 401,
      json: {
        type: "error",
        error: { type: "authentication_error", message: "invalid x-api-key" },
      },
    });
    await expect(client().complete("s", "u")).rejects.toThrow();
  });
});
