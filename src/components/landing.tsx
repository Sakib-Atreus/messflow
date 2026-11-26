import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowRight, Bell, ChefHat, LockKeyhole, Languages, ReceiptText, Sheet, ShoppingCart, Smartphone, UtensilsCrossed, Wallet,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LangSwitch } from "@/components/nav";
import { ThemeButton } from "@/components/theme-toggle";
import { btn, cn, Logo } from "@/components/ui";
import { fmtNumber } from "@/lib/format";
import { RotatingHeadline } from "@/components/rotating-headline";

const footLink =
  "inline-flex min-h-8 items-center rounded-md text-slate-600 hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-400";

/** The public home page for people who aren't logged in. */
export async function Landing() {
  const t = await getTranslations("landing");
  const app = await getTranslations("app");
  const features: [LucideIcon, string, string][] = [
    [UtensilsCrossed, "f1t", "f1d"], [ShoppingCart, "f2t", "f2d"], [ReceiptText, "f3t", "f3d"], [Wallet, "f4t", "f4d"],
    [Sheet, "f5t", "f5d"], [ChefHat, "f6t", "f6d"], [Bell, "f7t", "f7d"], [Languages, "f8t", "f8d"],
  ];
  const steps = [["s1t", "s1d"], ["s2t", "s2d"], ["s3t", "s3d"]] as const;
  const locale = await getLocale();
  const year = fmtNumber(locale, new Date().getFullYear()).replace(/[,،]/g, "");

  return (
    <div className="min-h-dvh bg-white dark:bg-slate-950">
      {/* navbar */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/85">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Logo className="size-9" />
            <span className="hidden text-lg font-bold tracking-tight text-brand-700 min-[400px]:inline dark:text-brand-400">{app("name")}</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeButton />
            <LangSwitch />
            <Link href="/login" className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
              {t("login")}
            </Link>
            <Link href="/signup" className={cn(btn.primary, "hidden min-h-10 px-4 text-sm sm:inline-flex")}>
              {t("start")}
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 -top-32 h-[28rem] bg-gradient-to-b from-brand-100/80 to-transparent blur-2xl dark:from-brand-950/70" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:px-8 lg:pb-24 lg:pt-20">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-sm font-medium text-brand-800 dark:border-brand-900 dark:bg-slate-900/60 dark:text-brand-300">
                <span className="size-2 rounded-full bg-brand-500" aria-hidden /> {t("badge")}
              </span>
              <RotatingHeadline
                lines={[t("h1"), t("h2"), t("h3")]}
                dotLabels={[1, 2, 3].map((n) => t("showLine", { n: fmtNumber(locale, n) }))}
                className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white"
              />
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-600 lg:mx-0 dark:text-slate-300">{t("subtitle")}</p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link href="/signup" className={cn(btn.primary, "min-h-12 w-full px-7 text-base sm:w-auto")}>
                  {t("start")} <ArrowRight className="size-4" />
                </Link>
                <Link href="/login" className={cn(btn.secondary, "min-h-12 w-full px-7 text-base sm:w-auto")}>
                  {t("login")}
                </Link>
              </div>
              <p className="mt-4 text-sm text-slate-500">
                {t("already")}{" "}
                <Link href="/login" className="font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
                  {t("loginHere")}
                </Link>
              </p>
            </div>

            {/* screenshots: laptop frame with a phone in front (phone only on small screens) */}
            <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
              <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 sm:block dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-1.5 border-b border-slate-200 px-3 py-2 dark:border-slate-800" aria-hidden>
                  <span className="size-2.5 rounded-full bg-red-400" /><span className="size-2.5 rounded-full bg-amber-400" /><span className="size-2.5 rounded-full bg-green-400" />
                </div>
                <Image src="/landing/desktop.webp" alt={t("shotAlt")} width={1440} height={1000} priority className="block w-full dark:hidden" />
                <Image src="/landing/desktop-dark.webp" alt={t("shotAlt")} width={1440} height={1000} priority className="hidden w-full dark:block" />
              </div>
              <div className="mx-auto w-56 overflow-hidden rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 shadow-2xl sm:absolute sm:-bottom-10 sm:-left-6 sm:w-40 lg:-left-10 lg:w-44 dark:border-slate-700">
                <Image src="/landing/phone.webp" alt={t("phoneAlt")} width={780} height={1688} priority className="block w-full" />
              </div>
            </div>
          </div>
        </section>

        {/* features */}
        <section id="features" className="scroll-mt-16 border-t border-slate-100 bg-slate-50/70 dark:border-slate-900 dark:bg-slate-900/40">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("featuresTitle")}</h2>
              <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">{t("featuresSub")}</p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(([Icon, title, body]) => (
                <div key={title} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-400">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{t(title)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t(body)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* steps */}
        <section id="steps" className="scroll-mt-16 mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">{t("stepsTitle")}</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map(([title, body], i) => (
              <li key={title} className="relative rounded-2xl border border-slate-200/80 p-6 dark:border-slate-800">
                <span className="grid size-10 place-items-center rounded-full bg-brand-600 text-lg font-bold text-white">
                  {fmtNumber(locale, i + 1)}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{t(title)}</h3>
                <p className="mt-1.5 text-slate-600 dark:text-slate-400">{t(body)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* install */}
        <section id="install" className="scroll-mt-16 border-y border-slate-100 bg-slate-50/70 dark:border-slate-900 dark:bg-slate-900/40">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Smartphone className="mx-auto size-8 text-brand-600 dark:text-brand-400" />
              <h2 className="mt-3 text-3xl font-bold tracking-tight">{t("installTitle")}</h2>
              <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">{t("installSub")}</p>
            </div>
            <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
              {([["android", "androidHow"], ["iphone", "iphoneHow"]] as const).map(([name, how]) => (
                <div key={name} className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="font-semibold">{t(name)}</div>
                  <p className="mt-1 text-slate-600 dark:text-slate-400">{t(how)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* final call to action */}
        <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-12 text-center text-white shadow-xl sm:px-12">
            <h2 className="text-3xl font-bold tracking-tight">{t("ctaTitle")}</h2>
            <p className="mt-2 text-lg text-brand-50/90">{t("ctaSub")}</p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-7 font-semibold text-brand-800 shadow-sm transition hover:bg-brand-50 sm:w-auto">
                {t("start")} <ArrowRight className="size-4" />
              </Link>
              <Link href="/login" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-white/40 px-7 font-semibold text-white transition hover:bg-white/10 sm:w-auto">
                {t("login")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/70 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-12 sm:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2">
              <Logo className="size-8" />
              <span className="text-lg font-bold tracking-tight text-brand-700 dark:text-brand-400">{app("name")}</span>
            </div>
            <p className="mt-2 max-w-xs text-sm text-slate-500">{t("footerTagline")}</p>
          </div>
          <nav aria-label={t("footerApp")}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("footerApp")}</h2>
            <ul className="mt-3 space-y-1 text-sm">
              <li><a href="#features" className={footLink}>{t("linkFeatures")}</a></li>
              <li><a href="#steps" className={footLink}>{t("linkSteps")}</a></li>
              <li><Link href="/login" className={footLink}>{t("login")}</Link></li>
              <li><Link href="/signup" className={footLink}>{t("start")}</Link></li>
            </ul>
          </nav>
          <nav aria-label={t("footerHelp")}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("footerHelp")}</h2>
            <ul className="mt-3 space-y-1 text-sm">
              <li><a href="#install" className={footLink}>{t("linkInstall")}</a></li>
              <li className="py-1 text-slate-500">{t("forgotPassword")}</li>
            </ul>
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-6 lg:px-8">
          <p className="flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200/80 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" />
            {t("trust")}
          </p>
        </div>
        <div className="border-t border-slate-200/70 dark:border-slate-800">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-sm text-slate-500 sm:flex-row lg:px-8">
            <span>© {year} {app("name")}</span>
            <LangSwitch />
          </div>
        </div>
      </footer>
    </div>
  );
}
