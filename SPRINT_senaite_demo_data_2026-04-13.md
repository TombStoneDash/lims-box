# LIMS BOX Factory Sprint — SENAITE Demo Data Setup
**Date:** April 13, 2026
**Priority:** 🟡 MEDIUM — Prep for "Audit Tomorrow" video
**Lenovo Execution:** SENAITE runs on Mac Mini, not Lenovo. This is a reference doc.

---

## CONTEXT

"Audit Tomorrow" production script requires SENAITE instance with:
- 500+ sample records
- 90 days of QC data
- Training records for 4 staff
- Calibration records for 5 instruments
- Audit trail data

---

## SENAITE SETUP REQUIREMENTS

### 1. Sample Data (500+ records)
```
- Sample IDs: SA-2026-0001 through SA-2026-0847
- Sample types: Blood, Urine, Swab, Tissue
- Statuses: Registered, Received, Verified, Published
- All with chain of custody timestamps
- 3 samples in "Pending Verification" status (for demo)
```

### 2. QC Data (90 days)
```
- Daily QC runs for Glucose, HbA1c, CBC
- Levey-Jennings data within ±2SD
- No out-of-range flags (clean audit)
- Control lot numbers documented
```

### 3. Personnel/Training
```
- 4 staff members: Sarah (Lab Director), Mike, Ana, James
- Competencies: Phlebotomy, Chemistry, Hematology, QC
- All training current (no expirations until June)
- Electronic signatures enabled
```

### 4. Equipment/Calibration
```
- 5 instruments: Chemistry Analyzer, Hematology Analyzer, Centrifuge, Microscope, Refrigerator
- All calibrated within last 30 days
- Next calibration due: April 28, 2026
- Maintenance logs current
```

### 5. Audit Trail
```
- All samples have full audit history
- Timestamps, user IDs, action types
- Sample SA-2026-0847 specifically needs rich audit trail for demo
```

---

## SENAITE SCREENS TO VERIFY

| Screen | Path | Expected Data |
|--------|------|---------------|
| Dashboard | /senaite | 847 samples, QC indicators green |
| Sample SA-2026-0847 | /senaite/samples/SA-2026-0847 | Full details + audit log |
| QC Control Charts | /senaite/qc/controlcharts | Glucose trending, all in range |
| Equipment | /senaite/equipment | 5 instruments, all calibrated |
| Training | /senaite/bika_setup/training | 4 staff, all current |

---

## LIMS BOT QUERIES TO TEST

```
1. "Prepare audit checklist for CAP inspection tomorrow"
2. "Show audit trail for sample SA-2026-0847"
3. "QC trending for glucose, last 90 days"
4. "Staff training status"
5. "Instrument calibration status"
6. "Generate CAP audit readiness report"
```

---

## NOTES

- SENAITE runs on Mac Mini (Docker or native)
- This sprint is for DATA SETUP, not code
- If SENAITE not available, create mockup screens
- Production script is at: `outbox/LIMS_AUDIT_TOMORROW_PRODUCTION_SCRIPT.md`
