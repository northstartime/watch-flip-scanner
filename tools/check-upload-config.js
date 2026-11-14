import { loadRuntimeEnvironment } from '../src/runtimeUtils.js';
import { validateScannerConfiguration } from '../src/scannerConfig.js';

// Configuration-only preflight: never fetches, scans, or prints secret values.
try {
  await loadRuntimeEnvironment();
  validateScannerConfiguration();
  console.log('Upload configuration is unambiguous; cloud authentication remains unverified.');
} catch (error) {
  // Only our resolver/validation errors reach here; never print stacks or env objects.
  console.error(error.message);
  process.exitCode = 1;
}
