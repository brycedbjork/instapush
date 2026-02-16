import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { Nav } from "@/components/nav";
import { TerminalDemo } from "@/components/terminal-demo";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <TerminalDemo />
      <Footer />
    </main>
  );
}
