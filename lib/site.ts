export const SITE = {
  url: "https://njemacki-prijevodi.com",
  name: "Mario Šercer",
  tagline: "stalni sudski tumač i prevoditelj za njemački jezik",
  phone: "098/9070 591",
  phoneIntl: "+385989070591",
  phoneDisplayIntl: "+385 (0)98 90 70 591",
  email: "mario.sercer@gmail.com",
  address: ["Varaždinska 3", "40305 Nedelišće"],
  mapsUrl: "https://goo.gl/maps/aSUDDN6Bkak",
  gaId: "G-01QJQKFLFF",
  priceListCsv: "/uploads/2026/09/Cjenik-usluga-Mario-Sercer-22.10.2026.csv",
};

export type NavItem = { label: string; href?: string; children?: NavItem[] };

export const USLUGE: NavItem[] = [
  { label: "Usluge prijevoda za fizičke osobe", href: "/fizicke-osobe/" },
  { label: "Usluge prijevoda za pravne osobe", href: "/pravne-osobe/" },
  { label: "Ovjereni prijevodi sudskog tumača za njemački jezik", href: "/ovjereni-prijevodi/" },
];

export const CJENIK: NavItem[] = [
  { label: "Cjenik standardnih prijevoda", href: "/cjenik-standardnih-prijevoda/" },
  { label: "Cjenik ovjerenih i neovjerenih prijevoda", href: "/cjenik-ovjerenih-i-neovjerenih-prijevoda/" },
  { label: "Način plaćanja i trošak dostave", href: "/trosak-dostave/" },
];

export const ZANIMLJIVOSTI: NavItem[] = [
  { label: "Usmeno prevođenje", href: "/usmeno-prevodenje/" },
  { label: "Pismeno prevođenje", href: "/pismeno-prevodenje/" },
  { label: "Što je apostille?", href: "/sto-je-apostille/" },
  { label: "Tko može postati sudski tumač?", href: "/sudski-tumac/" },
];

export const NAV: NavItem[] = [
  { label: "Usluge", children: USLUGE },
  {
    label: "Cjenik",
    children: [...CJENIK, { label: "Cjenik usluga na dan 22.09.2026. – download", href: SITE.priceListCsv }],
  },
  { label: "Zanimljivosti", href: "/zanimljivosti/" },
  { label: "Kontakt", href: "/kontakt/" },
];
