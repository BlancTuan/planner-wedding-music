import Link from "next/link";
import { ArrowRightIcon, CheckIcon, ClockIcon, HeadphonesIcon, PackageIcon, ScissorsIcon, SearchIcon } from "@/components/icons";
import { listCategories } from "@/server/catalog";

const heroLines = ["Nhạc cưới cho", "từng nghi lễ, cắt", "sẵn thành MP3."];

const steps = [
  {
    icon: SearchIcon,
    title: "Chọn bài theo phần lễ",
    copy: "Tìm trong mục lục theo phần lễ và giọng hát, hoặc tải file MP3, WAV của chính bạn.",
    href: "/kham-pha",
    action: "Xem nhạc theo phần lễ",
  },
  {
    icon: ScissorsIcon,
    title: "Cắt đúng đoạn cần phát",
    copy: "Kéo điểm cắt trên dạng sóng, đặt fade và gain. Mỗi lần lưu là một bản chỉnh riêng, file gốc giữ nguyên.",
    href: "/thu-vien",
    action: "Mở thư viện nhạc",
  },
  {
    icon: PackageIcon,
    title: "Bàn giao cho người phát nhạc",
    copy: "Một gói ZIP gồm các MP3 đã nghe, hướng dẫn PDF và bảng CSV theo đúng thứ tự lễ.",
    href: "/ke-hoach",
    action: "Xem kế hoạch lễ",
  },
];

const demoBars = Array.from({ length: 72 }, (_, index) => {
  const value = 0.35 + 0.3 * Math.sin(index / 3.1) * Math.sin(index / 7.7) + 0.25 * Math.abs(Math.sin(index * 1.7));
  return Math.round(Math.min(1, Math.max(0.12, value)) * 100);
});

function ProductFrame() {
  return (
    <div
      role="img"
      aria-label="Minh hoạ màn hình kế hoạch lễ: ba phần lễ có giờ dự kiến, một phần đang mở trình cắt nhạc với đoạn chọn dài 1 phút 20 giây."
      className="enter-frame relative rounded-lg border border-line bg-paper p-6 shadow-float max-md:p-4"
      style={{ animationDelay: "120ms" }}
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="label">Kế hoạch</p>
          <p className="font-serif text-h3">Lễ gia tiên nhà gái</p>
        </div>
        <span className="chip chip-ok"><CheckIcon />Sẵn sàng</span>
      </div>
      <ol className="mt-2">
        <li className="flex items-center gap-4 border-b border-line py-3">
          <span className="tnum w-12 text-sm text-muted">16:00</span>
          <span className="flex-1">Đón khách</span>
          <span className="chip">2 điểm nhạc</span>
        </li>
        <li className="border-b border-line py-3">
          <div className="flex items-center gap-4">
            <span className="tnum w-12 text-sm text-wine">16:20</span>
            <span className="flex-1 font-medium">Lối vào cô dâu</span>
            <span className="chip chip-accent">Đang sửa</span>
          </div>
          <div className="mt-3 rounded-md bg-studio-panel p-3 text-studio-text">
            <div className="relative flex h-16 items-center gap-[2px]">
              {demoBars.map((height, index) => (
                <span
                  key={index}
                  className="flex-1 rounded-[1px]"
                  style={{ height: `${height}%`, background: index >= 18 && index <= 52 ? "var(--studio-wave-on)" : "var(--studio-wave)" }}
                />
              ))}
              <span className="absolute inset-y-0 left-[25%] w-0.5 bg-studio-accent" />
              <span className="absolute inset-y-0 left-[72.5%] w-0.5 bg-studio-accent" />
            </div>
            <div className="mt-2 flex items-center justify-between text-label text-studio-muted">
              <span className="tnum">0:42.0</span>
              <span className="tnum text-studio-accent">Đoạn chọn 1:20.0</span>
              <span className="tnum">2:02.0</span>
            </div>
          </div>
        </li>
        <li className="flex items-center gap-4 py-3">
          <span className="tnum w-12 text-sm text-muted">16:45</span>
          <span className="flex-1">Trao nhẫn</span>
          <span className="chip chip-warn"><ClockIcon />Chưa nghe</span>
        </li>
      </ol>
    </div>
  );
}

