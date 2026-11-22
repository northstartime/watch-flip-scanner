import { unifiedDealDeskRead } from './unifiedDealDeskFeed.js';
import {scannerPage} from './scannerPage.js';
import {loadSourcingContext,annotateSourcing} from './sourcingResearch.js';
import {eligibleSaleRecord} from './saleListing.js';
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "node:crypto";
import express from "express";
import { createInventoryStore, InventoryError } from "./inventoryStore.js";
import { main } from "./quickEvaluate.js";
import { createUploadAuthorization } from "./uploadAuth.js";
import { loadRuntimeEnvironment } from "./runtimeUtils.js";

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) await loadRuntimeEnvironment();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDirectory = process.env.NORTH_STAR_DATA_DIR
  ? path.resolve(process.env.NORTH_STAR_DATA_DIR)
  : path.join(__dirname, "data");
const opportunitiesFile = path.join(dataDirectory, "opportunities.json");
const scanRequestFile = path.join(dataDirectory, "scan-request.json");

function readOpportunities() {
  if (!fs.existsSync(opportunitiesFile)) {
    return [];
  }

  const data = JSON.parse(fs.readFileSync(opportunitiesFile, "utf8"));

  if (!Array.isArray(data)) {
    throw new Error("Stored opportunities must be an array.");
  }

  return data;
}

const inventory = createInventoryStore(opportunitiesFile);

const requireUploadKey = createUploadAuthorization();

const app = express();
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path.toLowerCase().startsWith('/api/deal-desk/') ? req.path : req.url}`);
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "25mb" }));
// Body-parser errors may contain submitted data; never echo/log the raw exception.
app.use((error, req, res, next) => {
  const oversized = error.type === 'entity.too.large';
  const malformed = error.type === 'entity.parse.failed';
  res.status(oversized ? 413 : malformed ? 400 : 500).json({
    error: oversized ? 'PAYLOAD_TOO_LARGE' : malformed ? 'INVALID_JSON' : 'REQUEST_FAILED',
  });
});

app.get("/", (req, res) => { res.send(scannerPage()); });
app.post("/evaluate", async (req, res) => {

    const listing = req.body.listing;

    const evaluation = await main(listing);

    res.send(`
<!DOCTYPE html>
<html>

<head>

<meta charset="UTF-8">

<title>North Star Evaluation</title>

<style>

body{
font-family:Arial;
max-width:700px;
margin:40px auto;
padding:20px;
}

.banner{
color:white;
font-size:30px;
font-weight:bold;
text-align:center;
padding:15px;
border-radius:10px;
margin-bottom:20px;
}

