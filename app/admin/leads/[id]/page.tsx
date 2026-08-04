import fs from "fs";
import ConversationThread from "../components/conversation-thread";
import LeadSidebar from "../components/lead-sidebar";
import { getLead, getLeadMessages, getLeadNotes, getLeadTimeline } from "./data";
import type { ConversationMessage } from "../components/conversation-thread";
import type { ConversationNote } from "../components/conversation-thread";
import type { TimelineSystemEvent } from "../components/conversation-thread";
import { crm } from "@/lib/admin-ui";

function buildActionBrief(lead: {
  opportunity_score: number | null;
  business_viability: number | null;
  web_pain: number | null;
  website_url?: string | null;
  google_review_count?: number | null;
  site_grade?: string | null;
}) {
  const opp = lead.opportunity_score ?? 0;
  const viability = lead.business_viability ?? 0;
  const pain = lead.web_pain ?? 0;
  const reviews = lead.google_review_count ?? 0;
  const grade = lead.site_grade;

  const meaning: string[] = [];
  if (!lead.website_url || grade === "F") {
    meaning.push("Website is missing or unusable — ideal for a simple affordable rebuild.");
  } else if (pain >= 70 || grade === "C") {
    meaning.push("Site looks bad enough that a cheaper rebuild beats incremental tweaks.");
  }
  if (viability >= 55) {
    meaning.push("Business looks real enough to pay a practical package (not a vanity agency build).");
  }
  if (reviews >= 30) {
    meaning.push("Local demand exists — a clearer site + menu/reservations should convert better.");
  }
  if (!meaning.length) {
    meaning.push("Not a top rebuild target — park it and work worse sites first.");
  }

  let priority = "Low";
  if (grade === "F" || pain >= 80 || opp >= 55) priority = "High";
  else if (grade === "C" || pain >= 60 || opp >= 35) priority = "Medium";

  let nextStep =
    "Skip or park — better rebuild targets exist. Offer hourly polish only if they reach out.";
  if (!lead.website_url || grade === "F") {
    nextStep =
      "Open with a flat affordable rebuild (home, menu, hours, map, contact) and clear hourly rate for updates after launch.";
  } else if (pain >= 70 || grade === "C") {
    nextStep =
      "Call out 2–3 specific site problems, quote a rebuild for less than agency rates, then hourly for ongoing tweaks.";
  } else if (pain >= 45) {
    nextStep =
      "Light touch: ask if they want a scoped refresh; don't oversell a full rebuild unless they hate the current site.";
  }

  return { priority, meaning, nextStep };
}

export default async function LeadOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) return null;

  const [timeline, messages, notes] = await Promise.all([
    getLeadTimeline(id),
    getLeadMessages(id),
    getLeadNotes(id),
  ]);

  const hasScreenshot = Boolean(
    lead.current_screenshot_url && fs.existsSync(lead.current_screenshot_url)
  );
  const brief = buildActionBrief(lead);

  return (
    <div className={crm.workGrid}>
      <div className={crm.workMain}>
        <ConversationThread
          leadId={lead.id}
          defaultToEmail={lead.contact_email ?? null}
          initialMessages={messages as ConversationMessage[]}
          initialNotes={notes as ConversationNote[]}
          initialEvents={timeline as TimelineSystemEvent[]}
          discoveredAt={lead.created_at}
          fillHeight
        />
      </div>

      <aside className={crm.workSidebar}>
        <LeadSidebar lead={lead} brief={brief} hasScreenshot={hasScreenshot} />
      </aside>
    </div>
  );
}
