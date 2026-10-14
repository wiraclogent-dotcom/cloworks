import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { LucideProvider } from "lucide-react";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

/** One family for body text and display (`font-sans`, `font-display`): Archivo, a variable font (V3 flat blue). */
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"] });

export const metadata: Metadata = {
  // Pages set a short `title`; the template appends the app name ("Requests · Cloworks").
  title: { default: "Cloworks", template: "%s · Cloworks" },
  description: "Request, track and measure creative work.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // data-theme="light" is the server default; the blocking script below may switch it to "dark" before first paint,
  // so the attribute differs from the server HTML on purpose (suppressHydrationWarning covers <html> only).
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${archivo.variable} h-full antialiased`}>
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
