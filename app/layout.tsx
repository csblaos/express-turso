import type { Metadata } from "next";
import { Noto_Sans_Thai, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const thai = Noto_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://okhaidee.codesabai.com"),
  title: "O KhaiDee+ | POS ขายง่าย จัดการร้านได้ครบกว่า",
  description: "ระบบ POS สำหรับร้านค้าในลาว จัดการงานขาย สต็อก รายงาน ทีมงาน และหลายสาขาในระบบเดียว ติดต่อเพื่อขอดูตัวอย่างผ่าน WhatsApp",
  keywords: ["POS Laos", "ระบบ POS", "โปรแกรมขายหน้าร้าน", "จัดการร้านค้า", "O KhaiDee", "ระบบสต็อก", "POS ร้านอาหาร"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "th_TH",
    url: "/",
    siteName: "O KhaiDee+",
    title: "O KhaiDee+ — ขายง่าย จัดการร้านได้ครบกว่า",
    description: "รวมงานขาย สต็อก รายงาน และทีมงานไว้ในระบบเดียว พร้อมเติบโตไปกับร้านของคุณ",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "O KhaiDee+ ระบบ POS สำหรับร้านยุคใหม่" }],
  },
  twitter: { card: "summary_large_image", title: "O KhaiDee+ — POS สำหรับร้านยุคใหม่", description: "ขายง่าย จัดการร้านได้ครบกว่า", images: ["/og.png"] },
  icons: { icon: "/okhaidee-logo.png", apple: "/apple-touch-icon.png" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body className={`${thai.variable} ${jakarta.variable}`}>{children}</body></html>;
}
