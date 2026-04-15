import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://korea-robotaxi-dashboard.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "한국 로보택시 대시보드 — 자율주행택시 현황 한눈에",
    template: "%s | 한국 로보택시 대시보드",
  },
  description:
    "한국 자율주행택시(로보택시) 도입 현황 실시간 대시보드. 기업별 운행 구역, SAE Level, 투자 현황, 시범운행지구, 정책 타임라인, 관련 뉴스를 한곳에서 확인하세요.",
  keywords: [
    "로보택시",
    "자율주행택시",
    "자율주행",
    "한국 자율주행",
    "로보택시 한국",
    "SWM",
    "카카오모빌리티 자율주행",
    "42dot",
    "라이드플럭스",
    "오토노머스에이투지",
    "모셔널",
    "쏘카 자율주행",
    "자율주행 시범운행지구",
    "Level 4 자율주행",
  ],
  authors: [{ name: "KR Robotaxi Dashboard" }],
  creator: "KR Robotaxi Dashboard",
  publisher: "KR Robotaxi Dashboard",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: "한국 로보택시 대시보드",
    title: "한국 로보택시 대시보드 — 자율주행택시 현황 한눈에",
    description:
      "한국 자율주행택시 도입 현황 실시간 대시보드. 기업, 운행 구역, 규제, 뉴스를 한눈에.",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "한국 로보택시 대시보드",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "한국 로보택시 대시보드",
    description:
      "한국 자율주행택시(로보택시) 도입 현황 실시간 대시보드.",
    images: ["/og-image.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

const navItems = [
  { href: "/", label: "대시보드" },
  { href: "/map", label: "지도" },
  { href: "/timeline", label: "타임라인" },
  { href: "/compare", label: "글로벌 비교" },
];

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "한국 로보택시 대시보드",
  alternateName: "KR Robotaxi Dashboard",
  url: SITE_URL,
  description:
    "한국 자율주행택시(로보택시) 도입 현황 실시간 대시보드. 기업, 운행 구역, 규제, 뉴스를 한눈에.",
  inLanguage: "ko-KR",
  publisher: {
    "@type": "Organization",
    name: "KR Robotaxi Dashboard",
    url: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 text-gray-900`}
      >
        <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <Link href="/" className="text-lg font-bold text-blue-700">
                KR Robotaxi
              </Link>
              <div className="flex gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
