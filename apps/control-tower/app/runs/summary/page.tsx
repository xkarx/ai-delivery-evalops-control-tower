import { PageHeading } from "@/app/ui/page-heading";
import { SummaryClient } from "./summary-client";

export const dynamic = "force-dynamic";

export default function DeliverySummaryPage() {
  return <div className="page-container"><PageHeading eyebrow="Delivery report" title="What the workflow delivered" description="One inspectable record of agents, human decisions, product builds, evaluations, provider actions, cost, and outcomes." /><SummaryClient /></div>;
}
