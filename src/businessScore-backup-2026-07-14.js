export function evaluateWatch(watch) {
    const profit =
        watch.marketValue -
        watch.buyPrice -
        watch.fees -
        watch.shipping;

    const roi = (profit / watch.buyPrice) * 100;
    const desiredProfit = 1000;

    const maximumBid=
    watch.marketValue -
    watch.fees -
    watch.shipping -
    desiredProfit;


    let score = 0;
    const reasons = [];

    // Profit score
    if (profit >= 1500) {
        score += 35;
        reasons.push("Huge profit potential");
    } else if (profit >= 1000) {
        score += 30;
        reasons.push("Excellent profit");
    } else if (profit >= 750) {
        score += 20;
        reasons.push("Solid profit");
    } else if (profit >= 500) {
        score += 10;
        reasons.push("Moderate profit");
    } else {
        score -= 25;
        reasons.push("Profit below target");
    }

    // ROI score
    if (roi >= 15) {
        score += 20;
        reasons.push("Excellent ROI");
    } else if (roi >= 10) {
        score += 15;
        reasons.push("Good ROI");
    } else if (roi >= 7) {
        score += 10;
        reasons.push("Acceptable ROI");
    } else {
        score -= 10;
        reasons.push("Weak ROI");
    }

    // Seller / watch quality
    if (watch.trustedSeller) {
        score += 15;
        reasons.push("Trusted seller");
    }

    if (watch.hasBoxAndPapers) {
        score += 10;
        reasons.push("Box and papers");
    }

    if (watch.fullLinks) {
        score += 10;
        reasons.push("Full links");
    }

    if (watch.condition === "excellent") {
        score += 10;
        reasons.push("Excellent condition");
    }

    // Hidden Gem score
    if (watch.title) {
        const title = watch.title.toLowerCase();

        if (
            title === "rolex watch" ||
            title === "rolex" ||
            title === "watch"
        ) {
            score += 15;
            reasons.push("Hidden Gem: Generic title");
        }

        if (
            title.includes("date just") ||
            title.includes("explorerii") ||
            title.includes("submarner") ||
            title.includes("dayejust")
        ) {
            score += 20;
            reasons.push("Hidden Gem: Misspelled title");
        }
    }

    // Tom Factor
    if (watch.model.includes("Explorer")) {
        score += 10;
        reasons.push("Tom Factor: Explorer familiarity");
    } else if (watch.model.includes("Datejust")) {
        score += 8;
        reasons.push("Tom Factor: Datejust familiarity");
    } else if (watch.model.includes("Air-King")) {
        score += 8;
        reasons.push("Tom Factor: Air-King familiarity");
    } else {
        score += 3;
        reasons.push("Tom Factor: neutral");
    }

    let decision = "🔴 PASS";

    if (profit >= 1000 && score >= 85) {
        decision = "🟢 BUY NOW";
    } else if (profit >= 750 && score >= 70) {
        decision = "🟡 WATCH";
    } else if (profit >= 500 && score >= 60) {
        decision = "👀 POSSIBLE";
    }

score = Math.max(0, Math.min(100, score));

    return {
        profit,
        roi,
        score,
        reasons,
        decision,
        maximumBid
    };
}