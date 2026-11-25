import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import { cookies } from "next/headers";
import { Shell } from "@/components/shell";
import { userFromToken } from "@/server/auth";
import "./globals.css";

const sans = Hanken_Grotesk({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Newsreader({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nhịp lễ — nhạc cho lễ cưới",
  description: "Chuẩn bị nhạc cưới, cắt đúng đoạn, và bàn giao file MP3 cho ngày cưới.",
};

export const viewport: Viewport = {
  themeColor: "#f7f2ea",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const user = await userFromToken(jar.get("wmp_session")?.value ?? null);
  return (
    <html lang="vi" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <Shell user={user}>{children}</Shell>
      </body>
    </html>
  );
}
