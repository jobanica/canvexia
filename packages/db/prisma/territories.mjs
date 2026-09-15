/**
 * The city list, one line each.
 *
 * A first pass by population and business density, not a market study — move a
 * city between tiers by moving its line. Fees are whole pesos.
 *
 * Any Philippine city NOT here defaults to `small` when someone types it into
 * the waitlist, and is stored as free text with no territory until HQ maps it.
 * A city nobody listed is a signal, not an error.
 */

export const TIER_FEE = { small: 29000, mid: 49000, large: 79000, hq: 0 };

export const TIER_BLURB = {
  small: "A provincial city or a municipality with a real commercial strip.",
  mid: "A component or independent city with an established business district.",
  large: "A highly urbanised city — dense, competitive, the most merchants.",
  hq: "The model territory. Run by CANVEXIA itself.",
};

/** [name, province, region] */
export const LARGE = [
  ["Quezon City", "Metro Manila", "NCR"], ["Manila", "Metro Manila", "NCR"],
  ["Caloocan", "Metro Manila", "NCR"], ["Cebu City", "Cebu", "Region VII"],
  ["Zamboanga City", "Zamboanga del Sur", "Region IX"], ["Taguig", "Metro Manila", "NCR"],
  ["Antipolo", "Rizal", "Region IV-A"], ["Pasig", "Metro Manila", "NCR"],
  ["Cagayan de Oro", "Misamis Oriental", "Region X"], ["Parañaque", "Metro Manila", "NCR"],
  ["Dasmariñas", "Cavite", "Region IV-A"], ["Valenzuela", "Metro Manila", "NCR"],
  ["Bacoor", "Cavite", "Region IV-A"], ["General Santos", "South Cotabato", "Region XII"],
  ["Las Piñas", "Metro Manila", "NCR"], ["Bacolod", "Negros Occidental", "Region VI"],
  ["Makati", "Metro Manila", "NCR"], ["Muntinlupa", "Metro Manila", "NCR"],
  ["San Jose del Monte", "Bulacan", "Region III"], ["Iloilo City", "Iloilo", "Region VI"],
  ["Calamba", "Laguna", "Region IV-A"], ["Marikina", "Metro Manila", "NCR"],
  ["Pasay", "Metro Manila", "NCR"], ["Mandaluyong", "Metro Manila", "NCR"],
  ["Lapu-Lapu", "Cebu", "Region VII"], ["Angeles", "Pampanga", "Region III"],
];

export const MID = [
  ["Mandaue", "Cebu", "Region VII"], ["Santa Rosa", "Laguna", "Region IV-A"],
  ["Imus", "Cavite", "Region IV-A"], ["General Trias", "Cavite", "Region IV-A"],
  ["Lipa", "Batangas", "Region IV-A"], ["Batangas City", "Batangas", "Region IV-A"],
  ["Cabuyao", "Laguna", "Region IV-A"], ["Biñan", "Laguna", "Region IV-A"],
  ["San Pedro", "Laguna", "Region IV-A"], ["San Pablo", "Laguna", "Region IV-A"],
  ["Tanauan", "Batangas", "Region IV-A"], ["Santo Tomas", "Batangas", "Region IV-A"],
  ["Tarlac City", "Tarlac", "Region III"], ["Baguio", "Benguet", "CAR"],
  ["Naga", "Camarines Sur", "Region V"], ["Legazpi", "Albay", "Region V"],
  ["Lucena", "Quezon", "Region IV-A"], ["Tacloban", "Leyte", "Region VIII"],
  ["Butuan", "Agusan del Norte", "Caraga"], ["Iligan", "Lanao del Norte", "Region X"],
  ["Cotabato City", "Maguindanao del Norte", "BARMM"], ["Tagum", "Davao del Norte", "Region XI"],
  ["Digos", "Davao del Sur", "Region XI"], ["Panabo", "Davao del Norte", "Region XI"],
  ["Koronadal", "South Cotabato", "Region XII"], ["Kidapawan", "Cotabato", "Region XII"],
  ["Pagadian", "Zamboanga del Sur", "Region IX"], ["Malaybalay", "Bukidnon", "Region X"],
  ["Valencia", "Bukidnon", "Region X"], ["Surigao City", "Surigao del Norte", "Caraga"],
  ["Toledo", "Cebu", "Region VII"], ["Roxas City", "Capiz", "Region VI"],
  ["Puerto Princesa", "Palawan", "MIMAROPA"], ["Cabanatuan", "Nueva Ecija", "Region III"],
  ["Olongapo", "Zambales", "Region III"], ["San Fernando", "Pampanga", "Region III"],
  ["Malolos", "Bulacan", "Region III"], ["Meycauayan", "Bulacan", "Region III"],
  ["Navotas", "Metro Manila", "NCR"], ["Malabon", "Metro Manila", "NCR"],
  ["San Juan", "Metro Manila", "NCR"], ["Ormoc", "Leyte", "Region VIII"],
  ["Dumaguete", "Negros Oriental", "Region VII"], ["Dagupan", "Pangasinan", "Region I"],
  ["Tuguegarao", "Cagayan", "Region II"], ["Santiago", "Isabela", "Region II"],
  ["Sorsogon City", "Sorsogon", "Region V"],
];

