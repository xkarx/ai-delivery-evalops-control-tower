import { Activity, MousePointerClick, TrendingUp, Users } from "lucide-react";
import { PageHeading } from "@/app/ui/page-heading";
import { loadDemoState } from "@/lib/load-demo-state";
import { loadProductEvents } from "@/lib/load-product-events";
import { TrafficControl } from "./traffic-control";
import { getRuntimeMode } from "@/lib/runtime-mode";

const days = [42, 49, 46, 58, 53, 67, 72, 69, 78, 82, 89, 94, 91, 100];

export default async function AnalyticsPage() {
  const data = await loadDemoState();
  const productEvents = await loadProductEvents();
  const runtimeMode = getRuntimeMode();
  const completed = data.funnel.at(-1)?.count ?? 0;
  const sessions = data.funnel[0]?.count ?? 1;
  return (
    <div className="page-container">
      <PageHeading eyebrow="Product intelligence" title="Product analytics" description="Deterministic traffic, persistent customers, funnel behavior, exposure, and release outcomes." />
      <section className="analytics-strip"><div><span className="metric-icon violet"><Users size={19} /></span><div><p>Sessions</p><b>{sessions.toLocaleString()}</b><small>+12.4% vs baseline</small></div></div><div><span className="metric-icon blue"><MousePointerClick size={19} /></span><div><p>Checkout starts</p><b>{data.funnel.at(-2)?.count.toLocaleString()}</b><small>{Math.round(((data.funnel.at(-2)?.count ?? 0) / sessions) * 100)}% of sessions</small></div></div><div><span className="metric-icon green"><TrendingUp size={19} /></span><div><p>Completion</p><b>{Math.round((completed / sessions) * 100)}%</b><small>+6.8 pp exposed cohort</small></div></div><div><span className="metric-icon amber"><Activity size={19} /></span><div><p>Events observed</p><b>{productEvents.length.toLocaleString()}</b><small>{productEvents.length ? "From the customer product" : "No local events yet"}</small></div></div></section>
      <TrafficControl />
      <div className="analytics-layout"><section className="panel timeseries-card"><div className="section-title"><div><p className="eyebrow">Adoption trend</p><h2>Recovery success</h2></div><span className="source-label">{runtimeMode === "live" ? "Live product events" : "Simulated events"}</span></div><div className="timeseries"><div className="y-labels"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div className="plot"><div className="grid-lines"><i/><i/><i/><i/></div><svg viewBox="0 0 520 180" preserveAspectRatio="none" aria-label="Recovery success trend"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0f766e" stopOpacity=".22"/><stop offset="1" stopColor="#0f766e" stopOpacity="0"/></linearGradient></defs><path d={`M ${days.map((v, i) => `${(i / (days.length - 1)) * 520},${180 - (v / 100) * 160}`).join(" L ")} L 520,180 L 0,180 Z`} fill="url(#area)"/><polyline points={days.map((v, i) => `${(i / (days.length - 1)) * 520},${180 - (v / 100) * 160}`).join(" ")} fill="none" stroke="#0f766e" strokeWidth="3" vectorEffect="non-scaling-stroke"/></svg><div className="release-marker"><span>DEP-0001</span></div></div></div><div className="chart-footer"><span>Jun 27</span><span>Jul 4</span><span>Jul 10</span></div></section><section className="panel segment-card"><div className="section-title"><div><p className="eyebrow">Experiment</p><h2>Exposed vs baseline</h2></div></div><div className="segment-bars"><div><span>Recovery guidance</span><b>79%</b><div><i style={{ width: "79%" }}/></div></div><div><span>Baseline</span><b>72%</b><div><i style={{ width: "72%" }}/></div></div></div><div className="uplift"><TrendingUp size={19}/><div><b>+6.8 percentage points</b><p>95% interval: +3.1 to +10.2 · {runtimeMode === "live" ? "live capture" : "simulated"}</p></div></div></section></div>
      <section className="panel funnel-detail"><div className="section-title"><div><p className="eyebrow">Primary funnel</p><h2>Session to checkout completion</h2></div><span className="source-label">Seed {data.seed}</span></div><div className="funnel-visual">{data.funnel.map((stage, index) => <div style={{ width: `${100 - index * 11}%` }} key={stage.stage}><span>{stage.stage}</span><b>{stage.count.toLocaleString()}</b><small>{index === 0 ? "100%" : `${Math.round((stage.count / sessions) * 100)}%`}</small></div>)}</div></section>
    </div>
  );
}
