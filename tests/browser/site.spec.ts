import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("real HTTP route accepts same-origin validation but refuses unconfigured collection", async ({
  request,
  baseURL,
}) => {
  const response = await request.post("/api/registration", {
    headers: { Origin: baseURL! },
    data: {
      firstName: "سارا",
      lastName: "ایرانی",
      email: "sara@example.com",
      phone: "۰۹۱۲۳۴۵۶۷۸۹",
      plan: "online",
      idempotencyKey: "3d6a76e4-70f1-4b52-921c-f260a68b039e",
    },
  });
  expect(response.status()).toBe(503);
  expect((await response.json()).code).toBe("NOT_CONFIGURED");
  expect(response.headers()["cache-control"]).toBe("no-store");
});

/** Browser checks run against a real production server, with checkout disabled. */
test("Persian narrative renders without overflow or JavaScript errors", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "هر شروع تازه",
  );
  await expect(
    page.getByText("منتظر اعلام رسمی دوره جدید هستیم"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("home.png"),
    fullPage: true,
  });
  // Catch hidden mobile-menu layout overflow, including the smallest supported width.
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("package selection updates form and preview validates without sending personal information", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await page.goto("/");
  await page
    .getByRole("link", { name: "انتخاب همراهی حضوری", exact: true })
    .click();
  await expect(page.getByRole("radio", { name: "همراهی حضوری" })).toBeChecked();
  await page.getByRole("button", { name: "بررسی اطلاعات فرم" }).click();
  await expect(page.locator("#firstName")).toBeFocused();
  await expect(
    page.getByText("نام را با ۲ تا ۸۰ حرف وارد کنید."),
  ).toBeVisible();
  await page.getByLabel("نام (الزامی)", { exact: true }).fill("سارا");
  await page
    .getByLabel("نام خانوادگی (الزامی)", { exact: true })
    .fill("ایرانی");
  await page
    .getByLabel("ایمیل (الزامی)", { exact: true })
    .fill("sara@example.com");
  await page
    .getByLabel("شماره تماس (الزامی)", { exact: true })
    .fill("۰۹۱۲۳۴۵۶۷۸۹");
  await page.getByRole("button", { name: "بررسی اطلاعات فرم" }).click();
  await expect(page.getByText(/اطلاعات از نظر ساختار معتبر است/)).toBeVisible();
  expect(posts).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test("FAQ works by keyboard and reduced-motion content remains available", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#faq");
  const question = page.getByRole("button", {
    name: "آیا پیش‌ثبت‌نام، همان ثبت‌نام رسمی لاتاری است؟",
  });
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(question).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText("خیر. پیش‌ثبت‌نام، درخواست استفاده از خدمات یارگشت است.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
  ).toBe("auto");
  await expect(page.locator("#journey-title")).toBeVisible();
});

test("turning on reduced motion stops animations already initialized on the page", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const reveal = page.locator(".section-heading[data-reveal]");
  // Wait for lazy GSAP setup, then change the actual OS preference during use.
  await expect(reveal).toHaveAttribute("style", /opacity:/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => reveal.evaluate((element) => getComputedStyle(element).opacity))
    .toBe("1");
  await expect
    .poll(() =>
      page
        .locator(".hero-plane")
        .evaluate((element) => element.style.transform),
    )
    .toBe("");

  // A visitor who initially disables motion can also change their preference later.
  await page.reload();
  await expect(reveal).not.toHaveAttribute("style", /opacity:/);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(reveal).toHaveAttribute("style", /opacity:/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => reveal.evaluate((element) => getComputedStyle(element).opacity))
    .toBe("1");
});

test("the narrative is present without JavaScript and previews stay out of search", async ({
  browser,
  request,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(baseURL!);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "هر شروع تازه",
    );
    await expect(page.locator("#story")).toContainText("Diversity Visa");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  } finally {
    await context.close();
  }
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /");
});

test("main page passes automated WCAG A/AA checks", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});

test("legal pages and not-found route are usable", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "حریم خصوصی شما",
  );
  await page.getByRole("link", { name: "بازگشت به صفحه اصلی ←" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "هر شروع تازه",
  );
  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "شرایط خدمات",
  );
  const response = await page.goto("/missing-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "این مسیر پیدا نشد.",
  );
});

test("responsive navigation and skip link provide usable shortcuts", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "رفتن به محتوای اصلی" }),
  ).toBeFocused();
  if (testInfo.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.getByLabel("فهرست سایت").click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("navigation", { name: "ناوبری موبایل" })
      .getByRole("link", { name: "خدمات و تعرفه‌ها" })
      .click();
    await expect(page.locator("details.mobile-navigation")).not.toHaveAttribute(
      "open",
      "",
    );
    await expect(page).toHaveURL(/#services$/);
  } else {
    await page
      .getByRole("navigation", { name: "ناوبری اصلی" })
      .getByRole("link", { name: "خدمات و تعرفه‌ها" })
      .click();
    await expect(page).toHaveURL(/#services$/);
  }
});
