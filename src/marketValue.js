const MARKET_VALUES = [
  // AIR-KING
  { keywords: ["126900"], value: 8200 },
  { keywords: ["116900"], value: 7000 },
  { keywords: ["14000"], value: 4800 },
  { keywords: ["14010"], value: 5000 },

  // EXPLORER
  { keywords: ["224270"], value: 8500 },
  { keywords: ["124270"], value: 7850 },
  { keywords: ["214270"], value: 7000 },
  { keywords: ["114270"], value: 6300 },
  { keywords: ["14270"], value: 6100 },

  // EXPLORER II
  { keywords: ["226570"], value: 10800 },
  { keywords: ["216570"], value: 9500 },
  { keywords: ["16570"], value: 8200 },
  { keywords: ["16550"], value: 18000 },

  // OYSTER PERPETUAL
  { keywords: ["124300"], value: 9000 },
  { keywords: ["126000"], value: 7800 },
  { keywords: ["114300"], value: 7000 },
  { keywords: ["116000"], value: 6000 },
  { keywords: ["114200"], value: 5700 },

  // DATEJUST 41
  { keywords: ["126334"], value: 14200 },
  { keywords: ["126333"], value: 14500 },
  { keywords: ["126331"], value: 16900 },
  { keywords: ["126300"], value: 10500 },

  // DATEJUST II
  { keywords: ["116334"], value: 9500 },
  { keywords: ["116333"], value: 10000 },
  { keywords: ["116300"], value: 7800 },

  // DATEJUST 36 - MODERN
  { keywords: ["126234"], value: 11500 },
  { keywords: ["126233"], value: 11000 },
  { keywords: ["126231"], value: 12500 },
  { keywords: ["126200"], value: 9000 },

  // DATEJUST 36 - PRIOR GENERATIONS
  { keywords: ["116234"], value: 8500 },
  { keywords: ["116233"], value: 8500 },
  { keywords: ["116200"], value: 6900 },
  { keywords: ["16234"], value: 6200 },
  { keywords: ["16233"], value: 6500 },
  { keywords: ["16200"], value: 5200 },
  { keywords: ["16014"], value: 5000 },
  { keywords: ["16013"], value: 5200 },
  { keywords: ["16000"], value: 4800 },

  // SUBMARINER - STEEL
  { keywords: ["126610lv"], value: 14400 },
  { keywords: ["126610ln"], value: 14000 },
  { keywords: ["124060"], value: 12200 },
  { keywords: ["116610lv"], value: 18000 },
  { keywords: ["116610ln"], value: 11100 },
  { keywords: ["114060"], value: 10000 },
  { keywords: ["16610lv"], value: 13500 },
  { keywords: ["16610"], value: 9100 },
  { keywords: ["14060m"], value: 9000 },
  { keywords: ["14060"], value: 8500 },

  // SUBMARINER - TWO TONE / GOLD
  { keywords: ["126613lb"], value: 17000 },
  { keywords: ["126613ln"], value: 16000 },
  { keywords: ["116613lb"], value: 14500 },
  { keywords: ["116613ln"], value: 13500 },
  { keywords: ["16613"], value: 11500 },

  // GMT-MASTER II
  { keywords: ["126710blro"], value: 19500 },
  { keywords: ["126710blnr"], value: 17200 },
  { keywords: ["126720vtnr"], value: 17500 },
  { keywords: ["126710grnr"], value: 19000 },
  { keywords: ["116710blnr"], value: 14500 },
  { keywords: ["116710ln"], value: 11500 },
  { keywords: ["16710"], value: 12500 },
  { keywords: ["16760"], value: 15000 },
  { keywords: ["16713"], value: 12200 },

  // SEA-DWELLER / DEEPSEA
  { keywords: ["126600"], value: 12200 },
  { keywords: ["116600"], value: 11000 },
  { keywords: ["16600"], value: 9000 },
  { keywords: ["136660"], value: 13500 },
  { keywords: ["126660"], value: 12500 },
  { keywords: ["116660"], value: 11000 },

  // YACHT-MASTER
  { keywords: ["126622"], value: 13750 },
  { keywords: ["116622"], value: 10500 },
  { keywords: ["16622"], value: 8500 },
  { keywords: ["126621"], value: 15000 },
  { keywords: ["116621"], value: 13500 },

  // MILGAUSS
  { keywords: ["116400gv"], value: 10500 },
  { keywords: ["116400"], value: 8500 },

  // DAYTONA - STEEL
  { keywords: ["126500ln"], value: 32000 },
  { keywords: ["116500ln"], value: 27500 },
  { keywords: ["116520"], value: 21000 },

  // SKY-DWELLER
  { keywords: ["336934"], value: 25000 },
  { keywords: ["326934"], value: 21000 },
  { keywords: ["336933"], value: 22000 },
  { keywords: ["326933"], value: 18500 },
// OMEGA - STARTER MODELS

// Speedmaster Professional Moonwatch Sapphire
{ keywords: ["310.30.42.50.01.002"], value: 6400 },
{ keywords: ["31030425001002"], value: 6400 },
{ keywords: ["310 30 42 50 01 002"], value: 6400 },

// Seamaster Diver 300M Blue
{ keywords: ["210.30.42.20.03.001"], value: 4250 },
{ keywords: ["21030422003001"], value: 4250 },
{ keywords: ["210 30 42 20 03 001"], value: 4250 },
  // FALLBACK TITLE MATCHES
  { keywords: ["air-king", "126900"], value: 8200 },
  { keywords: ["air king", "126900"], value: 8200 },
  { keywords: ["explorer ii", "226570"], value: 10800 },
  { keywords: ["explorer ii", "216570"], value: 9500 },
  { keywords: ["datejust 41", "126300"], value: 10500 },
  { keywords: ["datejust 41", "126334"], value: 14200 },
  { keywords: ["submariner", "124060"], value: 12200 },
  { keywords: ["submariner", "126610ln"], value: 14000 },
  { keywords: ["gmt-master ii", "126710blnr"], value: 17200 },
  { keywords: ["gmt master ii", "126710blnr"], value: 17200 },
];

export function estimateMarketValue(title) {
  const normalizedTitle = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  for (const entry of MARKET_VALUES) {
    const matches = entry.keywords.every((keyword) => {
      const normalizedKeyword = String(keyword)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

      return normalizedTitle.includes(normalizedKeyword);
    });

    if (matches) {
      return entry.value;
    }
  }

  return null;
}


   
export function getMarketData(title) {
  const normalizedTitle = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  for (const entry of MARKET_VALUES) {
    const matches = entry.keywords.every((keyword) => {
      const normalizedKeyword = String(keyword)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

      return normalizedTitle.includes(normalizedKeyword);
    });

    if (matches) {
      return {
        wholesale: entry.wholesale ?? entry.value,
        expected: entry.expected ?? entry.value,
        retail: entry.retail ?? entry.value,
        confidence: entry.confidence ?? 75,
        updated: entry.updated ?? "Unknown",
      };
    }
  }

  return null;
}
