"use client";

import { Download, Link2 } from "lucide-react";
import { useState } from "react";

export function LineageActions() {
  const [message, setMessage] = useState("");
  async function copy() { await navigator.clipboard.writeText(window.location.href); setMessage("Lineage link copied."); }
  return <div className="action-feedback"><button className="button secondary" onClick={() => void copy()}><Link2 size={15} /> Copy lineage link</button><a className="button primary" href="/api/lineage/export" download><Download size={15} /> Export evidence</a>{message && <small role="status">{message}</small>}</div>;
}
