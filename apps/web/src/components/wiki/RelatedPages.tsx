import Link from 'next/link';

interface RelatedPage {
  label: string;
  href: string;
}

interface RelatedPagesProps {
  pages: RelatedPage[];
}

export function RelatedPages({ pages }: RelatedPagesProps) {
  if (pages.length === 0) return null;

  return (
    <div className="wiki-related">
      <h3>Related Pages</h3>
      <div>
        {pages.map((page) => (
          <Link key={page.href} href={page.href} className="wiki-related-link">
            {page.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
