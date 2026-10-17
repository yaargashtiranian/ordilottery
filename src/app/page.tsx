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
import { getPublicContent } from "@/lib/wordpress-content";
import { getCheckoutConfig } from "@/lib/checkout-config";

const steps = [
  {
    number: "۰۱",
    title: "از آشنایی شروع می‌کنیم",
    text: "نام و اطلاعات تماس را وارد می‌کنید و شیوه همراهی را انتخاب می‌کنید. برای شروع، همین کافی است.",
    icon: MessageCircle,
  },
  {
    number: "۰۲",
    title: "با یک مسیر روشن ادامه می‌دهیم",
    text: "پس از پرداخت تأییدشده هزینه خدمات، فرم تکمیلی و راهنمای آماده‌سازی مدارک در اختیار شماست.",
    icon: ClipboardCheck,
  },
  {
    number: "۰۳",
    title: "جزئیات را با دقت بررسی می‌کنیم",
    text: "متخصص، اطلاعات و مدارک را بررسی می‌کند. اگر چیزی نیاز به اصلاح داشته باشد، قدم بعد را با هم برمی‌داریم.",
    icon: ScanLine,
  },
  {
    number: "۰۴",
    title: "تا ثبت نهایی، کنارتان می‌مانیم",
    text: "ثبت رسمی در بازه اعلام‌شده و پس از تکمیل پرونده انجام می‌شود؛ دریافت درخواست خدمات، به معنی ثبت نهایی نیست.",
    icon: FileCheck2,
  },
];

