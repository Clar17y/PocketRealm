import Image from 'next/image';
import { PixelButton } from '@/components/PixelButton';

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <Image
          src="/assets/zones/zone_ancient_grove.png"
          alt="Ancient Grove"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[var(--rpg-background)]" />
        <div className="relative z-10 text-center px-4 max-w-2xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold mb-4 text-[var(--rpg-gold)] drop-shadow-lg">
            Adventure RPG
          </h1>
          <p className="text-xl md:text-2xl text-[var(--rpg-text-primary)] mb-2">
            A turn-based RPG that respects your time.
          </p>
          <p className="text-base md:text-lg text-[var(--rpg-text-secondary)] mb-8">
            Explore. Fight. Craft. Progress — at your own pace.
          </p>
          <div className="flex gap-4 justify-center">
            <a href="/register">
              <PixelButton variant="primary" size="lg">Play Free</PixelButton>
            </a>
            <a href="#features">
              <PixelButton variant="secondary" size="lg">Learn More</PixelButton>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
