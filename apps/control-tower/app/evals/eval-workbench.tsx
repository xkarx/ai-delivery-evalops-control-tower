"use client";

import { Check, Loader2, Plus, Play, Save, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

type EvalCase = { id: string; datasetVersion: string; category: string; input: Record<string, unknown>; expected: Record<string, unknown>; critical: boolean; sourceMode: string };
type CampaignResult = { weightedScore: number; status: string; releaseAllowed: boolean };

export function EvalWorkbench() {
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState("requirements");
  const [expected, setExpected] = useState('{"requiredFields":["featureId"]}');
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<CampaignResult>();

  useEffect(() => {
    void fetch("/api/evals/cases").then((response) => response.json()).then((payload: { cases?: EvalCase[] }) => setCases(payload.cases ?? []));
  }, []);

  async function saveCase() {
    setWorking(true); setMessage("Saving a versioned eval case…");
    try {
      const response = await fetch("/api/evals/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category, expected: JSON.parse(expected), input: { grader: "required-fields" }, critical: false }) });
      const payload = await response.json() as { ok?: boolean; case?: EvalCase; message?: string };
      if (!response.ok || !payload.ok || !payload.case) throw new Error(payload.message ?? "Case could not be saved.");
      setCases((current) => [...current, payload.case!]); setSelected((current) => [...current, payload.case!.id]); setMessage(`${payload.case.id} saved · ${payload.case.datasetVersion}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Case could not be saved."); } finally { setWorking(false); }
  }

  async function runCases() {
    setWorking(true); setMessage("Executing selected eval cases…");
    try {
      const response = await fetch("/api/evals/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ caseIds: selected }) });
      const payload = await response.json() as { ok?: boolean; campaign?: CampaignResult; message?: string };
      if (!response.ok || !payload.ok || !payload.campaign) throw new Error(payload.message ?? "Eval campaign failed.");
      setResult(payload.campaign); setMessage(`${payload.campaign.status} · ${payload.campaign.weightedScore}/100 · ${payload.campaign.releaseAllowed ? "release allowed" : "release blocked"}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Eval campaign failed."); } finally { setWorking(false); }
  }

  function resetForm() { setCategory("requirements"); setExpected('{"requiredFields":["featureId"]}'); }

  return <section className="panel eval-workbench">
    <div className="section-title"><div><p className="eyebrow">Author and measure</p><h2>Eval workbench</h2></div><span className="source-label">Versioned · evidence-linked</span></div>
    <p className="muted-copy">Write a case, select it, run the grader, and inspect the measured gate. Structural checks are deterministic; semantic cases use the configured model only when available.</p>
    <div className="eval-workbench-grid">
      <div>
        <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="requirements">Requirements</option><option value="regression">Regression</option><option value="grounding">Grounding</option><option value="safety">Safety</option></select></label>
        <label>Expected JSON<textarea value={expected} onChange={(event) => setExpected(event.target.value)} rows={3} /></label>
        <button className="button secondary" type="button" onClick={() => void saveCase()} disabled={working}><Save size={14} /> Save case</button>
      </div>
      <div className="eval-case-list">{cases.slice(-12).map((item) => {
        const checked = selected.includes(item.id);
        return <label key={item.id}><input type="checkbox" checked={checked} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><b>{item.id}</b><small>{item.category} · {item.datasetVersion} · {item.sourceMode}</small></span></label>;
      })}</div>
    </div>
    <div className="eval-workbench-actions">
      <button className="button primary" type="button" onClick={() => void runCases()} disabled={working || selected.length === 0}>{working ? <Loader2 size={14} className="spin" /> : <Play size={14} />} Run selected evals</button>
      <button className="button secondary" type="button" onClick={resetForm}><Plus size={14} /> New case</button>
      {message ? <span role="status">{message}</span> : null}
    </div>
    {result && <div className={`eval-workbench-result ${result.releaseAllowed ? "pass" : "blocked"}`}>{result.releaseAllowed ? <Check size={16} /> : <ShieldAlert size={16} />}<b>{result.status}</b><span>{result.weightedScore}/100</span><small>{result.releaseAllowed ? "Gate passed" : "Gate blocked until the result is corrected and approved"}</small></div>}
  </section>;
}