/** Public narrative stays server-rendered; only interactive islands hydrate. */
export default async function Home() {
  const content = await getPublicContent();
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
        رفتن به محتوای اصلی
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
              هر شروع تازه،
              <br />
              از <span className="highlight-word">یک قدم</span> آغاز می‌شود
              <span className="orange-text">.</span>
            </h1>
            <p className="hero-description">{content.description}</p>
            <div className="hero-actions">
              <Button asChild size="lg" className="button-warm">
                <a href="#services">
                  اولین قدم را بردارید <ArrowUpLeft aria-hidden="true" />
                </a>
              </Button>
              <a href="#story" className="quiet-link">
                اول، بیشتر بدانیم <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <div className="hero-reassurance">
              <span>
                <ShieldCheck size={17} /> بررسی توسط متخصص
              </span>
              <i />
              <span>
                <MapPin size={17} /> آنلاین و حضوری
              </span>
            </div>
          </div>
          <TravelArt />
          <div className="hero-status">
            <CampaignStatus />
            <span className="hero-chapter">
              فصل اول <span /> یک تصمیم تازه
            </span>
          </div>
        </section>

        <div className="trust-strip">
          <div className="shell trust-inner">
            <span>
              <BadgeCheck /> دارای مجوز گردشگری
            </span>
            <span>
              <Headphones /> پشتیبانی ۲۴/۷
            </span>
            <span>
              <MapPin /> دفتر در زعفرانیه
            </span>
            <span>
              <ScanLine /> بررسی دقیق مدارک
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
              <span className="section-number">۰۱</span> قصه از کجا شروع می‌شود؟
            </span>
            <h2 id="story-title">
              گاهی یک فرصت،
              <br />
              مسیر تازه‌ای پیش روی ما می‌گذارد.
            </h2>
          </div>
          <div className="story-body" data-reveal>
            <p className="lead-copy">
              لاتاری گرین‌کارت، فرصتی برای قدم گذاشتن در یک مسیر تازه است؛ اما
              قدم اول، شناخت درست آن است.
            </p>
            <p>
              برنامه Diversity Visa یا DV، مسیر انتخاب متقاضیان برای ادامه
              فرایند ویزای تنوع آمریکاست. انتخاب شدن، آغاز بررسی پرونده است و
              به‌تنهایی به معنی دریافت ویزا نیست.
            </p>
            <p>
              ما در {brand.name} برای تصمیم شما وعده نمی‌سازیم؛ کمک می‌کنیم
              اطلاعات، مدارک و مراحل درخواست را با دقت بیشتری پیش ببرید.
            </p>
            <a
              className="inline-link"
              href={officialDvUrl}
              target="_blank"
              rel="noreferrer"
            >
              آشنایی با برنامه در منبع رسمی{" "}
              <ArrowUpLeft size={17} aria-hidden="true" />
              <span className="sr-only">، در صفحه جدید</span>
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
                <span className="section-number">۰۲</span> مسیر شما، قدم‌به‌قدم
              </span>
              <h2 id="journey-title">
                مسیر تازه است.
                <br />
                <span className="muted-green">اما تنها نیستید.</span>
              </h2>
              <p>
                قرار نیست از همان ابتدا همه‌چیز را بدانید. مسیر را به قدم‌های
                کوچک و روشن تقسیم کرده‌ایم.
              </p>
              <div className="journey-note">
                <Sprout size={27} strokeWidth={1.3} />
                <span>
                  شما تصمیم می‌گیرید.
                  <br />
                  <strong>ما همراه مسیر می‌مانیم.</strong>
                </span>
              </div>
              <a href="#registration" className="inline-link">
                از اینجا شروع کنیم <MoveLeft size={18} />
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
            <span className="eyebrow light-eyebrow">
              جزئیات کوچک، اهمیت بزرگ
            </span>
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
              <span className="example-tag">تصویر راهنما؛ مدرک واقعی نیست</span>
            </div>
            <div className="visual-check">
              <Check size={14} />
              <span>آماده‌سازی با راهنمای متخصص</span>
            </div>
            <span className="visual-caption" dir="ltr">
              DETAILS MAKE THE DIFFERENCE.
            </span>
          </div>
          <div className="documents-copy" data-reveal>
            <span className="eyebrow">
              <span className="section-number">۰۳</span> کمی دقت، خیال راحت‌تر
            </span>
            <h2 id="documents-title">
              مدارک درست،
              <br />
              یک قدم محکم‌تر.
            </h2>
            <p>
              هر مدرک، راهنمای خودش را دارد. در مرحله تکمیلی، دقیقاً می‌دانید چه
              چیزی لازم است و چطور باید آماده‌اش کنید.
            </p>
            <ul className="document-features">
              <li>
                <FileImage />
                <div>
                  <h3>عکس، با راهنمای همان دوره</h3>
                  <p>
                    ویژگی‌های عکس بر اساس دستورالعمل رسمی بررسی می‌شود؛ کنترل
                    فایل، جای بررسی متخصص را نمی‌گیرد.
                  </p>
                </div>
              </li>
              <li>
                <ClipboardCheck />
                <div>
                  <h3>اطلاعات کامل، در زمان مناسب</h3>
                  <p>
                    ابتدا فقط اطلاعات تماس؛ جزئیات و مدارک هویتی در مرحله تکمیلی
                    و از مسیر تعیین‌شده دریافت می‌شوند.
                  </p>
                </div>
              </li>
              <li>
                <ShieldCheck />
                <div>
                  <h3>با احترام به اطلاعات شخصی شما</h3>
                  <p>
                    قبل از دریافت مدارک، روش ارسال و شرایط نگهداری آن‌ها روشن
                    خواهد بود.
                  </p>
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
                <span>برای فصل‌های بعدی زندگی</span>
                <strong>همراهی، ادامه دارد.</strong>
                <span className="support-card-line" />
                <span dir="ltr">YOUR NEXT CHAPTER</span>
              </div>
            </div>
            <div data-reveal>
              <span className="eyebrow light-eyebrow">
                این داستان می‌تواند ادامه داشته باشد
              </span>
              <h2 id="support-title">
                اگر انتخاب شدید،
                <br />
                قدم بعد را هم می‌شناسیم.
              </h2>
              <p>
                پس از انتخاب شدن در لاتاری، مسیر تازه‌ای از بررسی و تکمیل پرونده
                آغاز می‌شود. امکان همراهی متخصص برای این مرحله هم وجود دارد.
              </p>
              <p className="support-fineprint">
                این خدمت با بررسی شرایط، دامنه و هزینه جداگانه ارائه می‌شود.
                انتخاب شدن یا همراهی متخصص، تضمین صدور ویزا نیست.
              </p>
              <a href="#registration" className="inline-link light-link">
                با هم مسیر را شروع کنیم <ArrowUpLeft size={18} />
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
              <span className="section-number">۰۵</span> قبل از اولین قدم
            </span>
            <h2 id="faq-title">
              شاید سؤال شما
              <br />
              هم همین باشد.
            </h2>
            <p>پاسخ‌های روشن، برای تصمیمی آگاهانه‌تر.</p>
            <div className="faq-note">
              <MessageCircle size={23} strokeWidth={1.5} />
              <span>
                همراهی واقعی،
                <br />
                <strong>از شنیدن سؤال‌های شما شروع می‌شود.</strong>
              </span>
            </div>
          </div>
          <Faq />
        </section>

        <section className="final-cta shell" aria-label="شروع درخواست">
          <div>
            <span className="eyebrow">یک تصمیم کوچک، یک فصل تازه</span>
            <h2>قدم اول، از همین‌جا.</h2>
            <p>مسیر را بشناسید، شیوه همراهی را انتخاب کنید.</p>
          </div>
          <Button asChild size="lg" className="button-warm">
            <a href="#services">
              انتخاب شیوه همراهی <ArrowUpLeft />
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
              بازگشت به بالا <ArrowUpLeft size={17} />
            </a>
          </div>
          <div className="footer-notice">
            <ShieldCheck size={19} />
            <p>
              {brand.name} ارائه‌دهنده مستقل خدمات است و وابستگی به دولت آمریکا
              ندارد. تعرفه‌های نمایش‌داده‌شده مربوط به خدمات شرکت است؛ هزینه
              احتمالی رسمی و خدمات بعدی، در صورت لزوم جداگانه اعلام می‌شوند.
            </p>
          </div>
          <div className="footer-bottom">
            <span>© {brand.legalName}</span>
            <div>
              <a href="/privacy">حریم خصوصی</a>
              <a href="/terms">شرایط خدمات</a>
              <a href={officialDvUrl} target="_blank" rel="noreferrer">
                منبع رسمی DV <span className="sr-only">، در صفحه جدید</span>
              </a>
            </div>
            <span>{brand.location}</span>
          </div>
        </div>
      </footer>
    </>
  );
}
