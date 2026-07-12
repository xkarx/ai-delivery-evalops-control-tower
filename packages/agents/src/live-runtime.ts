export interface LiveAgentReasoningInput {
  role: string;
  task: string;
  context: unknown;
}

export interface LiveAgentReasoningResult {
  model: string;
  summary: string;
  sourceMode: "live" | "deterministic-fallback";
}

/**
 * Ask the configured OpenAI-compatible endpoint for a concise operator-safe
 * summary. The deterministic role implementation remains authoritative for
 * schemas and gates; this layer adds live model reasoning without exposing
 * hidden chain-of-thought.
 */
export async function runLiveAgentReasoning(input: LiveAgentReasoningInput, env: Record<string, string | undefined> = process.env): Promise<LiveAgentReasoningResult> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const liveRequired = env.INTEGRATION_MODE === "live";
  const model = env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  if (!apiKey) {
    if (liveRequired) throw new Error("Live agent execution requires OPENAI_API_KEY.");
    return { model: "deterministic-role-engine", summary: "No model credential configured; deterministic role contract executed.", sourceMode: "deterministic-fallback" };
  }
  const base = (env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${base.endsWith("/v1") ? base : `${base}/v1`}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "x-portkey-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, max_completion_tokens: 180, messages: [
        { role: "system", content: "Return only a concise operator-safe summary. Do not reveal chain-of-thought. State the evidence considered, decision, risk, and next action in 3-5 sentences." },
        { role: "user", content: JSON.stringify(input) }
      ] }),
      signal: controller.signal
    });
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? `Model returned HTTP ${response.status}`);
    const summary = payload.choices?.[0]?.message?.content?.trim();
    if (!summary) throw new Error("Model returned no summary");
    return { model, summary, sourceMode: "live" };
  } catch (error) {
    if (liveRequired) throw new Error(`Live model reasoning failed: ${error instanceof Error ? error.message : "provider error"}`);
    return { model: "deterministic-role-engine", summary: "Live model reasoning was unavailable; deterministic role contract executed.", sourceMode: "deterministic-fallback" };
  } finally { clearTimeout(timer); }
}
