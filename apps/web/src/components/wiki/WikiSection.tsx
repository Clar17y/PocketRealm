import type { ReactNode } from 'react';
import { RelatedPages } from './RelatedPages';

interface WikiSectionProps {
  title: string;
  summary: string;
  children: ReactNode;
  related?: { label: string; href: string }[];
}

export function WikiSection({ title, summary, children, related }: WikiSectionProps) {
  return (
    <article>
      <h1 className="wiki-page-title">{title}</h1>
      <p className="wiki-page-summary">{summary}</p>
      {children}
      {related && related.length > 0 && <RelatedPages pages={related} />}
    </article>
  );
}
