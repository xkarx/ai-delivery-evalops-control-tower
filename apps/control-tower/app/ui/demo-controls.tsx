"use client";

import { Play, RotateCcw, Repeat2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DemoControls() {
  const router = useRouter();
  const [pending, setPending] = useState<"run" | "reset" | "replay" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function execute(action: "run" | "reset" | "replay") {
    setPending(action);
    setMessage(null);
    try {
      const endpoint = action === "run" ? "/api/demo/start" : `/api/demo/${action}`;
      const response = await fetch(endpoint, { method: "POST" });
      const result = await response.json().catch(() => ({})) as { message?: string; detail?: string; partial?: boolean; receipt?: { actionId: string; message: string; deepLink: string } };
      if (!response.ok && !result.partial) throw new Error(result.detail ? `${result.message ?? "Demo action failed"} ${result.detail}` : result.message ?? "Demo action failed");
      setMessage(result.partial ? `${result.message ?? "Demo run completed partially"} ${result.detail ?? ""}` : action === "run" ? `${result.receipt?.message ?? "Guided session ready"} · ${result.receipt?.actionId ?? ""}` : action === "replay" ? "Replay archived and scenario reset" : "Scenario reset");
      if (action === "run") router.push(result.receipt?.deepLink ?? "/company"); else router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Demo action failed");
    } finally {
      setPending(null);
    }
  }

  return <div className="demo-controls"><button className="button secondary" onClick={() => execute("reset")} disabled={pending !== null}><RotateCcw size={15} />{pending === "reset" ? "Resetting…" : "Reset scenario"}</button><button className="button secondary" onClick={() => execute("replay")} disabled={pending !== null}><Repeat2 size={15} />{pending === "replay" ? "Replaying…" : "Replay run"}</button><button className="button primary" onClick={() => execute("run")} disabled={pending !== null}><Play size={16} />{pending === "run" ? "Starting…" : "Start guided demo"}</button>{message && <span role="status">{message}</span>}</div>;
}
