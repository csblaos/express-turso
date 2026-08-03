import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://okhaidee.codesabai.com"),
  title: "O KhaiDee+ | POS ຂາຍງ່າຍ ຈັດການຮ້ານໄດ້ຄົບ",
  description: "ລະບົບ POS ສຳລັບຮ້ານໃນລາວ ຈັດການການຂາຍ ສະຕັອກ ລາຍງານ ທີມງານ ແລະ ຫຼາຍຮ້ານໃນລະບົບດຽວ",
  keywords: ["POS Laos", "ระบบ POS", "โปรแกรมขายหน้าร้าน", "จัดการร้านค้า", "O KhaiDee", "ระบบสต็อก", "POS ร้านอาหาร"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "lo_LA",
    alternateLocale: ["th_TH", "en_US"],
    url: "/",
    siteName: "O KhaiDee+",
    title: "O KhaiDee+ — ຂາຍງ່າຍ ຈັດການຮ້ານໄດ້ຄົບ",
    description: "ລວມການຂາຍ ສະຕັອກ ລາຍງານ ແລະ ທີມງານໄວ້ໃນລະບົບດຽວ",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "O KhaiDee+ ระบบ POS สำหรับร้านยุคใหม่" }],
  },
  twitter: { card: "summary_large_image", title: "O KhaiDee+ — POS สำหรับร้านยุคใหม่", description: "ขายง่าย จัดการร้านได้ครบกว่า", images: ["/og.png"] },
  icons: { icon: "/okhaidee-logo.png", apple: "/apple-touch-icon.png" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="lo"><body className={jakarta.variable}>{children}</body></html>;
}
