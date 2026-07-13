"use client";

import { ArrowRight, CircleDot } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DemoStage } from "@dailycart/schemas";

const labels: Record<DemoStage, string> = {
  problem_context: "Problem and context",
  agent_analysis: "Agent analysis",
  ranked_opportunities: "Ranked opportunities",
  feature_approval: "Feature approval",
  plan_build: "Plan and build",
  preview_evals: "Preview evaluations",
  release_approval: "Release approval",
  deployment_report: "Deployment report",
  outcomes_learning: "Outcomes and learning"
};

type Status = { session?: { sessionId: string } | null; activeStage?: DemoStage; phase?: string };

export function SessionStageBanner({ stage }: { stage: DemoStage }) {
  const [status, setStatus] = useState<Status>();
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const response = await fetch("/api/workflow/status", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as Status;
      if (alive) setStatus(payload);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  if (!status?.session) return <section className="session-stage-banner empty"><div><CircleDot size={15} /><span>No live demo session is active.</span></div><Link href="/demo">Start in the demo cockpit <ArrowRight size={13} /></Link></section>;
  const reviewing = status.activeStage !== stage;
  return <section className={`session-stage-banner ${reviewing ? "reviewing" : "live"}`}>
    <div><CircleDot size={15} /><span>{reviewing ? <>Reviewing <b>{labels[stage]}</b>. The live workflow is at <b>{labels[status.activeStage ?? "problem_context"]}</b>.</> : <>This is the live stage: <b>{labels[stage]}</b>.</>}</span></div>
    <Link href="/demo">{reviewing ? "Return to live stage" : "Open demo cockpit"} <ArrowRight size={13} /></Link>
  </section>;
}
