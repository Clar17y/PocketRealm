import type { ReactNode } from 'react';

function Var({ children }: { children: ReactNode }) {
  return <span className="var-player">{children}</span>;
}

function Out({ children }: { children: ReactNode }) {
  return <span className="var-output">{children}</span>;
}

function Enemy({ children }: { children: ReactNode }) {
  return <span className="var-enemy">{children}</span>;
}

function Const({ children }: { children: ReactNode }) {
  return <span className="var-constant">{children}</span>;
}

function Op({ children }: { children: ReactNode }) {
  return <span className="var-operator">{children}</span>;
}

function Comment({ children }: { children: ReactNode }) {
  return <span className="var-comment">{children}</span>;
}

function FormulaBlock({ children }: { children: ReactNode }) {
  return <div className="wiki-formula">{children}</div>;
}

FormulaBlock.Var = Var;
FormulaBlock.Out = Out;
FormulaBlock.Enemy = Enemy;
FormulaBlock.Const = Const;
FormulaBlock.Op = Op;
FormulaBlock.Comment = Comment;

export { FormulaBlock };
