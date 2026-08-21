import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Logarithmic Solar System",
    template: "%s · Logarithmic Solar System",
  },
  description:
    "NASA와 JPL 기반 실제 천문 데이터를 로그 거리와 가시성 강화 크기로 탐험하는 인터랙티브 3D 태양계입니다.",
  openGraph: {
    title: "Logarithmic Solar System",
    description:
      "태양부터 명왕성, 주요 위성까지 실제 궤도 비율로 탐험하는 인터랙티브 3D 시각화.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Logarithmic Solar System",
    description: "실제 천문 데이터로 움직이는 인터랙티브 3D 태양계.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
