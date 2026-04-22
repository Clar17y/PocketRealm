import type { Metadata } from 'next';
import { PREMIUM_CONSTANTS, TURN_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

const TURN_REGEN_SCALE = 100;
const freeCapHours = TURN_CONSTANTS.BANK_CAP / TURN_CONSTANTS.REGEN_RATE / 3600;
const championCapHours = PREMIUM_CONSTANTS.TURN_BANK_CAP / PREMIUM_CONSTANTS.TURN_REGEN_RATE / 3600;

export const metadata: Metadata = {
  title: 'Turns & Regeneration',
  description:
    'Turn bank regeneration, storage caps, Champion overrides, and fractional regen progress.',
};

export default function TurnsPage() {
  return (
    <WikiSection
      title="Turns & Regeneration"
      summary="Turns are Pocketrealm's global action currency. The server regenerates them lazily over time, with separate regen rates and bank caps for free and Champion players."
      related={[
        { label: 'Health', href: '/wiki/resources/health' },
        { label: 'Stamina', href: '/wiki/resources/stamina' },
        { label: 'Mana', href: '/wiki/resources/mana' },
      ]}
    >
      <h2>Account Tiers</h2>
      <p>
        New players begin with{' '}
        <strong>{TURN_CONSTANTS.STARTING_TURNS.toLocaleString()}</strong> turns.
        From there, the bank regenerates continuously until it reaches the
        account's cap.
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Regen Rate</th>
            <th>Bank Cap</th>
            <th>Empty to Full</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Free</td>
            <td>{TURN_CONSTANTS.REGEN_RATE}/sec</td>
            <td>{TURN_CONSTANTS.BANK_CAP.toLocaleString()}</td>
            <td>{freeCapHours.toFixed(0)}h</td>
          </tr>
          <tr>
            <td>Champion</td>
            <td>{PREMIUM_CONSTANTS.TURN_REGEN_RATE}/sec</td>
            <td>{PREMIUM_CONSTANTS.TURN_BANK_CAP.toLocaleString()}</td>
            <td>{championCapHours.toFixed(0)}h</td>
          </tr>
        </tbody>
      </table>

      <h2>Lazy Regeneration Formula</h2>
      <p>
        Turn regeneration is calculated when your turn bank is read or written,
        not by a background tick. To support Champion's{' '}
        <strong>{PREMIUM_CONSTANTS.TURN_REGEN_RATE}/sec</strong> rate, the
        server stores fractional progress in hundredths of a turn.
      </p>
      <FormulaBlock>
        <Out>scaledRegenRate</Out> <Op>=</Op> round<Op>(</Op>
        <Var>regenRate</Var> <Op>&times;</Op> <Const>{TURN_REGEN_SCALE}</Const>
        <Op>)</Op>
      </FormulaBlock>
      <FormulaBlock>
        <Out>totalScaledTurns</Out> <Op>=</Op> <Var>storedTurns</Var>{' '}
        <Op>&times;</Op> <Const>{TURN_REGEN_SCALE}</Const> <Op>+</Op>{' '}
        <Var>regenProgress</Var> <Op>+</Op> <Var>elapsedSeconds</Var>{' '}
        <Op>&times;</Op> <Var>scaledRegenRate</Var>
      </FormulaBlock>
      <FormulaBlock>
        <Out>cappedScaledTurns</Out> <Op>=</Op> min<Op>(</Op>
        <Var>totalScaledTurns</Var><Op>,</Op> <Var>bankCap</Var>{' '}
        <Op>&times;</Op> <Const>{TURN_REGEN_SCALE}</Const><Op>)</Op>
      </FormulaBlock>
      <FormulaBlock>
        <Out>currentTurns</Out> <Op>=</Op> floor<Op>(</Op>
        <Var>cappedScaledTurns</Var> <Op>/</Op>{' '}
        <Const>{TURN_REGEN_SCALE}</Const><Op>)</Op>
      </FormulaBlock>
      <FormulaBlock>
        <Out>regenProgress</Out> <Op>=</Op> <Var>cappedScaledTurns</Var>{' '}
        <Op>-</Op> <Var>currentTurns</Var> <Op>&times;</Op>{' '}
        <Const>{TURN_REGEN_SCALE}</Const>
        <Comment> {'//'} reset to 0 at cap</Comment>
      </FormulaBlock>

      <h2>Time to Cap</h2>
      <p>
        If your bank is not full, time-to-cap is computed from the remaining
        scaled turns and the active regen rate:
      </p>
      <FormulaBlock>
        <Out>secondsToCap</Out> <Op>=</Op> ceil<Op>(</Op>
        <Op>(</Op><Var>bankCap</Var> <Op>&times;</Op>{' '}
        <Const>{TURN_REGEN_SCALE}</Const> <Op>-</Op> <Op>(</Op>
        <Var>currentTurns</Var> <Op>&times;</Op>{' '}
        <Const>{TURN_REGEN_SCALE}</Const> <Op>+</Op> <Var>regenProgress</Var>
        <Op>)</Op><Op>)</Op> <Op>/</Op> <Var>scaledRegenRate</Var><Op>)</Op>
      </FormulaBlock>
      <p>
        Once <code>currentTurns</code> reaches the bank cap, regeneration stops
        and <code>secondsToCap</code> becomes null until you spend turns again.
      </p>

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'STARTING_TURNS',
            value: TURN_CONSTANTS.STARTING_TURNS.toLocaleString(),
            description: 'Turns granted to a new account',
          },
          {
            name: 'REGEN_RATE',
            value: `${TURN_CONSTANTS.REGEN_RATE}/sec`,
            description: 'Free-account turn regeneration rate',
          },
          {
            name: 'BANK_CAP',
            value: TURN_CONSTANTS.BANK_CAP.toLocaleString(),
            description: 'Maximum free-account turn storage',
          },
          {
            name: 'TURN_REGEN_RATE',
            value: `${PREMIUM_CONSTANTS.TURN_REGEN_RATE}/sec`,
            description: 'Champion turn regeneration rate',
          },
          {
            name: 'TURN_BANK_CAP',
            value: PREMIUM_CONSTANTS.TURN_BANK_CAP.toLocaleString(),
            description: 'Maximum Champion turn storage',
          },
          {
            name: 'TURN_REGEN_SCALE',
            value: TURN_REGEN_SCALE,
            description: 'Fractional precision used to carry partial turn progress',
          },
        ]}
      />
    </WikiSection>
  );
}
