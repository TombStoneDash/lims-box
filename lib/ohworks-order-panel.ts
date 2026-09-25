/**
 * Fail-closed, deterministic order-panel expansion for the synthetic OHWorks
 * pilot.
 *
 * This module is a pure, dependency-free evaluator: given a declared panel
 * catalogue (panel code -> member codes, each member explicitly tagged as an
 * ANALYTE or a nested PANEL) and an order (a flat list of lines, each
 * explicitly tagged as a PANEL or a single ANALYTE), it expands the order
 * into a de-duplicated analyte code list that preserves first-seen order.
 *
 * Nesting is allowed to exactly one level: an ordered panel may contain a
 * member that is itself another declared panel, and that nested panel's own
 * members are expanded too, but only if every one of the nested panel's
 * members is an ANALYTE. If a nested panel itself contains a further PANEL
 * member (depth two from the ordered panel), that branch is reported as a
 * nesting violation and is excluded from the analyte list rather than
 * expanded further.
 *
 * Order lines that reference a code not present in the catalogue (for a
 * PANEL line) or not present in the declared known-analyte list (for an
 * ANALYTE line, including an ANALYTE member discovered while expanding a
 * panel) are reported as unknown codes rather than expanded; the rest of the
 * order still expands normally.
 *
 * The catalogue itself is treated as trusted, declared configuration, so it
 * is held to a stricter standard than the order: it fails closed, throwing
 * OrderPanelError, when a PANEL-kind member references a panel code that is
 * not itself declared in the catalogue ("unknown panels"), or when the
 * PANEL-kind reference graph across the whole catalogue contains a cycle.
 * Malformed structural input (empty codes) also fails closed.
 */

/** The only two kinds a catalogue member or order line may be tagged with. */
export type OrderPanelMemberKind = 'ANALYTE' | 'PANEL';

/** A single declared member of a panel: an analyte code, or a nested panel code. */
export type OrderPanelMember = {
  readonly code: string;
  readonly kind: OrderPanelMemberKind;
};

/**
 * Declared, fabricated panel catalogue: panel code -> member codes. Never
 * derived from a real compendium; synthetic fixtures only.
 */
export type OrderPanelCatalogue = Readonly<Record<string, readonly OrderPanelMember[]>>;

/** A single line in a fabricated order: either a panel code or a single analyte code. */
export type OrderLine = {
  readonly code: string;
  readonly kind: OrderPanelMemberKind;
};

/** An order-line or panel-member code that could not be resolved against the catalogue or known-analyte list. */
export type OrderPanelUnknownCode = {
  readonly code: string;
  readonly kind: OrderPanelMemberKind;
};

/** A catalogue member found nested more than one level below an ordered panel. Excluded from expansion. */
export type OrderPanelNestingViolation = {
  /** The panel code that was directly ordered. */
  readonly panelCode: string;
  /** The panel nested one level below panelCode whose own member is too deep. */
  readonly nestedPanelCode: string;
  /** The member code found at depth two (or deeper) that was excluded. */
  readonly offendingCode: string;
};

/** Result of expanding a fabricated order against a fabricated panel catalogue. */
export type OrderPanelExpansion = {
  /** De-duplicated analyte codes, in first-seen order across the whole order. */
  readonly analyteCodes: readonly string[];
  /** Order-line or panel-member codes that could not be resolved. De-duplicated by code and kind. */
  readonly unknownCodes: readonly OrderPanelUnknownCode[];
  /** Panel members nested beyond one level. De-duplicated by panel, nested panel, and offending code. */
  readonly nestingViolations: readonly OrderPanelNestingViolation[];
};

export type OrderPanelErrorCode =
  | 'catalogue-panel-code-missing'
  | 'catalogue-member-code-missing'
  | 'catalogue-unknown-panel-reference'
  | 'catalogue-cycle-detected'
  | 'known-analyte-code-missing'
  | 'order-line-code-missing';

