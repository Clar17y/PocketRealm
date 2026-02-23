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

      {/* Features */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: '/assets/ui/ui_attack.png',
                title: 'Fight',
                desc: 'Battle 80+ monsters across 11 zones. D&D-style combat with crits, spells, and boss raids.',
              },
              {
                icon: '/assets/ui/ui_explore.png',
                title: 'Explore',
                desc: 'Discover hidden caches, encounter sites, and zone exits. Every turn spent is a roll of the dice.',
              },
              {
                icon: '/assets/ui/ui_inventory.png',
                title: 'Craft',
                desc: 'Forge weapons, brew potions, salvage loot. 14 skills to master from weaponsmithing to alchemy.',
              },
              {
                icon: '/assets/ui/ui_turn.png',
                title: 'Play Your Way',
                desc: 'Turns regenerate in real-time. Play in bursts or binge your bank — no energy walls, no waiting rooms.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-6 text-center"
              >
                <Image
                  src={feature.icon}
                  alt={feature.title}
                  width={64}
                  height={64}
                  className="mx-auto mb-4"
                />
                <h3 className="text-lg font-bold text-[var(--rpg-gold)] mb-2">{feature.title}</h3>
                <p className="text-sm text-[var(--rpg-text-secondary)]">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
