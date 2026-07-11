"use client";

import { Gauge, Play, Users } from "lucide-react";
import { FormEvent, useState } from "react";

type Scenario = "baseline" | "feature-exposure" | "checkout-failure" | "mixed";
type TrafficResult = { runId: string; eventCount: number; users: number; sourceMode: string; capped: boolean; stopReason: string; funnel: Array<{ stage: string; count: number }> };

const initial = { userCount: 24, spawnRatePerSecond: 12, durationSeconds: 8, seed: 20260710, scenario: "mixed" as Scenario, maxEvents: 2_000, maxRuntimeSeconds: 30 };

export function TrafficControl() {
  const [values, setValues] = useState(initial);
  const [result, setResult] = useState<TrafficResult>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  function update(name: keyof typeof initial, value: string) {
    setValues((current) => ({ ...current, [name]: name === "scenario" ? value as Scenario : Number(value) }));
  }

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/product/traffic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, costControls: { maxEstimatedUsd: 1, maxRuntimeSeconds: values.maxRuntimeSeconds, costPerThousandEventsUsd: 0, maxEvents: values.maxEvents } }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? "Traffic run failed");
      setResult(payload.run);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Traffic run failed");
    } finally {
      setWorking(false);
    }
  }

  return <section className="panel traffic-control"><div className="section-title"><div><p className="eyebrow">Traffic controls</p><h2>Generate product activity</h2></div><span className="source-label">Capped before execution</span></div><p className="traffic-control-copy">Choose the load profile for the DailyCart product. Mock mode generates deterministic events locally; live mode sends this bounded run to the configured sample-product sidecar.</p><form onSubmit={run}><label><span><Users size={13}/> Users</span><input aria-label="Users" type="number" min="1" max="100000" value={values.userCount} onChange={(event) => update("userCount", event.target.value)} /></label><label><span><Gauge size={13}/> Spawn / second</span><input aria-label="Spawn rate per second" type="number" min="0.01" step="0.01" max="10000" value={values.spawnRatePerSecond} onChange={(event) => update("spawnRatePerSecond", event.target.value)} /></label><label><span>Duration (seconds)</span><input aria-label="Duration seconds" type="number" min="1" max="86400" value={values.durationSeconds} onChange={(event) => update("durationSeconds", event.target.value)} /></label><label><span>Scenario</span><select aria-label="Traffic scenario" value={values.scenario} onChange={(event) => update("scenario", event.target.value)}><option value="baseline">Baseline</option><option value="feature-exposure">Feature exposure</option><option value="checkout-failure">Checkout failure</option><option value="mixed">Mixed</option></select></label><label><span>Seed</span><input aria-label="Traffic seed" type="number" value={values.seed} onChange={(event) => update("seed", event.target.value)} /></label><label><span>Max events</span><input aria-label="Maximum events" type="number" min="1" max="10000000" value={values.maxEvents} onChange={(event) => update("maxEvents", event.target.value)} /></label><button className="button primary traffic-run-button" type="submit" disabled={working}><Play size={14}/>{working ? "Running…" : "Run traffic"}</button></form>{error && <p className="traffic-result error" role="alert">{error}</p>}{result && <div className="traffic-result" role="status"><b>{result.runId}</b><span>{result.eventCount.toLocaleString()} events · {result.users.toLocaleString()} users · {result.sourceMode}</span><span>{result.funnel.find((stage) => stage.stage === "checkout_completed")?.count ?? 0} completed checkouts{result.capped ? ` · capped (${result.stopReason})` : ""}</span></div>}</section>;
}
