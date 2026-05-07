import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import { PVP_CONSTANTS } from '@pocketrealm/shared';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'ELO & Matchmaking - Pocketrealm Wiki',
  description:
    'ELO rating formula, K-factor, draws, matchmaking bracket, and example calculations.',
};

const pvpRelated = [
  { label: 'PvP Combat', href: '/wiki/pvp/combat' },
  { label: 'Hit Chance', href: '/wiki/combat/hit-chance' },
];

type MatchResult = 'win' | 'loss' | 'draw';

function eloExample(ratingA: number, ratingB: number, result: MatchResult) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const scoreA = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  const delta = Math.round(PVP_CONSTANTS.K_FACTOR * (scoreA - expectedA));
  return { ratingA, ratingB, result, expectedA, delta, newRating: Math.max(0, ratingA + delta) };
}

const examples = [
  eloExample(1000, 1000, 'win'),
  eloExample(1000, 1000, 'draw'),
  eloExample(1000, 1000, 'loss'),
  eloExample(1200, 800, 'win'),
  eloExample(1200, 800, 'loss'),
  eloExample(800, 1200, 'win'),
  eloExample(800, 1200, 'loss'),
  eloExample(1500, 1000, 'win'),
  eloExample(1500, 1000, 'loss'),
];

export default function EloPage() {
  return (
    <WikiSection
      title="ELO & Matchmaking"
      summary="PvP arena uses an ELO rating system to track skill and match players of similar strength. Wins against stronger opponents yield large gains, losses to weaker ones result in big drops, and draws use a half score."
      related={pvpRelated}
    >
      <h2>Starting Rating</h2>
      <p>
        Every player begins with a rating of{' '}
        <Const>{PVP_CONSTANTS.STARTING_RATING}</Const>. Rating cannot drop
        below 0.
      </p>

      <h2>Expected Score</h2>
      <p>
        The expected score represents the probability that player A beats
        player B, based on their rating difference:
      </p>
      <FormulaBlock>
        <Out>expectedA</Out> <Op>=</Op> <Const>1</Const> <Op>/</Op>{' '}
        <Op>(</Op><Const>1</Const> <Op>+</Op> <Const>10</Const>
        <Op>^</Op><Op>((</Op><Var>ratingB</Var> <Op>-</Op>{' '}
        <Var>ratingA</Var><Op>)</Op> <Op>/</Op> <Const>400</Const>
        <Op>))</Op>
      </FormulaBlock>
      <p>
        When both players have the same rating, expectedA = 0.5 (coin flip).
        A 400-point advantage gives roughly 91% expected win rate.
      </p>

      <h2>Rating Change</h2>
      <p>
        After each match, player A receives a score of 1 for a win, 0.5 for a
        draw, or 0 for a loss. Rating changes are then calculated from the
        difference between that score and the expected score:
      </p>
      <FormulaBlock>
        <Out>deltaA</Out> <Op>=</Op> <Op>round(</Op>
        <Const>{PVP_CONSTANTS.K_FACTOR}</Const> <Op>&times;</Op> <Op>(</Op>
        <Var>scoreA</Var> <Op>-</Op> <Var>expectedA</Var><Op>))</Op>
        <Comment> {'//'} scoreA = 1 win, 0.5 draw, 0 loss</Comment>
      </FormulaBlock>
      <FormulaBlock>
        <Out>newRatingA</Out> <Op>=</Op> <Op>max(</Op><Const>0</Const>
        <Op>,</Op> <Var>ratingA</Var> <Op>+</Op> <Var>deltaA</Var><Op>)</Op>
        <Comment> {'//'} rating floor at 0</Comment>
      </FormulaBlock>
      <p>
        The K-factor of <Const>{PVP_CONSTANTS.K_FACTOR}</Const> controls how
        much each match matters. A higher K-factor means faster rating swings.
      </p>

      <h2>Example Calculations</h2>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Player A</th>
            <th>Player B</th>
            <th>Result</th>
            <th>Expected</th>
            <th>Delta</th>
            <th>New Rating</th>
          </tr>
        </thead>
        <tbody>
          {examples.map((ex, i) => (
            <tr key={i}>
              <td>{ex.ratingA}</td>
              <td>{ex.ratingB}</td>
              <td>{ex.result === 'win' ? 'A wins' : ex.result === 'draw' ? 'Draw' : 'A loses'}</td>
              <td>{(ex.expectedA * 100).toFixed(1)}%</td>
              <td className={ex.delta > 0 ? 'text-green-400' : ex.delta < 0 ? 'text-red-400' : undefined}>
                {ex.delta > 0 ? '+' : ''}{ex.delta}
              </td>
              <td>{ex.newRating}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Key insight: beating a 1200-rated player from 800 rating grants{' '}
        <strong>
          +{examples.find((e) => e.ratingA === 800 && e.delta > 0)?.delta}
        </strong>{' '}
        points (an upset), while beating an 800-rated player from 1200 rating
        only grants{' '}
        <strong>
          +{examples.find((e) => e.ratingA === 1200 && e.delta > 0)?.delta}
        </strong>{' '}
        points (expected win).
      </p>

      <h2>Matchmaking Bracket</h2>
      <p>
        The arena ladder shows opponents within a{' '}
        <Const>{(PVP_CONSTANTS.BRACKET_RANGE * 100).toFixed(0)}%</Const> rating
        bracket of your current rating. At minimum,{' '}
        <Const>{PVP_CONSTANTS.MIN_OPPONENTS_SHOWN}</Const> opponents are always
        shown (expanding the bracket if necessary to fill the list).
      </p>

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'STARTING_RATING',
            value: PVP_CONSTANTS.STARTING_RATING,
            description: 'Initial ELO rating for all players',
          },
          {
            name: 'K_FACTOR',
            value: PVP_CONSTANTS.K_FACTOR,
            description: 'Maximum rating change per match',
          },
          {
            name: 'BRACKET_RANGE',
            value: `${(PVP_CONSTANTS.BRACKET_RANGE * 100).toFixed(0)}%`,
            description: 'Rating bracket width for matchmaking',
          },
          {
            name: 'MIN_OPPONENTS_SHOWN',
            value: PVP_CONSTANTS.MIN_OPPONENTS_SHOWN,
            description: 'Minimum opponents displayed on the ladder',
          },
          {
            name: 'COOLDOWN_HOURS',
            value: PVP_CONSTANTS.COOLDOWN_HOURS,
            description: 'Hours before re-challenging the same opponent',
          },
        ]}
      />
    </WikiSection>
  );
}
