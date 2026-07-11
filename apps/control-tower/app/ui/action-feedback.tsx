"use client";

import { ReactNode, useEffect, useId, useState } from "react";

export function ActionFeedbackButton({ children, className = "button secondary", message = "This control is read-only in the current V1 workflow; no external write was attempted." }: { children: ReactNode; className?: string; message?: string }) {
  const [notice, setNotice] = useState("");
  const noticeId = useId();
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  return <span className="action-feedback"><button className={className} type="button" aria-describedby={notice ? noticeId : undefined} onClick={() => setNotice(message)}>{children}</button>{notice && <small id={noticeId} className="action-notice" role="status" aria-live="polite">{notice}</small>}</span>;
}