export const SMALL = [
  ["Mati", "Davao Oriental", "Region XI"], ["Bislig", "Surigao del Sur", "Caraga"],
  ["Tacurong", "Sultan Kudarat", "Region XII"], ["Dipolog", "Zamboanga del Norte", "Region IX"],
  ["Ozamiz", "Misamis Occidental", "Region X"], ["Danao", "Cebu", "Region VII"],
  ["Bogo", "Cebu", "Region VII"], ["Calbayog", "Samar", "Region VIII"],
  ["Catbalogan", "Samar", "Region VIII"], ["Maasin", "Southern Leyte", "Region VIII"],
  ["Tagbilaran", "Bohol", "Region VII"], ["Kalibo", "Aklan", "Region VI"],
  ["Bayawan", "Negros Oriental", "Region VII"], ["Tabaco", "Albay", "Region V"],
  ["Iriga", "Camarines Sur", "Region V"], ["Masbate City", "Masbate", "Region V"],
  ["Laoag", "Ilocos Norte", "Region I"], ["Vigan", "Ilocos Sur", "Region I"],
  ["San Fernando", "La Union", "Region I"], ["Urdaneta", "Pangasinan", "Region I"],
  ["Calapan", "Oriental Mindoro", "MIMAROPA"], ["Cavite City", "Cavite", "Region IV-A"],
  ["Trece Martires", "Cavite", "Region IV-A"], ["Tagaytay", "Cavite", "Region IV-A"],
  ["Balanga", "Bataan", "Region III"], ["Gapan", "Nueva Ecija", "Region III"],
  ["Muñoz", "Nueva Ecija", "Region III"], ["San Carlos", "Pangasinan", "Region I"],
  ["Alaminos", "Pangasinan", "Region I"], ["Candon", "Ilocos Sur", "Region I"],
  ["Batac", "Ilocos Norte", "Region I"], ["Cauayan", "Isabela", "Region II"],
  ["Ilagan", "Isabela", "Region II"], ["Bayugan", "Agusan del Sur", "Caraga"],
  ["Cabadbaran", "Agusan del Norte", "Caraga"], ["Tandag", "Surigao del Sur", "Caraga"],
  ["Gingoog", "Misamis Oriental", "Region X"], ["El Salvador", "Misamis Oriental", "Region X"],
  ["Oroquieta", "Misamis Occidental", "Region X"], ["Tangub", "Misamis Occidental", "Region X"],
  ["Isabela City", "Basilan", "BARMM"], ["Dapitan", "Zamboanga del Norte", "Region IX"],
  ["Marawi", "Lanao del Sur", "BARMM"], ["Lamitan", "Basilan", "BARMM"],
  ["Samal", "Davao del Norte", "Region XI"], ["Guihulngan", "Negros Oriental", "Region VII"],
  ["Tanjay", "Negros Oriental", "Region VII"], ["Canlaon", "Negros Oriental", "Region VII"],
  ["Bais", "Negros Oriental", "Region VII"], ["Sipalay", "Negros Occidental", "Region VI"],
  ["Kabankalan", "Negros Occidental", "Region VI"], ["Himamaylan", "Negros Occidental", "Region VI"],
  ["La Carlota", "Negros Occidental", "Region VI"], ["Bago", "Negros Occidental", "Region VI"],
  ["Silay", "Negros Occidental", "Region VI"], ["Talisay", "Negros Occidental", "Region VI"],
  ["Victorias", "Negros Occidental", "Region VI"], ["Cadiz", "Negros Occidental", "Region VI"],
  ["Sagay", "Negros Occidental", "Region VI"], ["Escalante", "Negros Occidental", "Region VI"],
  ["San Carlos", "Negros Occidental", "Region VI"], ["Passi", "Iloilo", "Region VI"],
  ["Carcar", "Cebu", "Region VII"], ["Naga", "Cebu", "Region VII"],
  ["Talisay", "Cebu", "Region VII"], ["Borongan", "Eastern Samar", "Region VIII"],
  ["Baybay", "Leyte", "Region VIII"], ["Ligao", "Albay", "Region V"],
  ["La Trinidad", "Benguet", "CAR"],
];

/** Davao City. Shown, never sold. */
export const HQ = [["Davao City", "Davao del Sur", "Region XI"]];

/**
 * A slug that survives two cities sharing a name.
 *
 * "Talisay", "Naga", "San Carlos" and "San Fernando" each appear twice in the
 * list above, in different provinces — a name-only slug would collide and the
 * second insert would fail, or worse, quietly overwrite the first. The province
 * is part of the identity.
 */
export function territorySlug(name, province) {
  return `${name}-${province}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Every territory, flattened, ready to upsert. */
export function allTerritories() {
  const rows = [];
  for (const [tier, list] of [["large", LARGE], ["mid", MID], ["small", SMALL], ["hq", HQ]]) {
    for (const [name, province, region] of list) {
      rows.push({
        name, province, region,
        slug: territorySlug(name, province),
        tier,
        licenseFee: TIER_FEE[tier],
        status: tier === "hq" ? "hq" : "available",
      });
    }
  }
  return rows;
}
