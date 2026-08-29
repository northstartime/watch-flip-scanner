import fs from "fs";
import { spawnSync } from "child_process";

function runStep(name, script) {
  console.log(`\n===== ${name} =====`);

  const result = spawnSync(
    process.execPath,
    [script],
    {
      stdio: "inherit",
      shell: false,
    }
  );

  if (result.status !== 0) {
    throw new Error(`${name} failed`);
  }

  console.log(`✓ ${name} completed`);
}

try {
  const startedAt = new Date().toISOString();

  runStep("DAILY ASK SCAN", "src/daily.js");
  runStep("WTB / ISO SCAN", "src/wtbScan.js");
  runStep("MARKET MATCH", "src/marketMatch.js");

  const finishedAt = new Date().toISOString();

  fs.writeFileSync(
    "scanner-status.json",
    JSON.stringify(
      {
        status: "ONLINE",
        success: true,
        startedAt,
        lastSuccessfulRun: finishedAt,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("\n================================");
  console.log("NORTH STAR FULL RUN COMPLETE");
  console.log(`Last successful run: ${finishedAt}`);
  console.log("================================");
} catch (error) {
  const failedAt = new Date().toISOString();

  fs.writeFileSync(
    "scanner-status.json",
    JSON.stringify(
      {
        status: "ERROR",
        success: false,
        failedAt,
        error: error.message,
      },
      null,
      2
    ),
    "utf8"
  );

  console.error("\nNORTH STAR RUNNER ERROR");
  console.error(error.message);

  process.exitCode = 1;
}