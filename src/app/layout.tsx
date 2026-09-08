import { PageFrame } from "@/components/PageFrame";
import { InvestmentNavigation } from "@/features/navigation";
import { AuthGate } from "@/components/AuthGate";
import { Header } from "@/components/Header";
import { StorageNotice } from "@/components/StorageNotice";
import { AuthProvider } from "@/hooks/useAuth";
import { PortfolioProvider } from "@/hooks/usePortfolio";
import "@/styles/charts.css";
import "@/styles/portfolio.css";
import "@/styles/workspace.css";
import type { Metadata,Viewport } from "next";
import { Geist,Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Centbloom",
  title: "센트블룸 | Centbloom",
  metadataBase: new URL("https://centbloom.stock-web-demo.workers.dev"),
  openGraph: { siteName: "Centbloom", locale: "ko_KR", type: "website" },
  description:
    "자산의 흐름과 투자성과, 관심종목과 투자 생각을 연결하는 나만의 투자 공간.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body>
        <AuthProvider>
          <AuthGate>
            <PortfolioProvider>
                <div className="app-shell">
                  <Header />
                  <PageFrame>
                    <InvestmentNavigation />
                    <StorageNotice />
                    {children}
                    <footer className="app-footer">
                      <a href="https://elbstream.com" target="_blank" rel="noreferrer" className="company-logo-credit">로고 · Elbstream</a>
                    </footer>
                  </PageFrame>
                </div>
            </PortfolioProvider>
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
