import type { Metadata } from "next";

import "@/app/globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { ToastHost } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "TurnFlow — the operating system for Airbnb turnovers",
  description:
    "Run your Airbnb like a real operation. Automate cleanings, enforce proof, keep your team accountable. Built for hosts managing 1–20+ properties.",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TurnFlow",
  },
};

export const viewport = {
  themeColor: "#16423c",
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <QueryProvider>{children}</QueryProvider>
        <ToastHost />
      </body>
    </html>
  );
}
