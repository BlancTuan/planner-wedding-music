import Link from "next/link";
import type { SessionUser } from "@/server/auth";
import { SiteNav } from "@/components/site-nav";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 24" className={className} aria-hidden="true" focusable="false">
      <circle cx="11.5" cy="12" r="7.5" fill="none" stroke="var(--wine)" strokeWidth="2" />
      <circle cx="20.5" cy="12" r="7.5" fill="none" stroke="var(--ink)" strokeWidth="2" />
    </svg>
  );
}

export function Shell({ user, children }: { user: SessionUser | null; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col font-sans">
      <a
        href="#noi-dung"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Tới nội dung
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-ivory">
        <div className="wrap flex h-[var(--nav-h)] items-center gap-8">
          <Link href="/" className="flex min-h-[44px] shrink-0 items-center gap-2 no-underline">
            <BrandMark className="h-6 w-8" />
            <span className="font-serif text-[22px] leading-none tracking-tight">Nhịp lễ</span>
          </Link>
          <SiteNav
            user={user ? { displayName: user.displayName, isAdmin: user.role === "ADMIN" } : null}
          />
        </div>
      </header>
      <main id="noi-dung" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="wrap flex flex-wrap items-center justify-between gap-4 py-8 text-sm text-muted">
          <span className="flex items-center gap-2">
            <BrandMark className="h-4 w-6" />
            Nhịp lễ · nhạc chuẩn bị cho ngày cưới
          </span>
          <span>Không tự phát nhạc theo giờ. Bàn giao bằng file MP3 bạn đã nghe.</span>
        </div>
      </footer>
    </div>
  );
}
