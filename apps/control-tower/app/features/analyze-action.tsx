"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AnalyzeAction() {
  const router = useRouter(); const [working, setWorking] = useState(false); const [message, setMessage] = useState("");
  async function run() {
    setWorking(true); setMessage("");
    try {
      const response = await fetch("/api/workflow/run", { method: "POST" });
      const payload = await response.json() as { ok?: boolean; detail?: string; message?: string; workflow?: { featureTitle?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.detail ?? payload.message ?? "PM analysis failed.");
      setMessage(`${payload.workflow?.featureTitle ?? "Ranked opportunities"} ready for review.`); router.push("/runs");
    } catch (error) { setMessage(error instanceof Error ? error.message : "PM analysis failed."); }
    finally { setWorking(false); }
  }
  return <div className="action-feedback"><button className="button primary" onClick={() => void run()} disabled={working}><Play size={15} />{working ? "Analyzing…" : "Start PM analysis"}</button>{message && <small role="status">{message}</small>}</div>;
}
