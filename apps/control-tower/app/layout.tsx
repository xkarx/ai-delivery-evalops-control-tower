import type { Metadata } from "next";
import { AppShell } from "@/app/ui/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "DailyCart · Delivery Control Tower",
  description: "Evidence-linked AI product delivery and EvalOps control tower"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
