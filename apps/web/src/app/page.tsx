import Image from 'next/image';
import { ChampionBadge } from '@/components/common/ChampionBadge';
import { pixelButtonBase, pixelButtonVariants, pixelButtonSizes } from '@/components/PixelButton';

const linkPrimary = `inline-block ${pixelButtonBase} ${pixelButtonSizes.lg} ${pixelButtonVariants.primary}`;
const linkSecondary = `inline-block ${pixelButtonBase} ${pixelButtonSizes.lg} ${pixelButtonVariants.secondary}`;
const linkGold = `inline-block ${pixelButtonBase} ${pixelButtonSizes.lg} ${pixelButtonVariants.gold}`;

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
          <div className="flex gap-4 justify-center flex-wrap">
            <a href="/register" className={linkPrimary}>Play Free</a>
            <a href="#features" className={linkSecondary}>Learn More</a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: '/assets/ui/ui_attack-pixelated-128.png',
                title: 'Fight',
                desc: 'Battle 80+ monsters across 11 zones. D&D-style combat with crits, spells, and boss raids.',
              },
              {
                icon: '/assets/ui/ui_explore-pixelated-128.png',
                title: 'Explore',
                desc: 'Discover hidden caches, encounter sites, and zone exits. Every turn spent is a roll of the dice.',
              },
              {
                icon: '/assets/ui/ui_inventory-pixelated-128.png',
                title: 'Craft',
                desc: 'Forge weapons, brew potions, salvage loot. 14 skills to master from weaponsmithing to alchemy.',
              },
              {
                icon: '/assets/ui/ui_turn-pixelated-128.png',
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
                  className="mx-auto mb-4 image-rendering-pixelated"
                />
                <h3 className="text-lg font-bold text-[var(--rpg-gold)] mb-2">{feature.title}</h3>
                <p className="text-sm text-[var(--rpg-text-secondary)]">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Zone Showcase */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-[var(--rpg-gold)] mb-12">
            11 Zones to Discover
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            {[
              { src: '/assets/zones/zone_ancient_grove.png', name: 'Ancient Grove' },
              { src: '/assets/zones/zone_crystal_caverns.png', name: 'Crystal Caverns' },
              { src: '/assets/zones/zone_haunted_marsh.png', name: 'Haunted Marsh' },
              { src: '/assets/zones/zone_sunken_ruins.png', name: 'Sunken Ruins' },
              { src: '/assets/zones/zone_deep_forest.png', name: 'Deep Forest' },
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
                <span className="absolute bottom-3 left-3 text-[var(--rpg-gold)] font-bold text-sm">
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
          <h2 className="text-3xl md:text-4xl font-bold text-center text-[var(--rpg-gold)] mb-12">
            80+ Monsters. 2 World Bosses. Good Luck.
          </h2>
          <div className="flex justify-center items-end gap-6 md:gap-10 flex-wrap">
            {[
              { src: '/assets/monsters/monster_goblin_king-pixelated-128.png', name: 'Goblin King', size: 96 },
              { src: '/assets/monsters/monster_crystal_titan-pixelated-128.png', name: 'Crystal Titan', size: 120 },
              { src: '/assets/monsters/monster_alpha_wolf-pixelated-128.png', name: 'Alpha Wolf', size: 112 },
              { src: '/assets/monsters/monster_ancient_spirit-pixelated-128.png', name: 'Ancient Spirit', size: 128 },
              { src: '/assets/monsters/monster_fae_queen-pixelated-128.png', name: 'Fae Queen', size: 104 },
              { src: '/assets/monsters/monster_death_knight-pixelated-128.png', name: 'Death Knight', size: 116 },
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
                <span className="text-xs text-[var(--rpg-text-secondary)]">{monster.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Champion Subscription */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="border border-rpg-gold/40 rounded-xl p-8 md:p-12 bg-gradient-to-b from-rpg-gold/5 to-transparent">
            <h2 className="text-3xl md:text-4xl font-bold text-center text-[var(--rpg-gold)] mb-2">
              Go Champion
            </h2>
            <p className="text-center text-2xl font-bold text-[var(--rpg-text-primary)] mb-2">
              £4.99/month
            </p>
            <p className="text-center text-[var(--rpg-text-secondary)] mb-8">
              Everything you do, 10% better.
            </p>

            {/* Mock leaderboard preview */}
            <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-4 mb-8 flex items-center justify-center gap-3 text-sm flex-wrap">
              <span className="text-[var(--rpg-text-secondary)]">#1</span>
              <ChampionBadge size="sm" />
              <span className="text-[var(--rpg-text-primary)] font-semibold">YourName</span>
              <span className="rainbow-title">Champion</span>
              <span className="text-[var(--rpg-text-secondary)]">Lv. 42</span>
            </div>

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
                <div key={perk} className="flex items-center gap-2 text-[var(--rpg-text-primary)]">
                  <span className="text-[var(--rpg-gold)]">+</span>
                  {perk}
                </div>
              ))}
            </div>

            <div className="text-center">
              <a href="/register" className={linkGold}>Become Champion</a>
              <p className="text-xs text-[var(--rpg-text-secondary)] mt-3">
                No combat advantages. No pay-to-win. Just efficiency.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-20 px-4 border-t border-[var(--rpg-border)]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-[var(--rpg-text-primary)] mb-8">
            Your Adventure Starts Now
          </h2>
          <div className="flex gap-4 justify-center mb-6 flex-wrap">
            <a href="/register" className={linkPrimary}>Play Free</a>
            <a href="/register" className={linkGold}>Become Champion</a>
          </div>
          <a href="/login" className="text-sm text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors">
            Already playing? Log in
          </a>
        </div>
      </section>
    </main>
  );
}
