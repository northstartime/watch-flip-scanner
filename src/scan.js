import { BADHINTS } from "dns";
import readline from "readline";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

function calculateProfit(watch) {
    return (
        watch.marketValue -
        watch.buyPrice -
        watch.fees -
        watch.shipping
    );
}

function calculateScore(watch, profit) {
    let score = 0;
    const reasons = [];

    if (profit >= 1000) {
        score += 30;
        reasons.push("Profit over $1,000");
    } else if (profit >= 500) {
        score += 15;
        reasons.push("Profit over $500");
    }

    if (watch.hasBoxAndPapers) {
        score += 15;
        reasons.push("Box and papers");
    }

    if (watch.trustedSeller) {
        score += 15;
        reasons.push("Trusted seller");
    }

    switch (watch.condition) {
        case "unworn":
            score += 20;
            reasons.push("Unworn");
            break;
        case "excellent":
            score += 15;
            reasons.push("Excellent condition");
            break;
        case "very good":
            score += 10;
            reasons.push("Very good condition");
            break;
        case "good":
            score += 5;
            reasons.push("Good condition");
            break;
        case "needs service":
            score -= 10;
            reasons.push("Needs service");
            break;
    }

    return { score, reasons };
}

function getStars(score) {
    if (score >= 90) return "⭐⭐⭐⭐⭐";
    if (score >= 75) return "⭐⭐⭐⭐";
    if (score >= 60) return "⭐⭐⭐";
    if (score >= 40) return "⭐⭐";
    return "⭐";
}

function getDecision(score) {
    if (score >= 90) return { decision: "🔥 ELITE BUY", risk: "VERY LOW" };
    if (score >= 75) return { decision: "✅ STRONG BUY", risk: "LOW" };
    if (score >= 60) return { decision: "👀 WATCH LIST", risk: "MEDIUM" };
    if (score >= 40) return { decision: "🤔 SPECULATIVE", risk: "HIGH" };

    return { decision: "❌ PASS", risk: "VERY HIGH" };
}

function calculateOfferTargets(watch, score) {
    let idealOffer = watch.buyPrice;
    let walkAway = watch.buyPrice;

    if (score >= 90) {
        idealOffer = watch.buyPrice;
        walkAway = watch.buyPrice + 300;
    } else if (score >= 75) {
        idealOffer = watch.buyPrice - 200;
        walkAway = watch.buyPrice + 150;
    } else if (score >= 60) {
        idealOffer = watch.buyPrice - 300;
        walkAway = watch.buyPrice;
    } else {
        idealOffer = watch.buyPrice - 500;
        walkAway = watch.buyPrice - 200;
    }

    return { idealOffer, walkAway };
}

async function startScanner() {
    console.clear();

    console.log("========================================");
    console.log("      NORTH STAR SCANNER 3.0");
    console.log("========================================");
    console.log("");

    const watch = {
        brand: await ask("Brand: "),
        model: await ask("Model: "),
        buyPrice: Number(await ask("Buy Price: $")),
        marketValue: Number(await ask("Estimated Market Value: $")),
        fees: Number(await ask("Fees: $")),
        shipping: Number(await ask("Shipping: $")),
        hasBoxAndPapers: (await ask("Box & Papers? (y/n): ")).toLowerCase() === "y",
        trustedSeller: (await ask("Trusted Seller? (y/n): ")).toLowerCase() === "y",
        condition: (await ask("Condition (unworn/excellent/very good/good/needs service): ")).toLowerCase()
    };

    const profit = calculateProfit(watch);
    const { score, reasons } = calculateScore(watch, profit);
    const { decision, risk } = getDecision(score);
    const { idealOffer, walkAway } = calculateOfferTargets(watch, score);

    console.clear();

    console.log("========================================");
    console.log("      NORTH STAR SCANNER 3.0");
    console.log("========================================");
    console.log("");

    console.log(`${watch.brand} ${watch.model}`);
    console.log("");

    console.log(`Buy Price:        $${watch.buyPrice}`);
    console.log(`Market Value:     $${watch.marketValue}`);
    console.log(`Fees:             $${watch.fees}`);
    console.log(`Shipping:         $${watch.shipping}`);
    console.log("");
    console.log(`Projected Profit: $${profit}`);
    console.log("");
    console.log(`North Star Score: ${score}/100`);
    console.log(getStars(score));
    console.log("");
    console.log(`Decision: ${decision}`);
    console.log(`Risk: ${risk}`);
    console.log("");
    console.log(`Ideal Offer:      $${idealOffer}`);
    console.log(`Walk-Away Price:  $${walkAway}`);
    console.log("");
    console.log("Reasons:");

    for (const reason of reasons) {
        console.log(`✅ ${reason}`);
    }

    rl.close();
}

startScanner();


