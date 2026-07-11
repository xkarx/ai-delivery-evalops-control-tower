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
import { useState } from "react";
import type { RuntimeMode } from "@/lib/runtime-mode";

const nav = [
  { href: "/", label: "Overview", icon: CircleGauge },
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

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <Link href="/" className="brand" onClick={() => setOpen(false)}>
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
                {label === "Human review" && <em>2</em>}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="mode-badge"><span /> {runtimeMode === "live" ? "Connected mode" : "Synthetic demo"}</div>
          <p>{runtimeMode === "live" ? "Provider adapters enabled" : "No credentials required"}</p>
        </div>
      </aside>
      {open && <button className="sidebar-backdrop" onClick={() => setOpen(false)} aria-label="Close navigation" />}
      <div className="content-frame">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="environment"><Boxes size={15} /><span>DailyCart / V1 scenario</span><b>{runtimeMode === "live" ? "LIVE" : "DEMO"}</b></div>
          <div className="top-actions">
            <span className="system-status"><i /> Systems nominal</span>
            <button className="avatar" aria-label="Demo operator">KO</button>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
