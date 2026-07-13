"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import type { ProviderActivity } from "@dailycart/schemas";

type Packet = {
  kind: "feature" | "release";
  evidenceCount?: number;
  agents?: Array<{ runId: string; role: string; skillId?: string; status: string }>;
  recommendations?: Array<{ id: string; title: string; score?: number; confidence?: number; problem?: string }>;
  agentEvals?: Array<{ runId: string; criterion: string; score: number; passed: boolean; rationale: string; mode: string }>;
  risks?: string[];
  builds?: Array<{ featureId: string; commitSha: string; deploymentUrl: string; pullRequestUrl: string }>;
  evaluations?: Array<{ featureId: string; score: number; passed: boolean; targetUrl: string; checks: Array<{ name: string; passed: boolean; detail: string }> }>;
  providers?: ProviderActivity[];
  errors?: string[];
};

export function ApprovalPacket() {
  const [packet, setPacket] = useState<Packet>();
  const [phase, setPhase] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/workflow/status", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { approvalPacket?: Packet; phase?: string };
    setPacket(payload.approvalPacket); setPhase(payload.phase ?? "");
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 2_000); return () => window.clearInterval(timer); }, [refresh]);

  if (!packet) return <section className="panel approval-packet empty"><Loader2 size={16} /><div><b>Approval packet is not active</b><p>The packet appears here when the workflow reaches a human feature or release decision.</p></div></section>;
  const links = packet.providers?.filter((item) => item.artifactUrl || item.dashboardUrl) ?? [];
  return <section className="panel approval-packet" aria-label={`${packet.kind} approval packet`}>
    <header><div><p className="eyebrow">Decision packet</p><h2>{packet.kind === "feature" ? "Feature approval evidence" : "Release approval evidence"}</h2></div><span className="source-label"><ShieldCheck size={12} /> {phase.replaceAll("_", " ")}</span></header>
    {packet.kind === "feature" ? <>
      <div className="packet-summary"><div><small>Evidence retrieved</small><b>{packet.evidenceCount ?? 0}</b></div><div><small>Agents and skills</small><b>{packet.agents?.length ?? 0}</b></div><div><small>Output evals</small><b>{packet.agentEvals?.filter((item) => item.passed).length ?? 0}/{packet.agentEvals?.length ?? 0}</b></div><div><small>Known risks</small><b>{packet.risks?.length ?? 0}</b></div></div>
      <div className="packet-columns"><div><h3>Agent work</h3>{packet.agents?.map((agent) => <article key={agent.runId}><b>{agent.role}</b><span>{agent.skillId ?? "role contract"} · {agent.runId}</span></article>)}</div><div><h3>Ranked recommendations</h3>{packet.recommendations?.map((item) => <article key={item.id}><b>{item.title}</b><span>{item.id}{item.score ? ` · ${item.score}/100` : ""}</span><p>{item.problem}</p></article>)}</div></div>
      {packet.risks?.length ? <div className="packet-warnings"><b>Risks and unresolved conflicts</b>{packet.risks.map((risk) => <p key={risk}>• {risk}</p>)}</div> : null}
    </> : <>
      <div className="packet-columns"><div><h3>Product builds</h3>{packet.builds?.map((build) => <article key={build.featureId}><b>{build.featureId} · {build.commitSha.slice(0, 7)}</b><span><a href={build.pullRequestUrl} target="_blank" rel="noreferrer">GitHub PR <ExternalLink size={10} /></a><a href={build.deploymentUrl} target="_blank" rel="noreferrer">Preview <ExternalLink size={10} /></a></span></article>)}</div><div><h3>Preview evaluations</h3>{packet.evaluations?.map((evaluation) => <article key={evaluation.featureId} className={evaluation.passed ? "passed" : "failed"}><b>{evaluation.featureId} · {evaluation.score}/100</b><span>{evaluation.passed ? "Critical checks passed" : "Release blocked"}</span><a href={evaluation.targetUrl} target="_blank" rel="noreferrer">Evaluated target <ExternalLink size={10} /></a></article>)}</div></div>
      {links.length ? <div className="packet-provider-links"><b>External provider proof</b>{links.map((item) => <a key={`${item.provider}-${item.kind}-${item.label}`} href={item.artifactUrl ?? item.dashboardUrl} target="_blank" rel="noreferrer">{item.label}<span>{item.provider} · {item.status}</span><ExternalLink size={10} /></a>)}</div> : null}
      {packet.errors?.length ? <div className="packet-warnings"><b>Partial failures</b>{packet.errors.map((error) => <p key={error}>{error}</p>)}</div> : null}
    </>}
  </section>;
}
