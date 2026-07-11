"use client";

import { RefreshCcw } from "lucide-react";
import { useState } from "react";

export function TrafficAction() {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  async function generateTraffic() {
    setState("working");
    setMessage("");
    try {
      const response = await fetch("/api/product/traffic", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? "Traffic run failed");
      setState("done");
      setMessage(`${payload.run.eventCount} events generated · ${payload.run.sourceMode}`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Traffic run failed");
    }
  }
  return <div className="traffic-action"><button className="button primary" onClick={generateTraffic} disabled={state === "working"}><RefreshCcw size={15} /> {state === "working" ? "Generating…" : "Generate traffic"}</button>{message && <small className={state === "error" ? "action-error" : "action-success"}>{message}</small>}</div>;
}
