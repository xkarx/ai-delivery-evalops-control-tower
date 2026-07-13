"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import type { ProviderActivity } from "@dailycart/schemas";

export function DeliveryProviderActivity() {
  const [activity, setActivity] = useState<ProviderActivity[]>([]);
  useEffect(() => { const refresh = async () => { const response = await fetch("/api/workflow/status", { cache: "no-store" }); if (!response.ok) return; const payload = await response.json() as { providerActivity?: ProviderActivity[] }; setActivity(payload.providerActivity ?? []); }; void refresh(); const timer = window.setInterval(() => void refresh(), 2_000); return () => window.clearInterval(timer); }, []);
  return <section className="panel provider-activity" id="provider-activity"><div className="section-title"><div><p className="eyebrow">External delivery proof</p><h2>Live provider activity</h2></div></div><div className="provider-activity-grid">{activity.length ? activity.map((item) => { const url = item.artifactUrl ?? item.dashboardUrl; return <article key={`${item.provider}-${item.kind}-${item.externalId ?? item.label}`} className={item.status}><span className="provider-monogram">{item.provider.slice(0, 2).toUpperCase()}</span><div><small>{item.provider} · {item.kind}</small><b>{item.label}</b>{url ? <a href={url} target="_blank" rel="noreferrer">Open provider record <ExternalLink size={10} /></a> : <span className="provider-pending">{item.status === "unavailable" ? item.error : <><Loader2 size={10} className="spin" /> Creating external record…</>}</span>}</div></article>; }) : <article><Loader2 size={16} className="spin" /><div><b>Waiting for provider actions</b><p>External links appear here as Linear, Slack, GitHub, Vercel, and observability records are created.</p></div></article>}</div></section>;
}
