import { Bell, CircleDollarSign, KeyRound, LockKeyhole, SlidersHorizontal } from "lucide-react";
import { PageHeading } from "@/app/ui/page-heading";
import { loadDemoState } from "@/lib/load-demo-state";
import { getRuntimeMode } from "@/lib/runtime-mode";

export default async function SettingsPage() {
  const data = await loadDemoState();
  const runtimeMode = getRuntimeMode();
  return (
    <div className="page-container settings-page">
      <PageHeading eyebrow="Configuration" title="Settings" description="The effective server-side runtime and release policy. Sensitive changes are made through the deployment secret store, not this browser." />
      <div className="settings-layout"><aside className="settings-nav panel" aria-label="Configuration sections"><span className="active"><SlidersHorizontal size={15}/> General</span><span><LockKeyhole size={15}/> Release policy</span><span><CircleDollarSign size={15}/> Cost controls</span><span><Bell size={15}/> Notifications</span><span><KeyRound size={15}/> Credentials</span></aside><section className="settings-content"><article className="panel settings-section"><div className="section-title"><div><p className="eyebrow">Runtime</p><h2>Effective deployment configuration</h2></div></div><dl className="settings-values"><div><dt>Demo mode</dt><dd>synthetic</dd></div><div><dt>Integration mode</dt><dd>{runtimeMode}</dd></div><div><dt>Synthetic data seed</dt><dd>{data.seed}</dd></div></dl></article><article className="panel settings-section"><div className="section-title"><div><p className="eyebrow">Release safety</p><h2>Gate policy</h2></div></div><dl className="settings-values"><div><dt>Weighted score threshold</dt><dd>85</dd></div><div><dt>Critical deterministic failures</dt><dd>Block release</dd></div><div><dt>Human release approval</dt><dd>Required</dd></div></dl></article><article className="panel settings-section credential-safety"><LockKeyhole size={21}/><div><h2>Credentials stay outside application state</h2><p>Use provider secret stores or deployment environment variables. This interface shows configuration presence only and never returns secret values.</p></div></article></section></div>
    </div>
  );
}
