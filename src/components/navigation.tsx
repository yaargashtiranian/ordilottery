"use client";

import { useRef } from "react";
import { Menu, ArrowUpLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/site";

const links = [
  ["روایت یک شروع", "story"],
  ["مسیر ثبت‌نام", "journey"],
  ["خدمات و تعرفه‌ها", "services"],
  ["سؤال‌های شما", "faq"],
];

/** Native details keeps the mobile menu usable without a dialog dependency. */
export function Navigation() {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <a href="#home" aria-label={`${brand.name}، ابتدای صفحه`}>
          <Brand />
        </a>
        <nav className="desktop-navigation" aria-label="ناوبری اصلی">
          {links.map(([label, id]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <Button asChild className="header-cta">
          <a href="#registration">
            شروع مسیر <ArrowUpLeft aria-hidden="true" />
          </a>
        </Button>
        <details
          ref={menu}
          className="mobile-navigation"
          onKeyDown={(event) => {
            if (event.key === "Escape" && menu.current) {
              menu.current.open = false;
              menu.current.querySelector("summary")?.focus();
            }
          }}
        >
          <summary aria-label="فهرست سایت">
            <Menu size={22} aria-hidden="true" />
          </summary>
          <nav aria-label="ناوبری موبایل">
            {links.map(([label, id]) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                }}
              >
                {label}
              </a>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
