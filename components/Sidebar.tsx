import Link from "next/link";
import { CJENIK, SITE, USLUGE, ZANIMLJIVOSTI, type NavItem } from "@/lib/site";
import { PhoneIcon } from "./Icons";

function Menu({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="sidebar-menu">
      <h4>{title}</h4>
      <ul>
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href!}>{i.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-buttons">
        <a className="btn-outline" href={`tel:${SITE.phoneIntl}`}>
          <PhoneIcon /> {SITE.phone}
        </a>
        <Link className="btn-outline" href="/kontakt/">
          <PhoneIcon /> ZATRAŽITE PONUDU
        </Link>
      </div>
      <Menu title="Cjenik" items={CJENIK} />
      <Menu title="Usluge" items={USLUGE} />
      <Menu title="Zanimljivosti" items={ZANIMLJIVOSTI} />
    </aside>
  );
}
