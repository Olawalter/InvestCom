import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/context/WalletContext";
import { Navbar } from "@/components/Navbar";
import { Toaster } from "@/components/ui/Toaster";

export const metadata: Metadata = {
  title: "Investment Committee — DAO Treasury Evaluation on GenLayer",
  description:
    "Policy-aware DAO investment committee powered by GenLayer consensus. Evaluate treasury proposals by risk, liquidity, fundamentals, governance, and treasury objectives.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <Navbar />
          <main className="min-h-screen pt-16">{children}</main>
          <Toaster />
        </WalletProvider>
      </body>
    </html>
  );
}
