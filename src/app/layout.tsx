import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthGate } from "@/components/AuthGate";
import { Header } from "@/components/Header";
import { AuthProvider } from "@/hooks/useAuth";
import { PortfolioProvider } from "@/hooks/usePortfolio";
import { WorkspaceProvider } from "@/hooks/useWorkspace";
import { StorageNotice } from "@/components/StorageNotice";
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
  title: "Stockfolio — 나의 투자를, 나답게.",
  description:
    "자산의 흐름과 투자성과, 관심종목과 투자 생각을 연결하는 나만의 투자 공간.",
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
              <WorkspaceProvider>
                <div className="app-shell">
                  <Header />
                  <main id="main-content" className="main-content">
                    <StorageNotice />
                    {children}
                    <footer className="app-footer">
                      <span>
                        stockfolio. <span>나의 투자를, 나답게.</span>
                      </span>
                      <span>차곡차곡 쌓이는 투자 기록</span>
                    </footer>
                  </main>
                </div>
              </WorkspaceProvider>
            </PortfolioProvider>
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
