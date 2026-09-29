// CI discovers only tests/**/*.test.ts(x). The clinical and diagnostics seed's
// own tests live next to the scripts, so importing them here puts them under CI.
import '../../scripts/seed/clinical-diagnostics/seed.test.mjs';
