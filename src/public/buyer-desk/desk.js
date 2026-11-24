const storageKey = "north-star-buyer-desk-v1";
const form = document.querySelector("#lead");
const status = document.querySelector("#status");
const fields = [...new FormData(form).keys()];
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const retailPriority = ["Retail client", "Dealer with retail request", "Unverified", "Wholesale"];
let editingId;
let requests = [];

try {
  requests = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
  if (!Array.isArray(requests)) throw new Error();
} catch {
  requests = [];
  status.textContent = "Saved requests could not be read. Restore a backup before adding requests.";
}

function parseAmount(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function estimate(lead) {
  const sale = parseAmount(lead.sale);
  const costs = parseAmount(lead.costs);
  const target = parseAmount(lead.profit);
  const offer = parseAmount(lead.offer);
  const dealerNet = lead.exit?.trim() ? parseAmount(lead.dealerNet) : null;
  const retailNet = sale === null || costs === null ? null : sale - costs;
  const lines = [
    ["Retail", retailNet],
    ["Dealer-backed", dealerNet],
  ].filter(([, net]) => net !== null && target !== null).map(([label, net]) => {
    const ceiling = net - target;
    const buy = ceiling < 0 ? "target profit exceeds net proceeds" : `max all-in buy ${money.format(ceiling)}`;
    const expected = offer === null ? "" : `, expected profit ${money.format(net - offer)}`;
    return `${label}: ${buy}${expected}.`;
  });
  if (!lines.length) lines.push("Enter retail price and costs or a verified net dealer exit to calculate a buy ceiling.");
  if (dealerNet === null) lines.push("Dealer exit unverified.");
  return lines.join(" ");
}

function reachable(lead) {
  return Boolean(lead.contact?.trim() || originalUrl(lead.url));
}

function capturedTime(lead) {
  return Date.parse(lead.capturedAt) || 0;
}

function save(next) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
    requests = next;
    render();
    return true;
  } catch {
    status.textContent = "Browser storage is unavailable or full. Changes could not be saved.";
    return false;
  }
}

function reset() {
  editingId = undefined;
  form.reset();
  document.querySelector("#editor-title").textContent = "Add a request";
  updateEstimate();
}

function updateEstimate() {
  document.querySelector("#estimate").textContent = estimate(Object.fromEntries(new FormData(form)));
}

function originalUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function render() {
  const list = document.querySelector("#requests");
  list.replaceChildren();
  if (!requests.length) list.textContent = "No requests yet.";
  const sorted = [...requests].sort((a, b) =>
    Number(["Won", "Closed"].includes(a.stage)) - Number(["Won", "Closed"].includes(b.stage)) ||
    Number(reachable(b)) - Number(reachable(a)) ||
    retailPriority.indexOf(a.kind) - retailPriority.indexOf(b.kind) ||
    (a.date || "9999").localeCompare(b.date || "9999") ||
    capturedTime(b) - capturedTime(a)
  );
  for (const lead of sorted) {
    const card = document.createElement("article");
    const heading = document.createElement("h3");
    heading.textContent = `${lead.reference} · ${lead.buyer}`;
    card.append(heading);
    for (const line of [
      [lead.kind, lead.stage, lead.contact, lead.date && `Due ${lead.date}`].filter(Boolean).join(" · "),
      lead.capturedAt && `Captured ${lead.capturedAt}`,
      lead.notes,
      estimate(lead),
      lead.exit && `Exit evidence: ${lead.exit}`,
      lead.nextAction && `Next action: ${lead.nextAction}`,
    ].filter(Boolean)) {
      const detail = document.createElement("p");
      detail.textContent = line;
      card.append(detail);
    }
    const url = originalUrl(lead.url);
    if (url) {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open original post";
      card.append(link, document.createElement("br"));
    }
    const edit = document.createElement("button");
    edit.textContent = "Edit request";
    edit.addEventListener("click", () => {
      editingId = lead.id;
      for (const key of fields) form.elements.namedItem(key).value = lead[key] ?? "";
      document.querySelector("#editor-title").textContent = "Edit request";
      updateEstimate();
      form.scrollIntoView();
      form.elements.namedItem("buyer").focus();
    });
    card.append(edit);
    list.append(card);
  }
}

form.addEventListener("input", updateEstimate);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const existing = requests.find((lead) => lead.id === editingId);
  const lead = { ...existing, ...Object.fromEntries(new FormData(form)), id: editingId ?? crypto.randomUUID(), capturedAt: existing?.capturedAt ?? new Date().toISOString() };
  if (save([...requests.filter((item) => item.id !== lead.id), lead])) {
    status.textContent = "Request saved.";
    reset();
  }
});
document.querySelector("#reset").addEventListener("click", reset);

document.querySelector("#import").addEventListener("change", async (event) => {
  const input = event.currentTarget;
  if (!input.files.length) return;
  try {
    const data = JSON.parse(await input.files[0].text());
    if (!Array.isArray(data)) throw new Error();
    const next = new Map(requests.map((lead) => [lead.id, lead]));
    const previousCount = next.size;
    for (const row of data) {
      if (typeof row?.id !== "string" || !row.id) throw new Error();
      if (next.has(row.id)) continue;
      const isScannerLead = typeof row.demandText === "string";
      const lead = isScannerLead ? {
        buyer: row.buyer || "Unknown buyer",
        reference: Array.isArray(row.references) ? row.references.join(", ") || "Reference to confirm" : "Reference to confirm",
        kind: "Unverified",
        stage: "New",
        contact: row.source,
        url: row.url,
        notes: row.demandText,
        profit: "1000",
      } : row;
      const values = Object.fromEntries(fields.map((key) => [key, typeof lead[key] === "string" ? lead[key] : ""]));
      if (!values.buyer || !values.reference || !retailPriority.includes(values.kind) ||
          !Array.from(form.elements.namedItem("stage").options).some((option) => option.value === values.stage)) throw new Error();
      next.set(row.id, { ...values, id: row.id, capturedAt: typeof row.capturedAt === "string" ? row.capturedAt : "" });
    }
    if (save([...next.values()])) status.textContent = `Imported ${next.size - previousCount} requests. Existing entries were kept.`;
  } catch {
    status.textContent = "Import failed. Choose a valid scanner WTB export or Buyer Desk backup.";
  } finally {
    input.value = "";
  }
});

document.querySelector("#export").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(requests, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "north-star-buyer-requests.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

render();
updateEstimate();
