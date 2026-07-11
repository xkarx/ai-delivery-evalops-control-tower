export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = ["passed", "healthy", "ready", "released", "approved", "succeeded", "done"].includes(status)
    ? "success"
    : ["blocked", "failed", "error", "rejected"].includes(status)
      ? "danger"
      : ["running", "in_progress", "in_delivery", "degraded"].includes(status)
        ? "info"
        : "warning";
  return <span className={`status-pill ${tone}`}><i />{label ?? status.replaceAll("_", " ")}</span>;
}
