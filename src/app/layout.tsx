import type { Metadata, Viewport } from "next";
import { PrivacySafeAnalytics } from "@/components/privacy-safe-analytics";
import { I18nProvider } from "@/i18n/provider";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Meu Cesto",
  title: { default: "Meu Cesto", template: "%s | Meu Cesto" },
  description: "Collaborative shopping lists, baskets, prices and private receipts.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
  appleWebApp: { capable: true, title: "Meu Cesto", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT" suppressHydrationWarning>
      <body>
        <I18nProvider>{children}</I18nProvider>
        <PrivacySafeAnalytics />
      </body>
    </html>
  );
}
