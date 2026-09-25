import Link from "next/link";

export type SectionTabItem = {
  label: string;
  href: string;
  count?: number;
  hidden?: boolean;
};

export function SectionTabs({
  items,
  currentPath,
  ariaLabel,
}: {
  items: SectionTabItem[];
  currentPath: string;
  ariaLabel: string;
}) {
  const visible = items.filter((item) => !item.hidden);
  return (
    <nav className="ui-sectionTabs" aria-label={ariaLabel}>
      <ul>
        {visible.map((item) => {
          const current = item.href === currentPath;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="ui-sectionTab"
                aria-current={current ? "page" : undefined}
                data-current={current || undefined}
              >
                {item.label}
                {typeof item.count === "number" ? <span className="ui-sectionTab-count">{item.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
