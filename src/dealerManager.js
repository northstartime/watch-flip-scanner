import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dealersFile = path.join(__dirname, "data", "dealers.json");

export function getDealers() {
  const data = fs.readFileSync(dealersFile, "utf8");
  return JSON.parse(data);
}