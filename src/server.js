import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { main } from "./quickEvaluate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDirectory = process.env.NORTH_STAR_DATA_DIR
  ? path.resolve(process.env.NORTH_STAR_DATA_DIR)
  : path.join(__dirname, "data");
const opportunitiesFile = path.join(dataDirectory, "opportunities.json");

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

function writeOpportunities(opportunities) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporaryFile = `${opportunitiesFile}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(opportunities, null, 2),
    "utf8"
  );
  fs.renameSync(temporaryFile, opportunitiesFile);
}

function requireUploadKey(req, res, next) {
  const configuredKey = process.env.NORTH_STAR_UPLOAD_KEY;

  if (!configuredKey) {
    return res.status(503).json({
      error: "Cloud uploads are not configured.",
    });
  }

  const authorization = req.get("authorization") || "";
  const suppliedKey = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : req.get("x-api-key");

  if (suppliedKey !== configuredKey) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  next();
}

const app = express();
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>North Star Terminal</title>

<style>
body{
    font-family:Arial,sans-serif;
    max-width:700px;
    margin:40px auto;
    padding:20px;
}

textarea{
    width:100%;
    height:250px;
    font-size:16px;
}

button{
    margin-top:15px;
    padding:12px 24px;
    font-size:18px;
}

.banner{
    color:white;
    font-size:30px;
    font-weight:bold;
    text-align:center;
    padding:15px;
    border-radius:10px;
    margin-bottom:25px;
}

.buy{background:#16a34a;}
.hold{background:#d97706;}
.pass{background:#dc2626;}
.review{background:#4b5563;}
</style>

</head>

<body>

<h1>⭐ North Star Terminal</h1>

<form method="POST" action="/evaluate">

<textarea
name="listing"
placeholder="Paste a MODA, Facebook or dealer listing..."
></textarea>

<br>

<button type="submit">
Evaluate Listing
</button>

</form>

</body>
</html>
`);
});

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
app.get("/api/opportunities", (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(readOpportunities());

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Could not load opportunities."
    });
  }
});

app.post("/api/opportunities", requireUploadKey, (req, res) => {
  try {
    const opportunities = req.body;

    if (!Array.isArray(opportunities)) {
      return res.status(400).json({
        error: "Request body must be an array of opportunities.",
      });
    }

    if (opportunities.length > 500) {
      return res.status(413).json({
        error: "Too many opportunities in one upload.",
      });
    }

    writeOpportunities(opportunities);

    res.json({
      ok: true,
      count: opportunities.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save opportunities." });
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

const server = app.listen(PORT, () => {

    console.log("");
    console.log("⭐ North Star Terminal Running");
  
    console.log("");

});

export { app, server };
