import { getEnv } from "@/server/env";
import { SignInForm } from "@/components/sign-in-form";
import { AlertIcon, CheckIcon } from "@/components/icons";

const afterSignIn = [
  "Lưu bản nhạc riêng và cắt đúng đoạn cần phát.",
  "Xuất MP3 cho từng phần lễ.",
  "Lập kế hoạch lễ và bàn giao bộ MP3 đã nghe thử.",
];

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const env = getEnv();
  return (
    <div className="wrap page">
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] max-md:gap-8">
        <div className="min-w-0">
          <h1 className="page-title">Đăng nhập</h1>
          <p className="page-lead">Đăng nhập để giữ thư viện nhạc và kế hoạch lễ của bạn ở một nơi.</p>
          <h2 className="label mt-12 max-md:mt-8">Sau khi đăng nhập, bạn có thể</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {afterSignIn.map((line) => (
              <li key={line} className="flex items-start gap-3">
                <CheckIcon className="mt-1 h-5 w-5 shrink-0 text-wine" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <section className="panel flex flex-col gap-4" aria-label="Cách đăng nhập">
          {params.error ? (
            <p className="notice notice-error" role="alert">
              <AlertIcon />
              <span>Đăng nhập chưa hoàn tất. Hãy thử lại.</span>
            </p>
          ) : null}
          <a
            className="btn btn-primary w-full"
            href={`/api/auth/google?next=${encodeURIComponent(params.next ?? "/bang-dieu-khien")}`}
          >
            Đăng nhập bằng Google
          </a>
          <p className="hint">
            Google là cách đăng nhập của sản phẩm. Máy này chưa có mã ứng dụng Google thì nút Google sẽ báo chưa cấu hình.
          </p>
          {env.authTestMode ? <SignInForm /> : null}
        </section>
      </div>
    </div>
  );
}
