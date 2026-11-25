"use client";

import Link from "next/link";
import { useState } from "react";
import { newIdempotencyKey } from "@/components/idempotency-key";
import { CheckIcon, PlusIcon } from "@/components/icons";

export function AddToLibraryButton({
  trackId,
  title,
  savedAssetId,
}: {
  trackId: string;
  title: string;
  savedAssetId: string | null;
}) {
  const [assetId, setAssetId] = useState(savedAssetId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (assetId) {
    return (
      <Link href={`/bien-tap/${assetId}`} className="btn btn-sm btn-secondary" aria-label={`Mở ${title} trong thư viện`}>
        <CheckIcon />
        Đã có trong thư viện
      </Link>
    );
  }

  async function add() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/catalog/tracks/${trackId}/library`, {
        method: "POST",
        headers: { "idempotency-key": newIdempotencyKey() },
      });
      if (response.status === 401) {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/dang-nhap?next=${encodeURIComponent(next)}`;
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.assetId) {
        setError(body?.error?.message ?? "Không thêm được vào thư viện.");
        setPending(false);
        return;
      }
      setAssetId(body.assetId);
      setPending(false);
    } catch {
      setError("Không thêm được vào thư viện.");
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        aria-label={`Thêm ${title} vào thư viện`}
        disabled={pending}
        onClick={() => void add()}
      >
        <PlusIcon />
        {pending ? "Đang thêm…" : "Thêm vào thư viện"}
      </button>
      {error ? (
        <span className="text-sm text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
