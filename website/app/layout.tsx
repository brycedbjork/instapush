import type { Metadata } from "next";
import { inter, jetbrainsMono } from "@/lib/fonts";
import "./globals.css";

const title = "git-jazz — AI-powered git workflows";
const description =
  "Beautiful AI-powered git commit, push, pull, and merge. One command replaces noisy git output with guided terminal experiences.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL("https://gitjazz.com"),
  openGraph: {
    title,
    description,
    url: "https://gitjazz.com",
    siteName: "git-jazz",
    images: ["/og.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className="dark" lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
