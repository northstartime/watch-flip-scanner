import { estimateMarketValue } from "./marketValue.js";
export function parseListing(listing, shareLink) {

  // Extract Facebook URL if present
const listingUrl =
  shareLink?.trim() || "https://www.facebook.com/groups/Watchtrading";

// Find asking price
const pricePatterns = [
  /\basking\s*(?:price\s*)?[:\-]?\s*\$?\s*([\d,]{3,8})\b/i,
  /\bprice\s*[:\-]?\s*\$?\s*([\d,]{3,8})\b/i,
  /^\$?\s*([\d,]{3,8})\s*\+\s*(?:label)\b/i,
  /^\$?\s*([\d,]{3,8})\s*(?:obo|firm|shipped|net)\b/i,
/^\$\s*([\d,]{3,8})\b/i,
  /(?:take it home|take it)\s*(?:for\s*)?\$?\s*([\d,]{3,8})\b/i,
  /^\s*\$?\s*([\d,]{3,8})\s*(?:take it home|take it|shipped|obo|firm|net)\b/im,
];

const numberedItems = listing.match(/^\s*\d+\s*:/gm) || [];
const isMultiWatchPost = numberedItems.length >= 2;

let priceMatch = null;

if (!isMultiWatchPost) {
  for (const pattern of pricePatterns) {
    const match = listing.match(pattern);

    if (match) {
      priceMatch = match;
      break;
    }
  }
}


  // Find reference number
const referenceMatch =
listing.match(
  /\b(?:Ref\.?|Reference)\s*:?\s*([A-Z0-9]+(?:\.[A-Z0-9]+){1,})\b/i
) ||
listing.match(/\b(?:Ref\.?|Reference)\s*:?\s*(\d{4,6})\b/i) ||
listing.match(/\b(PAM\d{4,6})\b/i) ||
listing.match(/\b(M?\d{4,6}[A-Z]{1,4}(?:-\d{4})?)\b/i) ||
listing.match(/\b(11\d{4}|12\d{4}|21\d{4}|22\d{4})\b/);
// Find brand
let brand = null;

if (/\b(RLX|ROLEX)\b/i.test(listing)) {
  brand = "Rolex";
} else if (/\b(OMG|OMEGA)\b/i.test(listing)) {
  brand = "Omega";
} else if (/\b(TDR|TUDOR)\b/i.test(listing)) {
  brand = "Tudor";
} else if (/\b(CARTIER)\b/i.test(listing)) {
  brand = "Cartier";
} else if (/\b(PANERAI|PAM\d{3,5})\b/i.test(listing)) {
  brand = "Panerai";
} else if (/\b(HUBLOT)\b/i.test(listing)) {
  brand = "Hublot";
} else if (/\b(BREITLING)\b/i.test(listing)) {
  brand = "Breitling";
} else if (/\b(IWC|INTERNATIONAL WATCH CO)\b/i.test(listing)) {
  brand = "IWC";
} else if (/\b(GRAND SEIKO)\b/i.test(listing)) {
  brand = "Grand Seiko";
} else if (/\b(JAEGER[- ]?LECOULTRE|\bJLC\b)\b/i.test(listing)) {
  brand = "Jaeger-LeCoultre";
}

// Find model
let model = null;

// Rolex model detection.
// Only infer Rolex from Rolex-specific references/nicknames,
// not generic terms like GMT or SUB.
if (
  brand === "Rolex" ||
  /\b(126300|126334|126333|116234|16234|124060|126610|116610|16610|126710|116710|226570|216570|124270|214270|126900|116900)\b/i.test(listing)
) {
  if (/(\bDJ\b|DATEJUST|126300|126334|126333|116234|16234)/i.test(listing)) {
    model = "Datejust";
    if (!brand) brand = "Rolex";
  } else if (/(SUBMARINER|124060|126610|116610|16610)/i.test(listing)) {
    model = "Submariner";
    if (!brand) brand = "Rolex";
  } else if (/(GMT-MASTER|\bBATMAN\b|\bBATGIRL\b|\bPEPSI\b|\bSPRITE\b|126710|116710)/i.test(listing)) {
    model = "GMT-Master II";
    if (!brand) brand = "Rolex";
  } else if (/(EXPLORER II|226570|216570|\bPOLAR\b)/i.test(listing)) {
    model = "Explorer II";
    if (!brand) brand = "Rolex";
  } else if (/(EXPLORER|124270|214270)/i.test(listing)) {
    model = "Explorer";
    if (!brand) brand = "Rolex";
  } else if (/(AIR.?KING|126900|116900)/i.test(listing)) {
    model = "Air-King";
    if (!brand) brand = "Rolex";
  }
}

// Tudor
if (brand === "Tudor") {
  if (/BLACK BAY 58|\bBB58\b|79030/i.test(listing)) {
    model = "Black Bay 58";
  } else if (/BLACK BAY GMT|\bBB GMT\b/i.test(listing)) {
    model = "Black Bay GMT";
  } else if (/BLACK BAY CHRONO|\bBB CHRONO\b/i.test(listing)) {
    model = "Black Bay Chrono";
  } else if (/PELAGOS/i.test(listing)) {
    model = "Pelagos";
  } else if (/BLACK BAY/i.test(listing)) {
    model = "Black Bay";
  }
}

// Omega
if (brand === "Omega") {
  if (/SPEEDMASTER|\bSPEEDY\b/i.test(listing)) {
    model = "Speedmaster";
  } else if (/SEAMASTER/i.test(listing)) {
    model = "Seamaster";
  } else if (/AQUA TERRA/i.test(listing)) {
    model = "Aqua Terra";
  }
}

// Cartier
if (brand === "Cartier") {
  if (/SANTOS/i.test(listing)) {
    model = "Santos";
  } else if (/TANK/i.test(listing)) {
    model = "Tank";
  } else if (/BALLON BLEU/i.test(listing)) {
    model = "Ballon Bleu";
  }
}

// Panerai
if (brand === "Panerai") {
  if (/SUBMERSIBLE/i.test(listing)) {
    model = "Submersible";
  } else if (/LUMINOR/i.test(listing)) {
    model = "Luminor";
  } else if (/RADIOMIR/i.test(listing)) {
    model = "Radiomir";
  }
}

// Hublot
if (brand === "Hublot") {
  if (/BIG BANG/i.test(listing)) {
    model = "Big Bang";
  } else if (/CLASSIC FUSION/i.test(listing)) {
    model = "Classic Fusion";
  } else if (/SPIRIT OF BIG BANG/i.test(listing)) {
    model = "Spirit of Big Bang";
  }
}

// Breitling
if (brand === "Breitling") {
  if (/NAVITIMER/i.test(listing)) {
    model = "Navitimer";
  } else if (/SUPEROCEAN/i.test(listing)) {
    model = "Superocean";
  } else if (/CHRONOMAT/i.test(listing)) {
    model = "Chronomat";
  }
}

// IWC
if (brand === "IWC") {
  if (/PILOT/i.test(listing)) {
    model = "Pilot";
  } else if (/PORTUGIESER|PORTUGUESE/i.test(listing)) {
    model = "Portugieser";
  } else if (/AQUATIMER/i.test(listing)) {
    model = "Aquatimer";
  }
}

// Grand Seiko
if (brand === "Grand Seiko") {
  if (/SNOWFLAKE/i.test(listing)) {
    model = "Snowflake";
  } else if (/SPRING DRIVE/i.test(listing)) {
    model = "Spring Drive";
  }
}

// Jaeger-LeCoultre
if (brand === "Jaeger-LeCoultre") {
  if (/REVERSO/i.test(listing)) {
    model = "Reverso";
  } else if (/MASTER CONTROL/i.test(listing)) {
    model = "Master Control";
  }
}
const hasBox = /\bbox\b/i.test(listing) && !/box not included/i.test(listing);
const hasPapers = /\bpaper|card\b/i.test(listing);

const yearMatch = listing.match(/20\d{2}/);

const conditionMatch =
  listing.match(/(\d(?:\.\d)?\/10)/) ||
  listing.match(/condition[: ]+([^\n]+)/i);

const isPolished =
  /\bpolished\b/i.test(listing) &&
  !/\bunpolished\b/i.test(listing);

const scrambledSerial = /scrambled/i.test(listing);

const tradeAccepted = /trade/i.test(listing);

const dealerListing =
    /\+ label/i.test(listing) ||
    /wire/i.test(listing) ||
    /welcome/i.test(listing);

const braceletMatch = listing.match(/(\d+(?:\.\d+)?)\s*inch/i);

const wristSize = braceletMatch
    ? Number(braceletMatch[1])
    : null;
    const listingLines = listing
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const displayTitle =
  listingLines.find((line) => !/^#\w+/i.test(line)) ||
  listingLines[0] ||
  "Unknown listing";
return {
    originalListing: listing,
  title: displayTitle,
    brand,
    model,
    isPolished,
scrambledSerial,
tradeAccepted,
dealerListing,
wristSize,
    reference: referenceMatch ? referenceMatch[1] : null,
   price: priceMatch
  ? Number(priceMatch[1].replace(/,/g, ""))
  : null,
  buyPrice: priceMatch
  ? Number(priceMatch[1].replace(/,/g, ""))
  : null,

source: "Moda",
url: listingUrl,

marketValue: estimateMarketValue(listing),
    year: yearMatch ? Number(yearMatch[0]) : null,
    hasBox,
    hasPapers,
    condition: conditionMatch ? conditionMatch[1] : null
};

}