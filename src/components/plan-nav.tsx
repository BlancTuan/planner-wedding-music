"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertIcon, CheckIcon } from "@/components/icons";

export const planStateLabels: Record<string, string> = {
  DRAFT: "Bản nháp",
  READY: "Sẵn sàng",
  NEEDS_REVIEW: "Cần xem lại",
  ARCHIVED: "Đã lưu trữ",
};

const weddingDateFormat = new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "long", year: "numeric" });

export function weddingDateLabel(value: string | null | undefined): string | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  return weddingDateFormat.format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function PlanStateChip({ state }: { state: string }) {
  const label = planStateLabels[state] ?? "Không rõ trạng thái";
  if (state === "READY") {
    return <span className="chip chip-ok"><CheckIcon />{label}</span>;
  }
  if (state === "NEEDS_REVIEW") {
    return <span className="chip chip-warn"><AlertIcon />{label}</span>;
  }
  return <span className="chip">{label}</span>;
}

export function PlanNav({ planId }: { planId: string }) {
  const pathname = usePathname();
  const base = `/ke-hoach/${planId}`;
  const items = [
    { href: base, label: "Trình tự lễ" },
    { href: `${base}/san-sang`, label: "Kiểm tra sẵn sàng" },
    { href: `${base}/ban-giao`, label: "Bàn giao" },
  ];
  return (
    <nav aria-label="Các bước của kế hoạch" className="overflow-x-auto border-b border-line">
      <ul className="flex min-w-max gap-8 max-md:gap-6">
        {items.map((item) => {
          const current = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`relative inline-flex min-h-[48px] items-center whitespace-nowrap text-base font-medium no-underline transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 ${
                  current ? "text-ink after:bg-wine" : "text-muted after:bg-transparent hover:text-ink hover:after:bg-champagne-deep"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
