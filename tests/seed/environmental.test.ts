// CI discovers only tests/**/*.test.ts(x). The environmental seed's own tests
// live next to the scripts, so importing them here puts them under CI.
import '../../scripts/seed/environmental/seed.test.mjs';
import '../../scripts/seed/environmental/results.test.mjs';
