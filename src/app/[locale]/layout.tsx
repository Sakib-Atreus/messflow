import type { Metadata, Viewport } from "next";
import { Hind_Siliguri } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SwRegister } from "@/components/sw-register";
import { FeedbackProvider } from "@/components/feedback";
import { ThemeSync } from "@/components/theme-toggle";
import { THEME_SCRIPT } from "@/lib/theme";
import "../globals.css";

const font = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hind",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  return {
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("tagline"),
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: t("name"), statusBarStyle: "default" },
    icons: {
      icon: [
        { url: "/logo.svg", type: "image/svg+xml" },
        { url: "/icons/32", sizes: "32x32", type: "image/png" },
      ],
      apple: "/icons/180",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0e8f3f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* runs before paint so the page never flashes the wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${font.variable} font-sans antialiased`} suppressHydrationWarning>
        <NextIntlClientProvider>
          <FeedbackProvider>{children}</FeedbackProvider>
          <SwRegister />
          <ThemeSync />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
