import { ImageResponse } from "next/og";
import { LOGO_DATA_URI } from "@/lib/logo";

const SIZES = new Set([32, 180, 192, 512]);

// PNG app icons rendered from the SVG logo, so no binary assets live in the repo.
// Plain icons are the round logo on transparent; the Apple and maskable variants need a
// full-bleed square, so they sit on the logo's original near-black backdrop.
export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Number((await params).size);
  const size = SIZES.has(n) ? n : 192;
  const maskable = new URL(req.url).searchParams.has("maskable");
  const square = maskable || size === 180;
  const logo = Math.round(size * (maskable ? 0.72 : square ? 0.8 : 1));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: square ? "#070b0a" : "transparent",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_DATA_URI} width={logo} height={logo} alt="" />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
