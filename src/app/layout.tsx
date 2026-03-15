import type { Metadata } from "next";
import { Kalam, Patrick_Hand } from "next/font/google";
import "./globals.css";

const kalam = Kalam({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-kalam",
});

const patrickHand = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-patrick-hand",
});

export const metadata: Metadata = {
  title: "CPR Glove Monitor",
  description: "Real-time CPR feedback dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body 
        className={`${kalam.variable} ${patrickHand.variable} antialiased min-h-screen text-foreground bg-background font-body`}
        style={{ 
          backgroundImage: 'radial-gradient(#e5e0d8 1px, transparent 1px)', 
          backgroundSize: '24px 24px' 
        }}
      >
        {children}
      </body>
    </html>
  );
}
