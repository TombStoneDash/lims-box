/**
 * Lab profile seam for the generic multi-lab demo at /demo/labs/[labType].
 * Every value is synthetic. Display names are fictional; no customer name
 * appears anywhere in a profile. Spec: LIMS_BUILD_PLAN_DELTA_REGROUND_20261012 §3 F1.
 */
export type LabSector = 'environmental' | 'clinical' | 'diagnostics';

export type Method = Readonly<{
  code: string;
  name: string;
  matrix: string;
}>;

export type InstrumentStub = Readonly<{
  id: string;
  name: string;
  methods: readonly string[];
}>;

export type VolumeRange = Readonly<{
  min: number;
  max: number;
  unit: 'samples/yr';
  label: 'planning range';
}>;

/** The seven brand tokens the pilot already validated; kept field-for-field. */
export type LabBrand = Readonly<{
  labName: string;
  legalName: string;
  primaryColor: string;
  accentColor: string;
  logoPath: string;
  reportFooter: string;
  supportEmail: string;
}>;

export type LabProfile = Readonly<{
  slug: string;
  displayName: string;
  sector: LabSector;
  testMenu: readonly Method[];
  instruments: readonly InstrumentStub[];
  volumeRange: VolumeRange;
  roles: readonly string[];
  qcRules: readonly string[];
  reportTemplates: readonly string[];
  /** Names of frameworks the demo references. Names only; no compliance claim. */
  complianceFrame: readonly string[];
  brand: LabBrand;
}>;
