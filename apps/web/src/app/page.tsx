import Image from 'next/image';
import { pixelButtonBase, pixelButtonVariants, pixelButtonSizes } from '@/components/PixelButton';
import { LandingRankingsPreview } from '@/components/rankings/LandingRankingsPreview';

const linkPrimary = `inline-block ${pixelButtonBase} ${pixelButtonSizes.lg} ${pixelButtonVariants.primary}`;
const linkSecondary = `inline-block ${pixelButtonBase} ${pixelButtonSizes.lg} ${pixelButtonVariants.secondary}`;
const linkGold = `inline-block ${pixelButtonBase} ${pixelButtonSizes.lg} ${pixelButtonVariants.gold}`;

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <Image
          src="/assets/zones/zone_ancient_grove.webp"
          alt="Ancient Grove"
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[var(--rpg-background)]" />
        <div className="relative z-10 text-center px-4 max-w-2xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold mb-4 text-[var(--rpg-gold)] drop-shadow-lg font-almendra rpg-gold-text-glow">
            PocketRealm
          </h1>
          <p className="text-xl md:text-2xl font-crimson text-[var(--rpg-text-primary)] mb-2">
            A turn-based RPG that respects your time.
          </p>
          <p className="text-base md:text-lg font-crimson text-[var(--rpg-text-secondary)] mb-8">
            Explore. Fight. Craft. Progress — at your own pace.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a href="/register" className={linkPrimary}>Play Free</a>
            <a href="#features" className={linkSecondary}>Learn More</a>
            <a href="/wiki" className={linkSecondary}>Game Wiki</a>
            <a href="/rankings" className={linkSecondary}>Rankings</a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: '/assets/ui/ui_attack-pixelated-128.webp',
                title: 'Fight',
                desc: 'Battle 80+ monsters across 11 zones. D&D-style combat with crits, spells, and boss raids.',
              },
              {
                icon: '/assets/ui/ui_explore-pixelated-128.webp',
                title: 'Explore',
                desc: 'Discover hidden caches, encounter sites, and zone exits. Every turn spent is a roll of the dice.',
              },
              {
                icon: '/assets/ui/ui_inventory-pixelated-128.webp',
                title: 'Craft',
                desc: 'Forge weapons, brew potions, salvage loot. 14 skills to master from weaponsmithing to alchemy.',
              },
              {
                icon: '/assets/ui/ui_turn-pixelated-128.webp',
                title: 'Play Your Way',
                desc: 'Turns regenerate in real-time. Play in bursts or binge your bank — no energy walls, no waiting rooms.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-6 text-center rpg-card-texture"
              >
                <Image
                  src={feature.icon}
                  alt={feature.title}
                  width={64}
                  height={64}
                  className="mx-auto mb-4 image-rendering-pixelated"
                />
                <h3 className="text-lg font-bold font-almendra text-[var(--rpg-gold)] mb-2">{feature.title}</h3>
                <p className="text-sm font-crimson text-[var(--rpg-text-secondary)]">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Zone Showcase */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold font-almendra text-center text-[var(--rpg-gold)] mb-12 rpg-gold-text-glow">
            11 Zones to Discover
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            {[
              { src: '/assets/zones/zone_ancient_grove.webp', name: 'Ancient Grove' },
              { src: '/assets/zones/zone_crystal_caverns.webp', name: 'Crystal Caverns' },
              { src: '/assets/zones/zone_haunted_marsh.webp', name: 'Haunted Marsh' },
              { src: '/assets/zones/zone_sunken_ruins.webp', name: 'Sunken Ruins' },
              { src: '/assets/zones/zone_deep_forest.webp', name: 'Deep Forest' },
            ].map((zone) => (
              <div
                key={zone.name}
                className="relative flex-shrink-0 w-72 h-44 rounded-lg overflow-hidden snap-center"
              >
                <Image
                  src={zone.src}
                  alt={zone.name}
                  fill
                  sizes="288px"
                  className="object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <span className="absolute bottom-3 left-3 text-[var(--rpg-gold)] font-bold text-sm font-almendra">
                  {zone.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Monster Parade */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold font-almendra text-center text-[var(--rpg-gold)] mb-12 rpg-gold-text-glow">
            80+ Monsters. 2 World Bosses. Good Luck.
          </h2>
          <div className="flex justify-center items-end gap-6 md:gap-10 flex-wrap">
            {[
              { src: '/assets/monsters/monster_goblin_king-pixelated-128.webp', name: 'Goblin King', size: 96 },
              { src: '/assets/monsters/monster_crystal_titan-pixelated-128.webp', name: 'Crystal Titan', size: 120 },
              { src: '/assets/monsters/monster_alpha_wolf-pixelated-128.webp', name: 'Alpha Wolf', size: 112 },
              { src: '/assets/monsters/monster_ancient_spirit-pixelated-128.webp', name: 'Ancient Spirit', size: 128 },
              { src: '/assets/monsters/monster_fae_queen-pixelated-128.webp', name: 'Fae Queen', size: 104 },
              { src: '/assets/monsters/monster_death_knight-pixelated-128.webp', name: 'Death Knight', size: 116 },
            ].map((monster) => (
              <div key={monster.name} className="flex flex-col items-center gap-2">
                <Image
                  src={monster.src}
                  alt={monster.name}
                  width={monster.size}
                  height={monster.size}
                  className="drop-shadow-[0_0_12px_rgba(212,168,75,0.3)] image-rendering-pixelated"
                  loading="lazy"
                />
                <span className="text-xs font-crimson text-[var(--rpg-text-secondary)]">{monster.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Support Pocketrealm */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="border border-rpg-gold/40 rounded-xl p-8 md:p-12 bg-gradient-to-b from-rpg-gold/5 to-transparent">
            <h2 className="text-3xl md:text-4xl font-bold font-almendra text-center text-[var(--rpg-gold)] mb-2 rpg-gold-text-glow">
              Support Pocketrealm
            </h2>
            <p className="text-center text-2xl font-bold font-crimson text-[var(--rpg-text-primary)] mb-2">
              £4.99 one-time
            </p>
            <p className="text-center font-crimson text-[var(--rpg-text-secondary)] mb-8">
              One-time purchase. Grants 30 days of Champion. Stacks if purchased again.
            </p>

            <LandingRankingsPreview />

            {/* Perks grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 text-sm">
              {[
                '10% more turns (24h bank cap)',
                '10% faster turn regen',
                '10% crafting crit bonus',
                '10% gathering yield & crit',
                '10% more chest & cache loot',
                '10% boss reward bonus',
                'Rainbow Champion title',
                'Leaderboard badge',
              ].map((perk) => (
                <div key={perk} className="flex items-center gap-2 font-crimson text-[var(--rpg-text-primary)]">
                  <span className="text-[var(--rpg-gold)]">+</span>
                  {perk}
                </div>
              ))}
            </div>

            <div className="text-center">
              <a href="/register" className={linkGold}>Support Pocketrealm</a>
              <p className="text-xs font-crimson text-[var(--rpg-text-secondary)] mt-3">
                Helps cover the server bill and gently pressures me into shipping more content.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-20 px-4 border-t border-[var(--rpg-border)]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold font-almendra text-[var(--rpg-gold)] mb-8 rpg-gold-text-glow">
            Your Journey Starts Now
          </h2>
          <div className="flex gap-4 justify-center mb-6 flex-wrap">
            <a href="/register" className={linkPrimary}>Play Free</a>
            <a href="/register" className={linkGold}>Support Pocketrealm</a>
          </div>
          <div className="flex gap-6 justify-center text-sm font-crimson">
            <a href="/login" className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors">
              Already playing? Log in
            </a>
            <a href="/wiki" className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-gold)] transition-colors">
              📜 Game Wiki
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
