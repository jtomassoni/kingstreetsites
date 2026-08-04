import Image from "next/image";
import ContactPersonField from "./contact-person-field";
import { crm, gradeTone } from "@/lib/admin-ui";

type LeadSidebarProps = {
  lead: {
    id: string;
    phone?: string | null;
    website_url?: string | null;
    cuisine?: string | null;
    metro?: string | null;
    zip?: string | null;
    google_rating?: number | null;
    google_review_count?: number | null;
    contact_name?: string | null;
    contact_role?: string | null;
    contact_email?: string | null;
    contact_email_source?: string | null;
    analysis_status?: string | null;
    analyzed_at?: string | null;
    site_grade?: string | null;
    pitch_angle?: string | null;
    has_online_ordering?: boolean | null;
    has_reservations?: boolean | null;
    has_real_menu?: boolean | null;
    mobile_ready?: boolean | null;
    accessibility_ok?: boolean | null;
    looks_modern?: boolean | null;
    current_screenshot_url?: string | null;
  };
  brief: { priority: string; meaning: string[]; nextStep: string };
  hasScreenshot: boolean;
};

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={crm.metaRow}>
      <span className={crm.metaLabel}>{label}</span>
      <span className={crm.metaValue}>{children}</span>
    </div>
  );
}

export default function LeadSidebar({ lead, brief, hasScreenshot }: LeadSidebarProps) {
  const signals = [
    ["Ordering", lead.has_online_ordering],
    ["Reservations", lead.has_reservations],
    ["Menu", lead.has_real_menu],
    ["Mobile", lead.mobile_ready],
  ] as const;

  return (
    <>
      <section className={crm.card}>
        <h2 className={crm.sectionTitle}>Contact</h2>
        <ContactPersonField
          leadId={lead.id}
          initialName={lead.contact_name}
          initialRole={lead.contact_role}
          initialEmail={lead.contact_email}
          initialSource={lead.contact_email_source}
        />
      </section>

      <section className={crm.card}>
        <h2 className={crm.sectionTitle}>Business</h2>
        <div className="space-y-2">
          {lead.phone ? <MetaRow label="Phone">{lead.phone}</MetaRow> : null}
          {lead.website_url ? (
            <MetaRow label="Website">
              <a
                href={lead.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${crm.link} block truncate`}
              >
                {lead.website_url.replace(/^https?:\/\//, "")}
              </a>
            </MetaRow>
          ) : null}
          {lead.cuisine ? <MetaRow label="Type">{lead.cuisine}</MetaRow> : null}
          {(lead.metro || lead.zip) ? (
            <MetaRow label="Area">{[lead.metro, lead.zip].filter(Boolean).join(" ")}</MetaRow>
          ) : null}
          {lead.google_rating ? (
            <MetaRow label="Google">
              {lead.google_rating} ★ <span className="text-crm-faint">({lead.google_review_count})</span>
            </MetaRow>
          ) : null}
        </div>
      </section>

      <section className={crm.card}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className={crm.sectionTitle}>Site analysis</h2>
          {lead.analyzed_at ? (
            <span className="text-xs text-crm-faint">
              {new Date(lead.analyzed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          ) : null}
        </div>

        {lead.analysis_status === "pending" ? (
          <p className="text-sm text-crm-muted">Not analyzed yet. Run analyze from Find leads.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={crm.badge(gradeTone(lead.site_grade))}>
                Grade {lead.site_grade ?? "—"}
              </span>
              <span className="text-sm text-crm-muted">{brief.priority} priority</span>
            </div>

            {hasScreenshot ? (
              <a
                href={lead.website_url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-lg border border-crm-border"
              >
                <Image
                  src={`/api/screenshot?path=${encodeURIComponent(lead.current_screenshot_url!)}`}
                  alt="Site preview"
                  width={320}
                  height={180}
                  className="h-auto w-full object-cover object-top"
                />
              </a>
            ) : null}

            {lead.pitch_angle ? (
              <p className="text-sm leading-relaxed text-crm-muted">{lead.pitch_angle}</p>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {signals.map(([label, val]) => (
                <span
                  key={label}
                  className={`rounded-md px-2 py-0.5 text-xs ${
                    val ? "bg-crm-raised text-crm-text" : "text-crm-faint line-through decoration-crm-border"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {lead.analysis_status !== "pending" ? (
        <section className={crm.card}>
          <h2 className={crm.sectionTitle}>Next step</h2>
          <p className="text-sm leading-relaxed text-crm-muted">{brief.nextStep}</p>
          {brief.meaning.length > 0 ? (
            <ul className="mt-3 space-y-1.5 border-t border-crm-border pt-3 text-sm text-crm-faint">
              {brief.meaning.map((item) => (
                <li key={item} className="leading-snug">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