const ERROR_MESSAGES: Record<OrderPanelErrorCode, string> = {
  'catalogue-panel-code-missing': 'A declared panel catalogue entry has an empty panel code.',
  'catalogue-member-code-missing': 'A declared panel catalogue member has an empty code.',
  'catalogue-unknown-panel-reference':
    'A catalogue member is tagged PANEL but references a panel code that is not declared in the catalogue.',
  'catalogue-cycle-detected': 'The catalogue panel reference graph contains a cycle.',
  'known-analyte-code-missing': 'The declared known-analyte code list contains an empty code.',
  'order-line-code-missing': 'An order line has an empty code.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainOrderPanelError(code: OrderPanelErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this evaluator cannot safely resolve to an order-panel expansion. */
export class OrderPanelError extends Error {
  readonly code: OrderPanelErrorCode;

  constructor(code: OrderPanelErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'OrderPanelError';
    this.code = code;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validate the structural integrity of a declared panel catalogue.
 *
 * Fail-closed: throws OrderPanelError on an empty panel or member code, on a
 * PANEL-kind member that references a panel code absent from the catalogue
 * ("unknown panels"), or on a cycle in the PANEL-kind reference graph.
 */
export function validateOrderPanelCatalogue(catalogue: OrderPanelCatalogue): void {
  const panelCodes = Object.keys(catalogue);

  for (const panelCode of panelCodes) {
    if (!isNonEmptyString(panelCode)) {
      throw new OrderPanelError('catalogue-panel-code-missing');
    }
    for (const member of catalogue[panelCode]) {
      if (!isNonEmptyString(member.code)) {
        throw new OrderPanelError('catalogue-member-code-missing');
      }
      if (member.kind === 'PANEL' && !(member.code in catalogue)) {
        throw new OrderPanelError('catalogue-unknown-panel-reference');
      }
    }
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(panelCodes.map((code) => [code, WHITE]));

  function visit(panelCode: string): void {
    color.set(panelCode, GRAY);
    for (const member of catalogue[panelCode]) {
      if (member.kind !== 'PANEL') {
        continue;
      }
      const state = color.get(member.code);
      if (state === GRAY) {
        throw new OrderPanelError('catalogue-cycle-detected');
      }
      if (state === WHITE) {
        visit(member.code);
      }
    }
    color.set(panelCode, BLACK);
  }

  for (const panelCode of panelCodes) {
    if (color.get(panelCode) === WHITE) {
      visit(panelCode);
    }
  }
}

/**
 * Expand a fabricated order against a fabricated, declared panel catalogue.
 *
 * Returns a de-duplicated analyte code list in first-seen order, plus a
 * report of unknown codes and nesting violations encountered along the way.
 *
 * Fail-closed: throws OrderPanelError when the catalogue itself fails
 * validateOrderPanelCatalogue (cycles, unknown panel references, or
 * structurally empty codes), when the known-analyte list contains an empty
 * code, or when an order line has an empty code.
 */
export function expandOrderPanels(
  catalogue: OrderPanelCatalogue,
  knownAnalyteCodes: readonly string[],
  order: readonly OrderLine[],
): OrderPanelExpansion {
  validateOrderPanelCatalogue(catalogue);

  for (const code of knownAnalyteCodes) {
    if (!isNonEmptyString(code)) {
      throw new OrderPanelError('known-analyte-code-missing');
    }
  }
  const knownAnalytes = new Set<string>(knownAnalyteCodes);

  for (const line of order) {
    if (!isNonEmptyString(line.code)) {
      throw new OrderPanelError('order-line-code-missing');
    }
  }

  const seenAnalytes = new Set<string>();
  const analyteCodes: string[] = [];

  const seenUnknown = new Set<string>();
  const unknownCodes: OrderPanelUnknownCode[] = [];
  function reportUnknown(code: string, kind: OrderPanelMemberKind): void {
    const key = `${kind}:${code}`;
    if (seenUnknown.has(key)) {
      return;
    }
    seenUnknown.add(key);
    unknownCodes.push({ code, kind });
  }

  const seenViolation = new Set<string>();
  const nestingViolations: OrderPanelNestingViolation[] = [];
  function reportViolation(panelCode: string, nestedPanelCode: string, offendingCode: string): void {
    const key = `${panelCode} ${nestedPanelCode} ${offendingCode}`;
    if (seenViolation.has(key)) {
      return;
    }
    seenViolation.add(key);
    nestingViolations.push({ panelCode, nestedPanelCode, offendingCode });
  }

  function addAnalyte(code: string): void {
    if (!knownAnalytes.has(code)) {
      reportUnknown(code, 'ANALYTE');
      return;
    }
    if (seenAnalytes.has(code)) {
      return;
    }
    seenAnalytes.add(code);
    analyteCodes.push(code);
  }

  function expandNestedPanel(topPanelCode: string, nestedPanelCode: string): void {
    for (const member of catalogue[nestedPanelCode]) {
      if (member.kind === 'PANEL') {
        reportViolation(topPanelCode, nestedPanelCode, member.code);
        continue;
      }
      addAnalyte(member.code);
    }
  }

  function expandTopPanel(panelCode: string): void {
    for (const member of catalogue[panelCode]) {
      if (member.kind === 'PANEL') {
        expandNestedPanel(panelCode, member.code);
        continue;
      }
      addAnalyte(member.code);
    }
  }

  for (const line of order) {
    if (line.kind === 'PANEL') {
      if (!(line.code in catalogue)) {
        reportUnknown(line.code, 'PANEL');
        continue;
      }
      expandTopPanel(line.code);
      continue;
    }

    addAnalyte(line.code);
  }

  return { analyteCodes, unknownCodes, nestingViolations };
}
