import {
  ArrowDown,
  ArrowUpLeft,
  BadgeCheck,
  Check,
  ClipboardCheck,
  FileImage,
  Headphones,
  MapPin,
  MessageCircle,
  MoveLeft,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Sprout,
  FileCheck2,
} from "lucide-react";
import { Navigation } from "@/components/navigation";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { TravelArt } from "@/components/travel-art";
import { CampaignStatus } from "@/components/campaign-status";
import { ScrollEffects } from "@/components/scroll-effects";
import { ServiceSignup } from "@/components/service-signup";
import { Faq } from "@/components/faq";
import { brand, officialDvUrl } from "@/lib/site";
import { getPageContent } from "@/lib/content-store";
import { getCheckoutConfig } from "@/lib/checkout-config";

export const dynamic = "force-dynamic";

/** Public narrative stays server-rendered; only interactive islands hydrate. */
export default async function Home() {
  const content = await getPageContent("home");
  const steps = [
    {
      number: "۰۱",
      title: content.step1,
      text: content.step2,
      icon: MessageCircle,
    },
    {
      number: "۰۲",
      title: content.step3,
      text: content.step4,
      icon: ClipboardCheck,
    },
    {
      number: "۰۳",
      title: content.step5,
      text: content.step6,
      icon: ScanLine,
    },
    {
      number: "۰۴",
      title: content.step7,
      text: content.step8,
      icon: FileCheck2,
    },
  ];
  const checkoutEnabled = Boolean(getCheckoutConfig());
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.legalName,
    description: brand.description,
    ...(process.env.SITE_URL ? { url: process.env.SITE_URL } : {}),
  };
  return (
    <>
      <a className="skip-link" href="#main">
        {" "}
        {content.text1}{" "}
      </a>
      <Navigation />
      <ScrollEffects />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <main id="main">
        {/* First chapter balances a short message with an original flat illustration. */}
        <section id="home" className="hero shell" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="status-dot" /> {content.eyebrow}
            </span>
            <h1 id="hero-title">
              {" "}
              {content.text2} <br /> {content.text3}{" "}
              <span className="highlight-word">{content.text4}</span>{" "}
              {content.text5} <span className="orange-text">.</span>
            </h1>
            <p className="hero-description">{content.description}</p>
            <div className="hero-actions">
              <Button asChild size="lg" className="button-warm">
                <a href="#services">
                  {" "}
                  {content.text6} <ArrowUpLeft aria-hidden="true" />
                </a>
              </Button>
              <a href="#story" className="quiet-link">
                {" "}
                {content.text7} <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <div className="hero-reassurance">
              <span>
                <ShieldCheck size={17} /> {content.text8}{" "}
              </span>
              <i />
              <span>
                <MapPin size={17} /> {content.text9}{" "}
              </span>
            </div>
          </div>
          <TravelArt />
          <div className="hero-status">
            <CampaignStatus />
            <span className="hero-chapter">
              {" "}
              {content.text10} <span /> {content.text11}{" "}
            </span>
          </div>
        </section>

        <div className="trust-strip">
          <div className="shell trust-inner">
            <span>
              <BadgeCheck /> {content.text12}{" "}
            </span>
            <span>
              <Headphones /> {content.text13}{" "}
            </span>
            <span>
              <MapPin /> {content.text14}{" "}
            </span>
            <span>
              <ScanLine /> {content.text15}{" "}
            </span>
          </div>
        </div>

        {/* Plain-language education avoids unsupported current-cycle claims. */}
        <section
          id="story"
          className="section shell story-intro"
          aria-labelledby="story-title"
        >
          <div className="section-heading" data-reveal>
            <span className="eyebrow">
              <span className="section-number">۰۱</span> {content.text16}{" "}
            </span>
            <h2 id="story-title">
              {" "}
              {content.text17} <br /> {content.text18}{" "}
            </h2>
          </div>
          <div className="story-body" data-reveal>
            <p className="lead-copy"> {content.text19} </p>
            <p> {content.text20} </p>
            <p>
              {" "}
              {content.text21} {brand.name} {content.text22}{" "}
            </p>
            <a
              className="inline-link"
              href={officialDvUrl}
              target="_blank"
              rel="noreferrer"
            >
              {" "}
              {content.text23} <ArrowUpLeft size={17} aria-hidden="true" />
              <span className="sr-only">{content.text24}</span>
            </a>
          </div>
        </section>

        <section
          id="journey"
          className="journey-section section"
          aria-labelledby="journey-title"
        >
          <div className="shell journey-grid">
            <div className="journey-aside" data-reveal>
              <span className="eyebrow">
                <span className="section-number">۰۲</span> {content.text25}{" "}
              </span>
              <h2 id="journey-title">
                {" "}
                {content.text26} <br />
                <span className="muted-green">{content.text27}</span>
              </h2>
              <p> {content.text28} </p>
              <div className="journey-note">
                <Sprout size={27} strokeWidth={1.3} />
                <span>
                  {" "}
                  {content.text29} <br />
                  <strong>{content.text30}</strong>
                </span>
              </div>
              <a href="#registration" className="inline-link">
                {" "}
                {content.text31} <MoveLeft size={18} />
              </a>
            </div>
            <div className="journey-steps">
              <div className="journey-line">
                <div className="journey-line-progress" />
              </div>
              {steps.map(({ number, title, text, icon: Icon }) => (
                <article className="journey-step" key={number} data-reveal>
                  <span className="step-marker">{number}</span>
                  <div>
                    <span className="step-icon">
                      <Icon size={21} strokeWidth={1.5} />
                    </span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="section shell documents-section"
          aria-labelledby="documents-title"
        >
          <div className="documents-visual" data-reveal>
            <span className="eyebrow light-eyebrow"> {content.text32} </span>
            <div className="photo-example">
              <div className="photo-frame">
                <svg viewBox="0 0 160 180" fill="none" aria-hidden="true">
                  <path
                    d="M26 180c0-44 18-67 54-67s54 23 54 67"
                    fill="#a9bdb1"
                  />
                  <ellipse cx="80" cy="69" rx="32" ry="41" fill="#d5dcd2" />
                  <path
                    d="M49 57c-1-44 66-53 64 2-13-4-23-13-30-24-9 13-20 19-34 22Z"
                    fill="#80998c"
                  />
                </svg>
                <span className="photo-cross top" />
                <span className="photo-cross bottom" />
              </div>
              <span className="example-tag">{content.text33}</span>
            </div>
            <div className="visual-check">
              <Check size={14} />
              <span>{content.text34}</span>
            </div>
            <span className="visual-caption" dir="ltr">
              DETAILS MAKE THE DIFFERENCE.
            </span>
          </div>
          <div className="documents-copy" data-reveal>
            <span className="eyebrow">
              <span className="section-number">۰۳</span> {content.text35}{" "}
            </span>
            <h2 id="documents-title">
              {" "}
              {content.text36} <br /> {content.text37}{" "}
            </h2>
            <p> {content.text38} </p>
            <ul className="document-features">
              <li>
                <FileImage />
                <div>
                  <h3>{content.text39}</h3>
                  <p> {content.text40} </p>
                </div>
              </li>
              <li>
                <ClipboardCheck />
                <div>
                  <h3>{content.text41}</h3>
                  <p> {content.text42} </p>
                </div>
              </li>
              <li>
                <ShieldCheck />
                <div>
                  <h3>{content.text43}</h3>
                  <p> {content.text44} </p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <ServiceSignup checkoutEnabled={checkoutEnabled} />

        <section
          className="support-section section"
          aria-labelledby="support-title"
        >
          <div className="shell support-grid">
            <div className="support-art" aria-hidden="true">
              <div className="support-orbit" />
              <span className="support-spark">
                <Sparkles strokeWidth={1.2} />
              </span>
              <div className="support-card">
                <span className="support-card-icon">
                  <Sprout strokeWidth={1.3} />
                </span>
                <span>{content.text45}</span>
                <strong>{content.text46}</strong>
                <span className="support-card-line" />
                <span dir="ltr">YOUR NEXT CHAPTER</span>
              </div>
            </div>
            <div data-reveal>
              <span className="eyebrow light-eyebrow"> {content.text47} </span>
              <h2 id="support-title">
                {" "}
                {content.text48} <br /> {content.text49}{" "}
              </h2>
              <p> {content.text50} </p>
              <p className="support-fineprint"> {content.text51} </p>
              <a href="#registration" className="inline-link light-link">
                {" "}
                {content.text52} <ArrowUpLeft size={18} />
              </a>
            </div>
          </div>
        </section>

        <section
          id="faq"
          className="section shell faq-section"
          aria-labelledby="faq-title"
        >
          <div data-reveal>
            <span className="eyebrow">
              <span className="section-number">۰۵</span> {content.text53}{" "}
            </span>
            <h2 id="faq-title">
              {" "}
              {content.text54} <br /> {content.text55}{" "}
            </h2>
            <p>{content.text56}</p>
            <div className="faq-note">
              <MessageCircle size={23} strokeWidth={1.5} />
              <span>
                {" "}
                {content.text57} <br />
                <strong>{content.text58}</strong>
              </span>
            </div>
          </div>
          <Faq
            questions={Array.from({ length: 6 }, (_, i) => [
              content[`faqQuestion${i + 1}`],
              content[`faqAnswer${i + 1}`],
            ])}
          />
        </section>

        <section className="final-cta shell" aria-label="شروع درخواست">
          <div>
            <span className="eyebrow">{content.text59}</span>
            <h2>{content.text60}</h2>
            <p>{content.text61}</p>
          </div>
          <Button asChild size="lg" className="button-warm">
            <a href="#services">
              {" "}
              {content.text62} <ArrowUpLeft />
            </a>
          </Button>
        </section>
      </main>
      <footer className="site-footer">
        <div className="shell">
          <div className="footer-top">
            <a href="#home" aria-label={`${brand.name}، ابتدای صفحه`}>
              <Brand />
            </a>
            <p>{brand.description}</p>
            <a href="#home" className="back-top">
              {" "}
              {content.text63} <ArrowUpLeft size={17} />
            </a>
          </div>
          <div className="footer-notice">
            <ShieldCheck size={19} />
            <p>
              {brand.name} {content.text64}{" "}
            </p>
          </div>
          <div className="footer-bottom">
            <span>© {brand.legalName}</span>
            <div>
              <a href="/portal">پرتال مشتری</a>
              <a href="/privacy">{content.text65}</a>
              <a href="/terms">{content.text66}</a>
              <a href={officialDvUrl} target="_blank" rel="noreferrer">
                {" "}
                {content.text67}{" "}
                <span className="sr-only">{content.text68}</span>
              </a>
            </div>
            <span>{brand.location}</span>
          </div>
        </div>
      </footer>
    </>
  );
}
