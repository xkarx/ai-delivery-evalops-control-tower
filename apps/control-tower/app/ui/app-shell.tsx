"use client";

import {
  Activity,
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  CircleGauge,
  GitBranch,
  HeartPulse,
  Layers3,
  Loader2,
  LockKeyhole,
  Menu,
  Network,
  Rocket,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Users,
  X
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { RuntimeMode } from "@/lib/runtime-mode";

const nav = [
  { href: "/demo", label: "Demo cockpit", icon: CircleGauge },
  { href: "/product", label: "Customer product", icon: ShoppingBag },
  { href: "/features", label: "Feature portfolio", icon: Layers3 },
  { href: "/delivery", label: "Delivery roadmap", icon: GitBranch },
  { href: "/lineage", label: "Feature lineage", icon: GitBranch },
  { href: "/runs", label: "Agent runs", icon: Activity },
  { href: "/evals", label: "Eval campaigns", icon: ShieldCheck },
  { href: "/reviews", label: "Human review", icon: Users },
  { href: "/releases", label: "Deployments", icon: Rocket },
  { href: "/incidents", label: "Incidents", icon: HeartPulse },
  { href: "/analytics", label: "Product analytics", icon: BarChart3 },
  { href: "/company", label: "Company data", icon: Building2 },
  { href: "/integrations", label: "Integrations", icon: Network },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children, runtimeMode }: { children: React.ReactNode; runtimeMode: RuntimeMode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [operatorState, setOperatorState] = useState<"idle" | "submitting" | "authorized" | "error">("idle");
  const [operatorMessage, setOperatorMessage] = useState("");

  useEffect(() => {
    const openOperator = () => setOperatorOpen(true);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOperatorOpen(false);
    };
    window.addEventListener("dailycart:open-operator", openOperator);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("dailycart:open-operator", openOperator);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function unlockOperator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (runtimeMode !== "live") {
      setOperatorState("authorized");
      setOperatorMessage("Deterministic demo actions are already available.");
      return;
    }
    setOperatorState("submitting");
    setOperatorMessage("");
    try {
      const response = await fetch("/api/operator/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode })
      });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? "Operator access could not be unlocked.");
      setOperatorState("authorized");
      setOperatorMessage(payload.message ?? "Live actions unlocked for this browser session.");
      setPasscode("");
      window.dispatchEvent(new CustomEvent("dailycart:operator-auth"));
    } catch (error) {
      setOperatorState("error");
      setOperatorMessage(error instanceof Error ? error.message : "Operator access could not be unlocked.");
    }
  }

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <Link href="/demo" className="brand" onClick={() => setOpen(false)}>
            <span className="brand-mark"><ShoppingCart size={18} /></span>
            <span><b>DailyCart</b><small>Delivery OS</small></span>
          </Link>
          <button className="icon-button mobile-only" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20} /></button>
        </div>
        <div className="workspace-switcher">
          <span className="company-avatar">DC</span>
          <span><b>DailyCart</b><small>Synthetic company</small></span>
          <ChevronDown size={15} />
        </div>
        <nav aria-label="Primary navigation">
          <p className="nav-label">Control tower</p>
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={active ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}>
                <Icon size={17} /><span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="mode-badge"><span /> {runtimeMode === "live" ? "Synthetic inputs · live delivery" : "Deterministic demo"}</div>
          <p>{runtimeMode === "live" ? "Writes require operator access" : "No credentials required"}</p>
        </div>
      </aside>
      {open && <button className="sidebar-backdrop" onClick={() => setOpen(false)} aria-label="Close navigation" />}
      <div className="content-frame">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="environment"><Boxes size={15} /><span>DailyCart / V1 scenario</span><b>{runtimeMode === "live" ? "SYNTHETIC INPUTS · LIVE DELIVERY" : "DETERMINISTIC DEMO"}</b></div>
          <div className="top-actions">
            <Link className="system-status" href="/integrations"><i /> Verify providers</Link>
            <div className="operator-access">
              <button
                className={`operator-trigger ${operatorState === "authorized" ? "authorized" : ""}`}
                aria-label="Demo operator"
                aria-expanded={operatorOpen}
                aria-controls="operator-access-panel"
                onClick={() => setOperatorOpen((value) => !value)}
              >{operatorState === "authorized" ? <ShieldCheck size={15} /> : <LockKeyhole size={15} />}<span>{operatorState === "authorized" ? "Operator unlocked" : "Operator access"}</span></button>
              {operatorOpen && <section id="operator-access-panel" className="operator-popover" role="dialog" aria-label="Operator access">
                <header>
                  <span><LockKeyhole size={16} /></span>
                  <div><b>Operator access</b><small>Protects live provider writes and model credits.</small></div>
                  <button className="icon-button" type="button" onClick={() => setOperatorOpen(false)} aria-label="Close operator access"><X size={16} /></button>
                </header>
                <form onSubmit={unlockOperator}>
                  <label htmlFor="operator-passcode">Operator passcode</label>
                  <input
                    id="operator-passcode"
                    type="password"
                    value={passcode}
                    onChange={(event) => setPasscode(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Enter deployment passcode"
                    disabled={operatorState === "submitting" || operatorState === "authorized"}
                    required={runtimeMode === "live"}
                    autoFocus
                  />
                  <button className="button primary" type="submit" disabled={operatorState === "submitting" || operatorState === "authorized"}>
                    {operatorState === "submitting" && <Loader2 className="spin" size={14} />}
                    {operatorState === "authorized" ? "Unlocked" : operatorState === "submitting" ? "Unlocking…" : "Unlock live actions"}
                  </button>
                </form>
                {operatorMessage && <p className={operatorState === "error" ? "error" : "success"} role="status">{operatorMessage}</p>}
                <small className="operator-privacy">The passcode is sent only to this deployment and is never displayed or stored in the page.</small>
              </section>}
            </div>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
