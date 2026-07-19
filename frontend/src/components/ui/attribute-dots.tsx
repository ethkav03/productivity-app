import clsx from 'clsx';
import { AttributeKey } from '@/lib/types';
import { attributeColor } from '@/lib/attribute-colors';

interface AttributeDotsProps {
  /** Any list of skills/skill-like objects carrying their parent attribute's key + name. */
  skills: Array<{ attribute: { key: AttributeKey; name: string } }>;
  className?: string;
  dotClassName?: string;
}

/**
 * Compact stand-in for listing every associated skill by name: one small
 * colored dot per *distinct attribute* represented (deduped), each carrying
 * its attribute's name as a tooltip. Color is never the only cue - always
 * pair with the attribute name via the `title` tooltip (WCAG SC 1.4.1).
 */
export function AttributeDots({ skills, className, dotClassName }: AttributeDotsProps) {
  if (skills.length === 0) return null;

  const distinct = new Map<AttributeKey, string>();
  for (const skill of skills) {
    if (!distinct.has(skill.attribute.key)) {
      distinct.set(skill.attribute.key, skill.attribute.name);
    }
  }

  return (
    <span className={clsx('inline-flex items-center gap-1', className)} aria-label="Associated attributes">
      {Array.from(distinct.entries()).map(([key, name]) => (
        <span
          key={key}
          title={name}
          role="img"
          aria-label={name}
          className={clsx('h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-border', dotClassName)}
          style={{ backgroundColor: attributeColor(key) }}
        />
      ))}
    </span>
  );
}
