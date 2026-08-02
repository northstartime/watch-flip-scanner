import fs from "fs";
import { parseListing } from "../parser.js";

export async function getModaListings() {

    console.log("Searching Moda...");

    const path = "./listing.txt";

    if (!fs.existsSync(path)) {
        return [];
    }

    const text = fs.readFileSync(path, "utf8").trim();

    if (!text) {
        return [];
    }

    return [parseListing(text)];

}