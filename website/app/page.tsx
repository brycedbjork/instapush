import { Commands } from "@/components/commands";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { TerminalDemo } from "@/components/terminal-demo";
import { WhatItIs } from "@/components/what-it-is";
import { WhyItMatters } from "@/components/why-it-matters";

export default function Home() {
  return (
    <main>
      <Hero />
      <WhatItIs />
      <TerminalDemo />
      <Commands />
      <WhyItMatters />
      <Footer />
    </main>
  );
}
