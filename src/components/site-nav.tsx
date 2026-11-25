"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, MenuIcon } from "@/components/icons";

type NavUser = { displayName: string; isAdmin: boolean } | null;

const links: Array<{ label: string; href: string; match: string[] }> = [
  { label: "Khám phá", href: "/kham-pha", match: ["/kham-pha", "/bai-hat"] },
  { label: "Thư viện", href: "/thu-vien", match: ["/thu-vien", "/tai-len", "/bien-tap"] },
  { label: "Danh sách phát", href: "/danh-sach-phat", match: ["/danh-sach-phat"] },
  { label: "Kế hoạch", href: "/ke-hoach", match: ["/ke-hoach"] },
];

const adminLink = { label: "Quản trị", href: "/quan-tri", match: ["/quan-tri"] };

function isCurrent(pathname: string, match: string[]) {
  return match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function SiteNav({ user }: { user: NavUser }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const items = user?.isAdmin ? [...links, adminLink] : links;
  const accountCurrent = pathname.startsWith("/tai-khoan") || pathname.startsWith("/bang-dieu-khien");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const behind = Array.from(document.querySelectorAll<HTMLElement>("main, footer"));
    for (const element of behind) element.inert = true;
    sheetRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => {
      if (wide.matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.body.style.overflow = previous;
      for (const element of behind) element.inert = false;
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <>
      <nav aria-label="Chính" className="hidden flex-1 items-center md:flex">
        <ul className="flex items-center gap-1 lg:gap-2">
          {items.map((item) => {
            const current = isCurrent(pathname, item.match);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className="group relative flex h-[var(--nav-h)] items-center px-3 text-[15px] font-medium text-ink no-underline"
                >
                  <span className={current ? "text-ink" : "text-[#4a3d37] transition-colors group-hover:text-ink"}>{item.label}</span>
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-3 bottom-0 h-0.5 bg-wine transition-opacity ${current ? "opacity-100" : "opacity-0 group-hover:opacity-30"}`}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <Link
              href="/tai-khoan"
              aria-current={accountCurrent ? "page" : undefined}
              className="flex min-h-[44px] items-center gap-3 rounded-full py-1 pl-1 pr-4 text-[15px] font-medium no-underline transition-colors hover:bg-champagne aria-[current=page]:bg-champagne"
            >
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-ink font-serif text-base text-ivory">
                {initial(user.displayName)}
              </span>
              <span className="max-w-[14ch] truncate">{user.displayName}</span>
            </Link>
          ) : (
            <Link href="/dang-nhap" className="btn btn-primary">Đăng nhập</Link>
          )}
        </div>
      </nav>

      <div className="ml-auto md:hidden">
        <button
          ref={toggleRef}
          type="button"
          className="icon-btn border border-ink"
          aria-expanded={open}
          aria-controls="menu-di-dong"
          aria-label={open ? "Đóng menu" : "Mở menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      <div
        id="menu-di-dong"
        ref={sheetRef}
        hidden={!open}
        className="fixed inset-x-0 bottom-0 top-[var(--nav-h)] z-30 overflow-y-auto bg-ivory md:hidden"
      >
        <nav aria-label="Chính (di động)" className="wrap flex min-h-full flex-col py-4">
          <ul>
            {items.map((item) => {
              const current = isCurrent(pathname, item.match);
              return (
                <li key={item.href} className="border-b border-line">
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className="flex min-h-[56px] items-center justify-between font-serif text-h3 no-underline aria-[current=page]:text-wine"
                  >
                    {item.label}
                    {current ? <span className="chip chip-accent font-sans">Đang xem</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-auto pt-8">
            {user ? (
              <Link href="/tai-khoan" onClick={() => setOpen(false)} className="btn btn-secondary w-full">
                Tài khoản · {user.displayName}
              </Link>
            ) : (
              <Link href="/dang-nhap" onClick={() => setOpen(false)} className="btn btn-primary w-full">Đăng nhập</Link>
            )}
          </div>
        </nav>
      </div>
    </>
  );
}
