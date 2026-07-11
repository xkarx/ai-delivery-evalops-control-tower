"use client";

import { Play, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DemoControls() {
  const router = useRouter();
  const [pending, setPending] = useState<"run" | "reset" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function execute(action: "run" | "reset") {
    setPending(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/demo/${action}`, { method: "POST" });
      const result = await response.json().catch(() => ({})) as { message?: string; detail?: string; partial?: boolean };
      if (!response.ok && !result.partial) throw new Error(result.detail ? `${result.message ?? "Demo action failed"} ${result.detail}` : result.message ?? "Demo action failed");
      setMessage(result.partial ? `${result.message ?? "Demo run completed partially"} ${result.detail ?? ""}` : action === "run" ? "Demo run recorded" : "Scenario reset");
      router.refresh();
    } catch {
      setMessage("Demo action failed");
    } finally {
      setPending(null);
    }
  }

  return <div className="demo-controls"><button className="button secondary" onClick={() => execute("reset")} disabled={pending !== null}><RotateCcw size={15} />{pending === "reset" ? "Resetting…" : "Reset scenario"}</button><button className="button primary" onClick={() => execute("run")} disabled={pending !== null}><Play size={16} />{pending === "run" ? "Running…" : "Run demo"}</button>{message && <span role="status">{message}</span>}</div>;
}
