import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { userFromToken } from "@/server/auth";
import { megabytes, percent } from "@/components/format";
import { ArrowRightIcon } from "@/components/icons";

const destinations = [
  ["/kham-pha", "Khám phá nhạc lễ", "Tìm bài theo từng phần lễ, như đón khách, cắt bánh hay tiệc cưới."],
  ["/thu-vien", "Mở thư viện", "File đã tải, các bản chỉnh đã lưu và MP3 đã xuất."],
  ["/tai-len", "Tải nhạc lên", "Thêm file MP3 hoặc WAV, hoặc xem một liên kết YouTube."],
  ["/danh-sach-phat", "Sắp danh sách phát", "Xếp thứ tự các bản chỉnh cho những phần lễ dài."],
  ["/ke-hoach", "Lập kế hoạch lễ", "Gán nhạc vào từng phần, kiểm tra sẵn sàng và bàn giao."],
] as const;

export default async function DashboardPage() {
  const jar = await cookies();
  const user = await userFromToken(jar.get("wmp_session")?.value ?? null);
  if (!user) redirect("/dang-nhap?next=/bang-dieu-khien");
  const used = percent(user.storageUsedBytes, user.storageQuotaBytes);
  const usage = `Đã dùng ${megabytes(user.storageUsedBytes)} trên ${megabytes(user.storageQuotaBytes)}`;
  return (
    <div className="wrap page">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] max-md:gap-8">
        <header className="min-w-0">
          <h1 className="page-title break-words">Chào {user.displayName}</h1>
          <p className="page-lead">Hôm nay bạn muốn chuẩn bị phần nào cho ngày cưới?</p>
          <section aria-labelledby="storage-title" className="mt-12 max-w-sm max-md:mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="storage-title" className="label">Dung lượng</h2>
              <p className="tnum text-sm text-muted">{usage}</p>
            </div>
            <div
              className="meter mt-2"
              role="progressbar"
              aria-labelledby="storage-title"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(used)}
              aria-valuetext={usage}
            >
              <span style={{ width: `${Math.max(used, used > 0 ? 1 : 0)}%` }} />
            </div>
          </section>
        </header>
        <nav aria-label="Việc cần làm">
          <ul className="rows">
            {destinations.map(([href, title, copy]) => (
              <li key={href}>
                <Link href={href} className="row-link group flex items-center gap-4 px-2 py-6">
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif text-h3 group-hover:underline">{title}</span>
                    <span className="mt-1 block text-muted">{copy}</span>
                  </span>
                  <ArrowRightIcon className="h-5 w-5 shrink-0 text-wine" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
