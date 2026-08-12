import { main as runScanner } from "./daily.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { main } from "./quickEvaluate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const opportunitiesFile = path.join(
    __dirname,
    "data",
    "opportunities.json"
);

const app = express();
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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
    const data = JSON.parse(
      fs.readFileSync(opportunitiesFile, "utf8")
    );

    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Could not load opportunities."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log("");
    console.log("⭐ North Star Terminal Running");
  
    console.log("");

});