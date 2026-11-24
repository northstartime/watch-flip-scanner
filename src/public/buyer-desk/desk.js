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

function estimate(lead) {
  if (!lead.sale || lead.costs === "" || lead.profit === "") {
    return "Enter sale price, selling costs and target profit to see your buy ceiling.";
  }
  const netProceeds = Number(lead.sale) - Number(lead.costs);
  const ceiling = netProceeds - Number(lead.profit);
  const result = ceiling < 0 ? "Target profit exceeds net proceeds." : `Max all-in buy: ${money.format(ceiling)}.`;
  return lead.offer === "" ? result : `${result} Expected profit: ${money.format(netProceeds - Number(lead.offer))}.`;
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
    retailPriority.indexOf(a.kind) - retailPriority.indexOf(b.kind) ||
    (a.date || "9999").localeCompare(b.date || "9999")
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
      lead.exit && `Backup exit: ${lead.exit}`,
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
      for (const key of fields) form.elements.namedItem(key).value = lead[key];
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
  const lead = { ...existing, ...Object.fromEntries(new FormData(form)), id: editingId ?? crypto.randomUUID() };
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
