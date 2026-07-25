import fs from "fs";
import { parseListing } from "../parser.js";

export async function getModaListings() {

    console.log("Searching Moda...");

    const path = "./moda/listings.txt";

    if (!fs.existsSync(path)) {
        return [];
    }

    const text = fs.readFileSync(path, "utf8").trim();

    if (!text) {
        return [];
    }

    const listings = text
        .split("===================")
        .map(x => x.trim())
        .filter(Boolean);

    return listings.map(parseListing);
}
