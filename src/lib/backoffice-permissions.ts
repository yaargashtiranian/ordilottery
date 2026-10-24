/** Section access is server-managed; dependencies are explicit in the editor, never JWT metadata. */
export const staffSections = {
  overview: "نمای عملیاتی",
  customers: "مشتریان",
  cases: "پرونده‌ها",
  documents: "مدارک پرونده",
  payments: "سوابق پرداخت",
  support: "پشتیبانی داخلی",
  campaigns: "کمپین و تخفیف",
  orders: "سفارش‌های وب",
  chat: "گفت‌وگوی مشتریان",
  content: "محتوای صفحات",
  users: "کاربران و دسترسی‌ها",
} as const;
export type StaffSection = keyof typeof staffSections;
export type StaffAccess = {
  permissions: string[];
  is_owner: boolean;
  enabled: boolean;
};
export const sectionDependencies: Partial<
  Record<StaffSection, StaffSection[]>
> = {
  cases: ["customers"],
  documents: ["cases", "customers"],
  payments: ["cases", "customers", "orders"],
  support: ["cases", "customers"],
  overview: ["customers", "cases", "payments", "support"],
};
export function hasStaffAccess(access: StaffAccess, section: string) {
  return (
    access.enabled && (access.is_owner || access.permissions.includes(section))
  );
}
export function normalizeStaffPermissions(
  input: unknown,
): StaffSection[] | null {
  if (
    !Array.isArray(input) ||
    input.length > 11 ||
    input.some((p) => typeof p !== "string" || !Object.hasOwn(staffSections, p))
  )
    return null;
  const sections = new Set(input as StaffSection[]);
  for (const section of sections)
    for (const dependency of sectionDependencies[section] ?? [])
      sections.add(dependency);
  return [...sections].sort();
}
export function firstStaffPath(access: StaffAccess) {
  const section = Object.keys(staffSections).find(
    (key) => key !== "documents" && hasStaffAccess(access, key),
  );
  return section === "overview"
    ? "/backoffice"
    : section
      ? `/backoffice/${section}`
      : "/backoffice/login";
}