async function ceremonyStages() {
  try {
    const categories = await listCategories();
    return categories.filter((item) => item.kind === "CEREMONY");
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const stages = await ceremonyStages();
  return (
    <div>
      <section aria-labelledby="hero-title" className="border-b border-line">
        <div className="wrap grid items-center gap-12 py-24 max-lg:py-16 max-md:py-12 lg:min-h-[min(760px,calc(100svh-var(--nav-h)))] lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="eyebrow enter-up">Nhạc cho lễ cưới Việt</p>
            <h1 id="hero-title" className="mt-4 font-serif text-display font-normal">
              {heroLines.map((line, index) => (
                <span key={line} className="enter-line block" style={{ animationDelay: `${index * 80}ms` }}>{line}</span>
              ))}
            </h1>
            <p className="enter-up mt-6 max-w-measure text-lead text-muted" style={{ animationDelay: "320ms" }}>
              Chọn nhạc từ đón khách tới tiễn khách, cắt đúng đoạn trên dạng sóng, rồi bàn giao một gói MP3 kèm hướng dẫn cho người phát nhạc.
            </p>
            <div className="enter-up mt-8 flex flex-wrap gap-3 max-sm:flex-col" style={{ animationDelay: "380ms" }}>
              <Link href="/kham-pha" className="btn btn-primary">
                Tìm nhạc lễ
                <ArrowRightIcon />
              </Link>
              <Link href="/ke-hoach" className="btn btn-secondary">Lập kế hoạch lễ</Link>
            </div>
            <p className="enter-up mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted" style={{ animationDelay: "440ms" }}>
              {stages.length > 0 ? (
                <span className="flex items-center gap-2"><CheckIcon className="h-4 w-4 text-ok" />{stages.length} phần lễ gợi ý sẵn</span>
              ) : null}
              <span className="flex items-center gap-2"><HeadphonesIcon className="h-4 w-4 text-wine" />Không tự phát nhạc theo giờ</span>
            </p>
          </div>
          <div className="lg:col-span-5">
            <ProductFrame />
          </div>
        </div>
      </section>

      {stages.length > 0 ? (
        <section aria-labelledby="stages-title" className="py-24 max-md:py-16">
          <div className="wrap grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 id="stages-title" className="section-title">{stages.length} phần lễ, sắp theo nếp cưới Việt</h2>
              <p className="mt-4 max-w-measure text-base text-muted">
                Kế hoạch gợi ý bắt đầu với đủ các phần dưới đây. Bạn đổi tên, sắp lại, thêm hoặc bỏ phần nào cũng được. Chọn một phần để xem nhạc hợp với nó.
              </p>
            </div>
            <ol className="grid gap-x-12 sm:grid-cols-2 lg:col-span-8">
              {stages.map((stage, index) => (
                <li key={stage.id} className="border-b border-line">
                  <Link
                    href={`/kham-pha?stage=${encodeURIComponent(stage.slug)}`}
                    className="group flex min-h-[64px] items-baseline gap-4 py-4 no-underline"
                  >
                    <span className="tnum w-8 shrink-0 font-serif text-lead text-wine">{String(index + 1).padStart(2, "0")}</span>
                    <span className="font-serif text-h3 decoration-wine decoration-1 underline-offset-4 group-hover:underline">{stage.nameVi}</span>
                    <ArrowRightIcon className="ml-auto h-4 w-4 shrink-0 self-center text-muted transition-transform group-hover:translate-x-[3px] group-hover:text-wine" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="flow-title" className="band py-24 max-md:py-16">
        <div className="wrap">
          <h2 id="flow-title" className="section-title max-w-[20ch]">Từ bài hát tới file bàn giao</h2>
          <ol className="mt-12 grid gap-8 md:grid-cols-3 max-md:mt-8">
            {steps.map((step, index) => (
              <li key={step.title} className="flex flex-col border-t border-champagne-deep pt-6">
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-wine">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <span className="tnum font-serif text-lead text-muted">Bước {index + 1}</span>
                </span>
                <h3 className="mt-4 font-serif text-h3">{step.title}</h3>
                <p className="mt-2 max-w-measure text-base">{step.copy}</p>
                <Link href={step.href} className="link mt-4 inline-flex min-h-[44px] items-center gap-2 self-start">
                  {step.action}
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="close-title" className="py-24 max-md:py-16">
        <div className="wrap flex flex-wrap items-end justify-between gap-8">
          <div>
            <h2 id="close-title" className="section-title max-w-[24ch]">Gói bàn giao chỉ gồm những bản bạn đã nghe lại.</h2>
            <p className="mt-4 max-w-measure text-base text-muted">
              Trước khi tạo gói, trang kiểm tra sẵn sàng liệt kê từng phần còn thiếu nhạc, chưa xuất MP3 hoặc chưa được nghe.
            </p>
          </div>
          <Link href="/ke-hoach" className="btn btn-secondary max-sm:w-full">Lập kế hoạch lễ</Link>
        </div>
      </section>
    </div>
  );
}
