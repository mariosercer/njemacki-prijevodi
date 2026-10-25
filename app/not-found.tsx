import Link from "next/link";
import PageShell from "@/components/PageShell";

export default function NotFound() {
  return (
    <PageShell title="Stranica nije pronađena">
      <p>Tražena stranica ne postoji ili je premještena.</p>
      <p>
        <Link href="/">Povratak na početnu stranicu</Link>
      </p>
    </PageShell>
  );
}
