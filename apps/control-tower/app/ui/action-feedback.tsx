"use client";

import { ReactNode, useState } from "react";

export function ActionFeedbackButton({ children, className = "button secondary", message = "This control is read-only in the current V1 workflow; no external write was attempted." }: { children: ReactNode; className?: string; message?: string }) {
  const [notice, setNotice] = useState("");
  return <span className="action-feedback"><button className={className} type="button" onClick={() => setNotice(message)}>{children}</button>{notice && <small role="status">{notice}</small>}</span>;
}
