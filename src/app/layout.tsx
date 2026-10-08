import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { LucideProvider } from "lucide-react";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Pages set a short `title`; the template appends the app name ("Requests · Creative Tracker").
  title: { default: "Creative Tracker", template: "%s · Creative Tracker" },
  description: "Request, track and measure creative work.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // data-theme="light" is the server default; the blocking script below may switch it to "dark" before first paint,
  // so the attribute differs from the server HTML on purpose (suppressHydrationWarning covers <html> only).
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {/* Icons: 1.75 stroke everywhere (spec). */}
        <LucideProvider strokeWidth={1.75}>{children}</LucideProvider>
      </body>
    </html>
  );
}
