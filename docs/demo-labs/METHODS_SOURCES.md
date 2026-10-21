# Environmental demo profile: method sources

Everything in `lib/demo-labs/environmental.ts` and `lib/demo-labs/environmental-qc.ts` is synthetic demo data for a fictional lab. QC acceptance windows are illustrative demo values, not certified limits. Method numbers and holding times come from the public sources below.

| Code | Method | Public source | Holding time used |
|---|---|---|---|
| EPA-200.8 | Trace metals by ICP-MS (also SW-846 6020) | EPA Method 200.8 Rev 5.4; SW-846 Method 6020B | 6 months (180 days), 40 CFR 136.3 Table II (metals except Hg/Cr VI) |
| EPA-300.0 | Inorganic anions by ion chromatography | EPA Method 300.0 Rev 2.1 | 28 days (chloride, fluoride, sulfate), 40 CFR 136.3 Table II |
| SM-9223B | Total coliform / E. coli, enzyme substrate (also SM 9222 membrane filter) | Standard Methods 9223 B, 9222 | 30 hours, drinking-water compliance samples (40 CFR 141.21(f)(3)) |
| SM-5210B | Biochemical oxygen demand, 5-day | Standard Methods 5210 B | 48 hours, 40 CFR 136.3 Table II |
| SM-2540D | Total suspended solids | Standard Methods 2540 D | 7 days, 40 CFR 136.3 Table II |
| SM-5220D | Chemical oxygen demand, closed reflux colorimetric | Standard Methods 5220 D | 28 days, 40 CFR 136.3 Table II |
| EPA-524.2 | Volatile organics by purge-and-trap GC/MS (also SW-846 8260) | EPA Method 524.2 Rev 4.1; SW-846 Method 8260D | 14 days (preserved), EPA 524.2 §8 |

Batch QC elements modeled: method blank (must read below the reporting limit), LCS/LCSD (recovery window), MS/MSD (spike recovery window), and duplicate (RPD limit). Any failure, or a missing blank or LCS, returns `needs_review`; the demo never auto-releases a batch.
