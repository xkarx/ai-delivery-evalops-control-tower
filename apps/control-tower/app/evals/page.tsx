import { ArrowRight, CheckCircle2, ExternalLink, FlaskConical, Scale, ShieldAlert, XCircle } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/app/ui/page-heading";
import { SessionStageBanner } from "@/app/ui/session-stage-banner";
import { StatusPill } from "@/app/ui/status-pill";
import { readArtifact } from "@/lib/durable-artifacts";
import { serverSessionId } from "@/lib/demo-session";
import { EvalWorkbench } from "./eval-workbench";

export const dynamic = "force-dynamic";

type PreviewEval = { featureId: string; targetUrl: string; passed: boolean; score: number; evaluatedAt?: string; githubRunUrl?: string; sourceMode?: string; checks: Array<{ name: string; passed: boolean; detail: string }> };
type AgentEval = { id?: string; runId: string; criterion: string; grader?: string; score: number; passed: boolean; rationale: string; mode: string };

const sampleMatrix = [
  { criterion: "Build + types", v1: 100, v2: 100, grader: "Deterministic" },
  { criterion: "Evidence grounding", v1: 92, v2: 92, grader: "Stored sample judge" },
  { criterion: "Keyboard focus", v1: 0, v2: 100, grader: "Deterministic" },
  { criterion: "Requirement coverage", v1: 88, v2: 96, grader: "Deterministic" }
];

export default async function EvalsPage() {
  const sessionId = await serverSessionId();
  const [previewArtifact, reviews] = sessionId ? await Promise.all([
    readArtifact<{ evaluations?: PreviewEval[]; allPassed?: boolean; errorCode?: string; errorDetail?: string }>("workflowPreviewEval", sessionId),
    readArtifact<{ agentEvals?: AgentEval[] }>("workflowReviews", sessionId)
  ]) : [undefined, undefined];
  const previewEvals = previewArtifact?.evaluations ?? [];
  const agentEvals = reviews?.agentEvals ?? [];
  const modelJudgeCount = agentEvals.filter((evaluation) => /model|openai/i.test(`${evaluation.mode} ${evaluation.grader ?? ""}`)).length;

  return <div className="page-container">
    <PageHeading eyebrow="Quality operations" title="Eval campaigns" description="Current-session agent evaluations, exact preview checks, and an optional versioned workbench." actions={<><a className="button secondary" href="#eval-workbench">New case</a><a className="button primary" href="#eval-workbench"><FlaskConical size={15} /> Run selected evals</a></>} />
    <SessionStageBanner stage="preview_evals" />

    <section className="eval-section-heading"><div><p className="eyebrow">1 · Agent evaluations</p><h2>Are the AI outputs grounded and complete?</h2><p>These checks evaluate citations, grounding, specialist coverage, planning, and policy compliance for this signed session.</p></div><StatusPill status={agentEvals.length && agentEvals.every((item) => item.passed) ? "passed" : agentEvals.length ? "failed" : "pending"} /></section>
    <section className="panel live-eval-list">
      {!agentEvals.length ? <div className="integrity-empty"><h3>No live agent evaluations yet</h3><p>They appear after the model-backed analysis runs. No sample result is substituted.</p></div> : agentEvals.map((evaluation) => <article key={evaluation.id ?? `${evaluation.runId}-${evaluation.criterion}`}><StatusPill status={evaluation.passed ? "passed" : "failed"} /><div><b>{evaluation.criterion}</b><p>{evaluation.rationale}</p><small>{evaluation.runId} · {evaluation.score}/100 · {/model|openai/i.test(`${evaluation.mode} ${evaluation.grader ?? ""}`) ? "Actual model judge" : "Deterministic grader"}</small></div></article>)}
    </section>

    <section className="eval-section-heading"><div><p className="eyebrow">2 · Product preview evaluations</p><h2>Did the exact preview commit satisfy release checks?</h2><p>Every result is attached to its evaluated URL, commit workflow, browser checks, and release-blocking status.</p></div><StatusPill status={previewEvals.length && previewArtifact?.allPassed ? "passed" : previewEvals.length ? "failed" : "pending"} /></section>
    <div className="preview-eval-grid">
      {!previewEvals.length ? <section className="panel integrity-empty"><h3>No preview evaluation in this session yet</h3><p>Approve a feature and wait for GitHub and Vercel builds. Static EVAL-0001/EVAL-0002 examples are kept below only as samples.</p></section> : previewEvals.map((evaluation) => <article className={`panel preview-eval-card ${evaluation.passed ? "passed" : "failed"}`} key={`${evaluation.featureId}-${evaluation.targetUrl}`}><header><div><p className="eyebrow">{evaluation.featureId}</p><h2>{evaluation.passed ? "Critical checks passed" : "Release blocked"}</h2></div><strong>{evaluation.score}/100</strong></header><div>{evaluation.checks.map((check) => <p key={check.name}>{check.passed ? <CheckCircle2 size={15} /> : <XCircle size={15} />}<span><b>{check.name}</b><small>{check.detail}</small></span></p>)}</div><footer><a href={evaluation.targetUrl} target="_blank" rel="noreferrer">Open evaluated preview <ExternalLink size={11} /></a>{evaluation.githubRunUrl && <a href={evaluation.githubRunUrl} target="_blank" rel="noreferrer">Open exact GitHub Actions run <ExternalLink size={11} /></a>}</footer></article>)}
    </div>
    {previewArtifact?.errorCode && <div className="matrix-note"><ShieldAlert size={16} /><p><b>{previewArtifact.errorCode}:</b> {previewArtifact.errorDetail}</p></div>}

    <section className="panel eval-calibration-summary"><Scale size={22} /><div><p className="eyebrow">Judge truth</p><h2>{modelJudgeCount ? `${modelJudgeCount} actual model-judge result${modelJudgeCount === 1 ? "" : "s"}` : "No model judge recorded in this session"}</h2><p>Only persisted model invocations are labelled AI judge. All other criteria are labelled deterministic.</p></div><Link href="/reviews">Open human decisions <ArrowRight size={14} /></Link></section>

    <details className="panel sample-eval-panel"><summary>View sample focus-restoration regression (not part of this live session)</summary><div className="eval-matrix"><div className="matrix-head"><span>Criterion</span><span>Sample V1</span><span>Sample V2</span><span>Grader</span></div>{sampleMatrix.map((row) => <div className="matrix-row" key={row.criterion}><b>{row.criterion}</b><span className={row.v1 < 85 ? "score-cell fail" : "score-cell pass"}>{row.v1}</span><span className={row.v2 < 85 ? "score-cell fail" : "score-cell pass"}>{row.v2}</span><small>{row.grader}</small></div>)}</div></details>

    <section className="eval-section-heading" id="eval-workbench"><div><p className="eyebrow">3 · Eval workbench</p><h2>Author and run optional versioned cases</h2><p>This workbench is separate from the active release campaign.</p></div></section>
    <EvalWorkbench />
  </div>;
}
