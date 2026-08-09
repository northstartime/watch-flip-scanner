import { dumpAccessibilityTree } from "./collectors/modaCollector.js";

try {
  await dumpAccessibilityTree();
  console.log("✓ Moda collection test completed.");
  process.exit(0);
} catch (error) {
  console.error("Moda collection test failed:");
  console.error(error);
  process.exit(1);
}