"use client";

import { Play, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CompanyActions() {
  const router = useRouter();
  const [working, setWorking] = useState<"validate" | "regenerate" | "analyze" | null>(null);
  const [message, setMessage] = useState("");
  async function action(kind: "validate" | "regenerate" | "analyze") {
    setWorking(kind); setMessage("");
    try {
      const endpoint = kind === "validate" ? "/api/company/validate" : kind === "regenerate" ? "/api/demo/reset" : "/api/workflow/actions";
      const response = await fetch(endpoint, { method: kind === "validate" ? "GET" : "POST", headers: kind === "analyze" ? { "content-type": "application/json" } : undefined, body: kind === "analyze" ? JSON.stringify({ command: "analyze" }) : undefined });
      const payload = await response.json() as { ok?: boolean; message?: string; detail?: string; actionId?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.detail ?? payload.message ?? `${kind} failed.`);
      setMessage(kind === "validate" ? payload.message ?? "References validated." : kind === "regenerate" ? "A fresh deterministic context version is ready." : `${payload.actionId ?? "Analysis"} queued. Open Agent runs to follow every step.`);
      if (kind === "analyze") router.push("/runs"); else router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : `${kind} failed.`); }
    finally { setWorking(null); }
  }
  return <div className="company-actions"><button className="button secondary" onClick={() => void action("validate")} disabled={Boolean(working)}><ShieldCheck size={15} />{working === "validate" ? "Validating…" : "Validate references"}</button><button className="button secondary" onClick={() => void action("regenerate")} disabled={Boolean(working)}><RefreshCw size={15} />{working === "regenerate" ? "Regenerating…" : "Regenerate seed"}</button><button className="button primary" onClick={() => void action("analyze")} disabled={Boolean(working)}><Play size={15} />{working === "analyze" ? "Analyzing…" : "Analyze opportunities"}</button>{message && <small role="status">{message}</small>}</div>;
}
