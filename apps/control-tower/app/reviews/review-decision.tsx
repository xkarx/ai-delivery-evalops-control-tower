"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReviewDecision({ approvalId, stage }: { approvalId: string; stage: string }) {
  const [rationale, setRationale] = useState(""); const [working, setWorking] = useState(false); const [message, setMessage] = useState(""); const router = useRouter();
  async function decide(status: "approved" | "rejected") {
    if (!rationale.trim()) { setMessage("A decision rationale is required."); return; }
    setWorking(true); setMessage("");
    try {
      const durableCommand = stage === "feature" ? "approve_feature" : "approve_release";
      const endpoint = status === "rejected" ? "/api/workflow/reject" : "/api/workflow/actions";
      const body = status === "rejected" ? { approvalId, reviewer: "operator", rationale } : { command: durableCommand, rationale };
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { ok?: boolean; message?: string; detail?: string; actionId?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.detail ?? payload.message ?? "Decision failed.");
      if (status === "approved" && payload.actionId) {
        setMessage(`${approvalId} approved. ${payload.actionId} is now running.`);
        router.push(`/runs?action=${payload.actionId}`);
      } else {
        setMessage(`${approvalId} ${status}.`); router.refresh();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Decision failed."); }
    finally { setWorking(false); }
  }
  return <><label>Decision rationale<textarea value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Required for approval or rejection" /></label><div className="review-actions"><button className="reject" onClick={() => void decide("rejected")} disabled={working}><X size={15} /> Reject</button><button className="approve" onClick={() => void decide("approved")} disabled={working}><Check size={15} /> Approve {stage}</button></div>{message && <small role="status">{message}</small>}</>;
}
