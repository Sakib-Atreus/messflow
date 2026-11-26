import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Landing } from "@/components/landing";
import { getSession } from "@/lib/mess";

/** Absolute site address for link previews (WhatsApp / Facebook need full URLs). */
function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  return {
    metadataBase: new URL(siteUrl()),
    title: { absolute: t("metaTitle") },
    description: t("metaDesc"),
    alternates: { languages: { bn: "/bn", en: "/en" } },
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDesc"),
      type: "website",
      locale: locale === "en" ? "en_US" : "bn_BD",
      images: [{ url: "/landing/og.png", width: 1200, height: 630, alt: t("shotAlt") }],
    },
    twitter: { card: "summary_large_image", title: t("metaTitle"), description: t("metaDesc"), images: ["/landing/og.png"] },
  };
}

/** Logged in → straight to the app (the dashboard sends khala to her kitchen page and the admin to the panel). */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await getSession();
  if (user) return redirect({ href: "/dashboard", locale });
  return <Landing />;
}
