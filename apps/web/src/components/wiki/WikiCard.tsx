import Link from 'next/link';

interface WikiCardProps {
  title: string;
  description: string;
  href: string;
  icon: string;
  count: number;
}

export function WikiCard({ title, description, href, icon, count }: WikiCardProps) {
  return (
    <Link href={href} className="wiki-index-card">
      <div className="wiki-index-card-icon">{icon}</div>
      <div className="wiki-index-card-title">{title}</div>
      <div className="wiki-index-card-desc">{description}</div>
      <div className="wiki-index-card-count">
        {count} {count === 1 ? 'article' : 'articles'}
      </div>
    </Link>
  );
}
