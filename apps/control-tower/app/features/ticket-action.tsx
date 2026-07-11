"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";

export function TicketAction({ featureId, title, description }: { featureId: string; title: string; description: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [label, setLabel] = useState("Create delivery ticket");
  async function createTicket() {
    setState("working");
    try {
      const response = await fetch("/api/delivery/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ featureId, title, description }) });
      const result = await response.json() as { ticket?: { identifier?: string; sourceMode?: string }; message?: string };
      if (!response.ok || !result.ticket) throw new Error(result.message);
      setLabel(`${result.ticket.identifier} created · ${result.ticket.sourceMode}`);
      setState("done");
    } catch {
      setLabel("Could not create ticket");
      setState("error");
    }
  }
  return <button className={`card-link ticket-action ${state}`} onClick={createTicket} disabled={state === "working" || state === "done"}>{state === "done" ? <Check size={14} /> : <Plus size={14} />}{state === "working" ? "Creating…" : label}</button>;
}
