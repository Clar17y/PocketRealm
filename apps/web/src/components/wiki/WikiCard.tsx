import Link from 'next/link';
import Image from 'next/image';

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
      <div className="wiki-index-card-icon">
        <Image src={icon} alt="" width={36} height={36} className="image-rendering-pixelated" />
      </div>
      <div className="wiki-index-card-title">{title}</div>
      <div className="wiki-index-card-desc">{description}</div>
      <div className="wiki-index-card-count">
        {count} {count === 1 ? 'article' : 'articles'}
      </div>
    </Link>
  );
}
