import type { Metadata } from "next";

import "@/app/globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { ToastHost } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Airbnb Ops Portal",
  description: "Operations portal for proof-based turnover management.",
  icons: {
    icon: "/favicon.svg",
  },
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
