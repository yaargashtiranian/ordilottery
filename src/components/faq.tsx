"use client";

import { brand } from "@/lib/site";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const questions = [
  [
    "آیا پیش‌ثبت‌نام، همان ثبت‌نام رسمی لاتاری است؟",
    `خیر. پیش‌ثبت‌نام، درخواست استفاده از خدمات ${brand.name} است. ثبت در سامانه رسمی تنها در بازه اعلام‌شده و پس از تکمیل و بررسی اطلاعات انجام می‌شود. دریافت فرم یا پرداخت به معنی ثبت نهایی نیست.`,
  ],
  [
    "برای شروع چه اطلاعاتی لازم است؟",
    "نام، نام خانوادگی، ایمیل و موبایل؛ مدارک در مرحلهٔ تکمیلی دریافت می‌شوند.",
  ],
  [
    "تفاوت خدمات آنلاین و حضوری چیست؟",
    "آنلاین: تماس و پیام‌رسان. حضوری: بررسی و اسکن مدارک با متخصص. عکاسی با توافق جداگانه.",
  ],
  [
    "آیا پرداخت هزینه، شانس برنده‌شدن را بیشتر می‌کند؟",
    "خیر؛ پرداخت بابت آماده‌سازی و پیگیری پرونده است. انتخاب و صدور ویزا تضمین نمی‌شوند.",
  ],
  [
    "قوانین پاسپورت، عکس و هزینه رسمی را از کجا ببینم؟",
    "دستورالعمل رسمی همان دوره در سایت وزارت خارجه آمریکا؛ قوانین دورهٔ جدید هنوز تأیید نشده‌اند.",
  ],
  [
    "اگر انتخاب شدم، باز هم همراه من هستید؟",
    "بله، با توافق دربارهٔ خدمات و هزینهٔ جداگانه.",
  ],
] as const;

/** Radix supplies keyboard navigation and accurate expanded/control semantics. */
export function Faq({
  questions: items = questions,
}: {
  questions?: readonly (readonly string[])[];
}) {
  return (
    <Accordion type="single" collapsible className="faq-list">
      {items.map(([question, answer], index) => (
        <AccordionItem key={question} value={`question-${index}`}>
          <AccordionTrigger>{question}</AccordionTrigger>
          <AccordionContent>{answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
