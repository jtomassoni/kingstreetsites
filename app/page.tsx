import { AuditOffer } from "@/components/site/audit-offer";
import { CtaBand } from "@/components/site/cta-band";
import { Faq } from "@/components/site/faq";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { Hero } from "@/components/site/hero";
import { Specializations } from "@/components/site/specializations";
import { Portfolio } from "@/components/site/portfolio";
import { Process } from "@/components/site/process";
import { Services } from "@/components/site/services";
import { StatsStrip } from "@/components/site/stats-strip";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <StatsStrip />
        <Specializations />
        <Portfolio />
        <Services />
        <Process />
        <AuditOffer />
        <Faq />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
