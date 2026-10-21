"use client";
import { Dialog as Primitive } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/** Radix supplies focus trapping, Escape handling, background inertness and focus return. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="ops-dialog-overlay" />
        <Primitive.Content className="ops-dialog-content" dir="rtl">
          <div className="ops-dialog-heading">
            <div>
              <Primitive.Title>{title}</Primitive.Title>
              <Primitive.Description>{description}</Primitive.Description>
            </div>
            <Primitive.Close className="ops-dialog-close" aria-label="بستن فرم">
              <X size={18} />
            </Primitive.Close>
          </div>
          {children}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
