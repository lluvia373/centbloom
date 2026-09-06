import { AuthGate } from "@/components/AuthGate";
import { Header } from "@/components/Header";
import { StorageNotice } from "@/components/StorageNotice";
import { AuthProvider } from "@/hooks/useAuth";
import { PortfolioProvider } from "@/hooks/usePortfolio";
import { WorkspaceProvider } from "@/hooks/useWorkspace";
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
  applicationName: "Centifolio",
  title: "Centifolio — 나의 투자를, 나답게.",
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
              <WorkspaceProvider>
                <div className="app-shell">
                  <Header />
                  <main id="main-content" className="main-content">
                    <StorageNotice />
                    {children}
                    <footer className="app-footer">
                      <span>
                        centifolio <span>나의 투자를, 나답게.</span>
                      </span>
                      <a href="https://elbstream.com" target="_blank" rel="noreferrer" className="company-logo-credit">로고 · Elbstream</a>
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
