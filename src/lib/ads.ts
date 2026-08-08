// Advertising configuration, read on the SERVER at request time.
//
// Not NEXT_PUBLIC_*: those are substituted at build time, and this app's configuration lives in
// the host's .env file. Reading them here and passing the values down as props means turning
// ads on is an env edit plus a restart, not a rebuild and a redeploy.
//
// Every field empty is the normal state until an AdSense account exists. The slots render their
// own "advertise here" card in that case, so the space is never dead and the layout does not
// change on the day ads start serving.

export interface AdsConfig {
  /** AdSense publisher id, `ca-pub-...`. */
  client: string;
  /** Per-position slot ids, created in the AdSense dashboard. */
  slots: { sidebar: string; bottom: string };
  /** Where an advertiser writes to buy the space directly. */
  contact: string;
}

export function adsConfig(): AdsConfig {
  return {
    client: process.env.ADSENSE_CLIENT ?? "",
    slots: {
      sidebar: process.env.ADSENSE_SLOT_SIDEBAR ?? "",
      bottom: process.env.ADSENSE_SLOT_BOTTOM ?? "",
    },
    contact: process.env.ADS_CONTACT_EMAIL || "camamtieudao@outlook.com",
  };
}

/** True once there is a publisher id to load the AdSense library for. */
export const adsEnabled = (c: AdsConfig): boolean => Boolean(c.client);
