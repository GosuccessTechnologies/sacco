import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { getActiveTheme, varsFromTokens, varsToCss, fontLinks } from "@/lib/theme";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/db";
import Script from "next/script";
import { Providers } from "@/components/providers";

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Divine Sacco Society Ltd — Growing Together, Prospering Together",
    template: "%s — Divine Sacco",
  },
  description: "Divine Sacco Society Ltd — savings, loans, shares and dividends for members across Kenya.",
  keywords: ["sacco", "savings", "loans", "dividends", "shares", "kenya"],
  manifest: "/manifest.member.webmanifest",
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: "Divine Sacco Society Ltd",
    description: "Save conveniently, borrow affordably, earn dividends.",
    siteName: "Divine Sacco",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0E7C5A",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // theme vars (server-rendered, no FOUC)
  const theme = await getActiveTheme().catch(() => null);
  const tokens = theme?.tokens ?? (await import("@/lib/theme")).FALLBACK_TOKENS;
  const lightVars = varsFromTokens(tokens);
  const darkVars = varsFromTokens({ ...tokens, ...(tokens.dark ?? {}), colors: { ...tokens.colors, ...(tokens.dark?.colors ?? {}) }, fonts: { ...tokens.fonts, ...(tokens.dark?.fonts ?? {}) } });
  const cssSheet = `:root{${varsToCss(lightVars)}}\n.dark{${varsToCss(darkVars)}}`;

  let seo = { titleTemplate: "%s — Divine Sacco", description: "" };
  try { seo = { ...seo, ...(await getSettings("seo")) }; } catch { /* db not ready */ }
  let fonts: string[] = [];
  try { fonts = fontLinks(tokens); } catch { /* offline */ }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style id="theme-vars" dangerouslySetInnerHTML={{ __html: cssSheet }} />
        {fonts.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body className={`${geistMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}>
        <Providers>{children}</Providers>
        <Toaster />
        <Script id="pwa-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw-member.js', {scope: '/'}).catch(function(){});
            });
          }
        `}</Script>
      </body>
    </html>
  );
}
