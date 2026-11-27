"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { setAvatar } from "@/lib/actions/profile";
import { useFeedback } from "./feedback";
import { Avatar, btn, Spinner } from "./ui";

const SIZE = 256;

/** Center-crop to a square and shrink to 256×256 WebP (≈20–40 KB) right in the browser. */
async function toSmallSquare(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/webp", 0.85));
}

export function AvatarUpload({ userId, name, current }: { userId: string; name: string; current: string | null }) {
  const t = useTranslations("profile");
  const tErr = useTranslations("errors");
  const { toast, confirm } = useFeedback();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(current);
  const [busy, setBusy] = useState(false);
  // the upload client loads only when a photo is picked or removed (keeps the page light)
  const storage = async () => (await import("@/lib/supabase/client")).createBrowserSupabase().storage.from("avatars");
  const pathOf = (url: string | null) => url?.split("/storage/v1/object/public/avatars/")[1] ?? null;

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const blob = await toSmallSquare(file);
      const path = `${userId}/${Date.now()}.webp`;
      const bucket = await storage();
      const { error } = await bucket.upload(path, blob, { contentType: "image/webp", upsert: true });
      if (error) throw error;
      const url = bucket.getPublicUrl(path).data.publicUrl;
      const r = await setAvatar(url);
      if (r.error) throw new Error(tErr(r.error));
      const old = pathOf(preview);
      if (old) await bucket.remove([old]); // tidy up the previous picture
      setPreview(url);
      toast(t("photoSaved"));
      router.refresh();
    } catch {
      toast(t("photoError"), "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    if (!(await confirm({ body: t("remove") + "?", danger: true, confirmLabel: t("remove") }))) return;
    setBusy(true);
    const old = pathOf(preview);
    const r = await setAvatar(null);
    if (!r.error && old) await (await storage()).remove([old]);
    setBusy(false);
    if (r.error) return toast(tErr(r.error), "error");
    setPreview(null);
    toast(t("photoRemoved"));
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30"
        aria-label={preview ? t("change") : t("upload")}
      >
        <Avatar name={name} src={preview} className="size-24 text-2xl" />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100">
          {busy ? <Spinner className="size-6" /> : <Camera className="size-6" />}
        </span>
      </button>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn.secondary} disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Spinner /> : <Camera className="size-4" />} {busy ? t("uploading") : preview ? t("change") : t("upload")}
          </button>
          {preview && (
            <button type="button" className={btn.danger} disabled={busy} onClick={remove}>
              <Trash2 className="size-4" /> {t("remove")}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">{t("photoHelp")}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
    </div>
  );
}
