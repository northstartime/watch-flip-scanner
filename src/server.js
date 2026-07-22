import express from "express";
import { main } from "./quickEvaluate.js";
const app = express();

app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.send(`
        <html>
        <head>
            <title>North Star Scanner</title>
            <style>
                body{
                    font-family:Arial;
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
            </style>
        </head>

        <body>

        <h1>⭐ North Star Scanner</h1>

        <form method="POST" action="/evaluate">

            <textarea
                name="listing"
                placeholder="Paste Facebook, MODA, or dealer listing here..."
            ></textarea>

            <br>

            <button type="submit">
                Evaluate
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
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>North Star Evaluation</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    max-width: 700px;
                    margin: 40px auto;
                    padding: 20px;
                }

                .result {
                    border: 1px solid #ccc;
                    border-radius: 10px;
                    padding: 20px;
                }

                .decision {
                    font-size: 28px;
                    font-weight: bold;
                }
.decision {
    font-size: 28px;
    font-weight: bold;
}

.banner {
    color: white;
    font-size: 32px;
    font-weight: bold;
    text-align: center;
    padding: 16px;
    border-radius: 10px;
    margin-bottom: 25px;
}

.buy {
    background: #16a34a;
}

.hold {
    background: #d97706;
}

.pass {
    background: #dc2626;
}

.review {
    background: #4b5563;
}

li {
    margin-bottom: 8px;
}
                li {
                    margin-bottom: 8px;
                }
            </style>
        </head>

        <body>
            <h1>⭐ North Star Evaluation</h1>

            <div class="result">
              <div class="banner ${evaluation.decision.toLowerCase()}">
    ${evaluation.decision}
</div>  

                <h2>
                    ${evaluation.brand ?? "Unknown Brand"}
                    ${evaluation.model ?? ""}
                </h2>

                <p><strong>Reference:</strong> ${evaluation.reference ?? "Unknown"}</p>
                <p><strong>Year:</strong> ${evaluation.year ?? "Unknown"}</p>
                <p><strong>Asking Price:</strong> $${evaluation.price ?? "Unknown"}</p>
                <p><strong>Market Value:</strong> $${evaluation.marketValue ?? "Unknown"}</p>
                <p><strong>Projected Profit:</strong> $${evaluation.projectedProfit.toFixed(2)}</p>
                <p><strong>Maximum Offer:</strong> $${evaluation.maxOffer}</p>

                <h2>
                    North Star Score:
                    ${evaluation.score}/100
                    ${evaluation.stars}
                </h2>

                <h3>Score Breakdown</h3>
                <ul>
              ${
  evaluation.reasons.length
    ? evaluation.reasons
        .map((reason) => `<li>${reason}</li>`)
        .join("")
    : "<li>No scoring adjustments applied.</li>"
}     
                </ul>
            </div>

            <p><a href="/">← Evaluate another listing</a></p>
        </body>
        </html>
    `);
});

app.listen(3000, () => {
    console.log("North Star Scanner running...");
    console.log("http://localhost:3000");
});