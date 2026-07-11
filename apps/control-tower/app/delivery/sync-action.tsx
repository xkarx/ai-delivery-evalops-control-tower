"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

export function DeliverySyncAction() {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  async function sync() {
    setState("working");
    setMessage("");
    try {
      const response = await fetch("/api/delivery/linear-sync", { method: "POST" });
      const payload = await response.json() as { sync?: { records?: Array<unknown>; errors?: string[] }; message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Linear sync failed.");
      const records = payload.sync?.records?.length ?? 0;
      const errors = payload.sync?.errors?.length ?? 0;
      setState(errors ? "error" : "done");
      setMessage(`${records} ticket${records === 1 ? "" : "s"} synced${errors ? ` · ${errors} error${errors === 1 ? "" : "s"}` : ""}`);
      if (!errors) window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Linear sync failed.");
    }
  }
  return <div className="delivery-sync-action"><button className="button primary" type="button" onClick={sync} disabled={state === "working"}><RefreshCw size={15} className={state === "working" ? "spin" : ""} />{state === "working" ? "Syncing…" : "Sync to Linear"}</button>{message && <small role={state === "error" ? "alert" : "status"} className={state === "error" ? "action-error" : "action-success"}>{message}</small>}</div>;
}