.buy{background:#16a34a;}
.hold{background:#d97706;}
.pass{background:#dc2626;}
.review{background:#4b5563;}

</style>

</head>

<body>

<h1>⭐ North Star Evaluation</h1>

<div class="banner ${evaluation.decision.toLowerCase()}">
${evaluation.decision}
</div>

<h2>${evaluation.brand ?? ""} ${evaluation.model ?? ""}</h2>

<p><strong>Reference:</strong> ${evaluation.reference ?? "Unknown"}</p>

<p><strong>Year:</strong> ${evaluation.year ?? "Unknown"}</p>

<p><strong>Price:</strong> $${evaluation.price ?? "Unknown"}</p>

<p><strong>Market Value:</strong> $${evaluation.marketValue ?? "Unknown"}</p>

<p><strong>Projected Profit:</strong>
${
evaluation.projectedProfit == null
? "Manual Review"
: evaluation.projectedProfit.toFixed(2)
}
</p>

<p><strong>Maximum Offer:</strong>
${
evaluation.maxOffer ?? "Not calculated"
}
</p>

<h2>

North Star Score

${evaluation.score}/100

${evaluation.stars}

</h2>

<h3>Reasons</h3>

<ul>

${
evaluation.reasons.length
? evaluation.reasons.map(r=>`<li>${r}</li>`).join("")
: "<li>No adjustments.</li>"
}

</ul>

<p>

<a href="/">← Evaluate another listing</a>

</p>

</body>

</html>

`);

});
app.post("/api/evaluate", async (req, res) => {

    try {

        const listing = req.body.listing;

        const evaluation = await main(listing);

        res.json(evaluation);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Evaluation failed."
        });

    }

});
app.get("/api/image-proxy", async (req, res) => {
  try {
    const imageUrl = String(req.query.url || "");

    if (!imageUrl) {
      return res.status(400).send("Missing image URL");
    }

    const parsedUrl = new URL(imageUrl);

    if (!parsedUrl.hostname.endsWith("fbcdn.net")) {
      return res.status(400).send("Unsupported image host");
    }

    const response = await fetch(imageUrl);

    if (!response.ok) {
      return res.status(response.status).send("Could not load image");
    }

    const contentType =
      response.headers.get("content-type") || "image/jpeg";

    const imageBuffer = Buffer.from(
      await response.arrayBuffer()
    );

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=300");
    res.send(imageBuffer);
  } catch (error) {
    console.error("Image proxy error:", error);
    res.status(500).send("Image proxy failed");
  }
});
app.get("/api/opportunities", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    // Response-only filter: retain the complete stored inventory for other operations.
    const facebookListings = readOpportunities().filter(listing =>
      typeof listing?.source === 'string' &&
      ['moda', 'facebook'].includes(listing.source.trim().toLowerCase())
    );
    const components=new Set(facebookListings.filter(row=>row.watchKey).map(row=>String(row.parentPostId)));
    const visible=facebookListings.filter(eligibleSaleRecord).filter(row=>row.watchKey || !components.has(String(row.id).replace(/^moda-/,'')));
    const selected=['research','opportunities'].includes(req.query?.queue)?visible.filter(row=>(row.queue??'research')===req.query.queue):visible;
    const sourcingContext=await loadSourcingContext({directory:path.join(dataDirectory,'research')});
    res.json(selected.map(row=>annotateSourcing(row,sourcingContext)));

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Could not load opportunities."
    });
  }
});

app.get('/api/deal-desk/opportunities', unifiedDealDeskRead());
app.get('/api/deal-desk/health', unifiedDealDeskRead({health:true}));

// Existing AWS watcher contract: reads never consume or acknowledge requests.
app.get('/api/scan-request', requireUploadKey, (req, res) => {
  res.set('Cache-Control', 'no-store, private');
  try {
    res.json(JSON.parse(fs.readFileSync(scanRequestFile, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return res.json({ requestedAt: null });
    res.status(500).json({ error: 'SCAN_REQUEST_READ_FAILED' });
  }
});

// SECURITY: intentionally unauthenticated to preserve the deployed iPhone contract.
// Changing this requires a coordinated app/auth migration, not a server-only patch.
app.post('/api/scan-request', (req, res) => {
  res.set('Cache-Control', 'no-store');
  let temporary;
  try {
    const request = { requestedAt: new Date().toISOString() };
    fs.mkdirSync(dataDirectory, { recursive: true });
    temporary = `${scanRequestFile}.${randomUUID()}.tmp`;
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(request));
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, scanRequestFile);
    temporary = undefined;
    res.json({ ok: true, requestedAt: request.requestedAt });
  } catch {
    res.status(500).json({ error: 'SCAN_REQUEST_WRITE_FAILED' });
  } finally {
    if (temporary) {
      try { fs.unlinkSync(temporary); } catch { /* Never expose paths or raw errors. */ }
    }
  }
});

// Complete inventory is never exposed by the public iPhone feed.
app.get('/api/opportunities/inventory', requireUploadKey, (req, res) => {
  res.set('Cache-Control', 'no-store, private');
  try {
    const snapshot = inventory.snapshot();
    res.set('ETag', snapshot.version);
    res.json({ ok: true, complete: true, version: snapshot.version, opportunities: snapshot.rows });
  } catch {
    res.status(500).json({ error: 'INVENTORY_READ_FAILED' });
  }
});

app.post('/api/opportunities', requireUploadKey, (req, res) => {
  res.set('Cache-Control', 'no-store, private');
  try {
    const result = inventory.commit(req.body, req.get('if-match'));
    res.set('ETag', result.version);
    res.json(result);
  } catch (error) {
    if (error instanceof InventoryError) {
      return res.status(error.status).json({ error: error.code, ...(error.validation ? { validation: error.validation } : {}) });
    }
    // Never log stored listing data, filesystem paths, headers or raw exceptions.
    res.status(500).json({ error: 'INVENTORY_WRITE_FAILED' });
  }
});

app.get("/api/health", (req, res) => {
  try {
    const opportunities = readOpportunities();
    const stats = fs.existsSync(opportunitiesFile)
      ? fs.statSync(opportunitiesFile)
      : null;

    res.json({
      ok: true,
      count: opportunities.length,
      updatedAt: stats?.mtime.toISOString() ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Health check failed." });
  }
});

const PORT = process.env.PORT || 3000;

// Importing the app for offline tests never opens a listening socket.
const server = isMain ? app.listen(PORT, () => console.log('North Star Terminal Running')) : null;
export { app, server };
