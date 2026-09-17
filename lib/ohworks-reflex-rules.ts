/**
 * Fail-closed synthetic reflex test planner for OHWorks/SENAITE-shaped
 * analyte results.
 *
 * This module is a pure, dependency-free evaluator: given a declared panel
 * of known analytes, a set of reflex rules (a trigger analyte, a comparison,
 * a threshold, an ordered list of reflex analytes to add, and the maximum
 * reflex depth that rule may fire at), and a set of fabricated results
 * already on hand, it computes the ordered list of additional reflex tests
 * to add and which rule caused each addition. It performs no I/O, touches no
 * real instrument or customer data, and never silently expands a rule
 * configuration it cannot safely interpret: a cycle among the declared
 * rules, a reference to an analyte outside the declared panel, or a rule
 * positioned deeper in the declared reflex graph than its own declared
 * maximum depth all block the whole plan (status 'blocked') rather than
 * returning a partial or guessed-at result. Depth, like cycle detection, is
 * validated structurally from the rule graph itself, independent of which
 * specific results are supplied.
 */

export type ReflexComparison = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

const KNOWN_COMPARISONS: ReadonlySet<string> = new Set<string>(['gt', 'gte', 'lt', 'lte', 'eq']);

export type ReflexRule = {
  /** Declared unique identifier for this rule. */
  id: string;
  triggerAnalyte: string;
  comparison: ReflexComparison;
  threshold: number;
  /** Ordered list of analytes this rule adds when it fires. Must be non-empty. */
  reflexAnalytes: string[];
  /**
   * Maximum reflex depth this rule is declared to operate at, where an
   * analyte that is never itself a reflex target of any rule sits at depth
   * 0 (1 = this rule's trigger analyte is a depth-0 base analyte). Computed
   * structurally from the declared rule graph, independent of any specific
   * result values.
   */
  maxReflexDepth: number;
};

export type ReflexResultInput = {
  analyte: string;
  value: number;
};

export type ReflexPlanInput = {
  /** Declared valid analyte panel. Any analyte referenced outside this set is unknown and fails closed. */
  knownAnalytes: string[];
  rules: ReflexRule[];
  results: ReflexResultInput[];
};

export type ReflexRejectionCode =
  | 'rule-id-invalid'
  | 'rule-id-duplicate'
  | 'trigger-analyte-unknown'
  | 'reflex-analytes-empty'
  | 'reflex-analyte-unknown'
  | 'comparison-invalid'
  | 'threshold-non-finite'
  | 'max-reflex-depth-invalid'
  | 'result-analyte-unknown'
  | 'result-analyte-duplicate'
  | 'result-value-non-finite'
  | 'rule-cycle-detected'
  | 'reflex-depth-exceeded';

export type ReflexRejection = {
  code: ReflexRejectionCode;
  ruleId?: string;
  analyte?: string;
};

export type ReflexAddition = {
  analyte: string;
  /** The rule whose firing caused this analyte to be added. */
  ruleId: string;
  /** This analyte's structural reflex depth (1 = reflexed directly off a depth-0 base analyte). */
  depth: number;
};

export type ReflexPlan =
  | { status: 'ok'; additions: ReflexAddition[] }
  | { status: 'blocked'; rejections: ReflexRejection[] };

function compareRejections(a: ReflexRejection, b: ReflexRejection): number {
  if (a.code !== b.code) {
    return a.code < b.code ? -1 : 1;
  }
  const aRule = a.ruleId ?? '';
  const bRule = b.ruleId ?? '';
  if (aRule !== bRule) {
    return aRule < bRule ? -1 : 1;
  }
  const aAnalyte = a.analyte ?? '';
  const bAnalyte = b.analyte ?? '';
  if (aAnalyte !== bAnalyte) {
    return aAnalyte < bAnalyte ? -1 : 1;
  }
  return 0;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function compare(value: number, comparison: ReflexComparison, threshold: number): boolean {
  switch (comparison) {
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
    case 'lt':
      return value < threshold;
    case 'lte':
      return value <= threshold;
    case 'eq':
      return value === threshold;
  }
}

/**
 * Detect every rule that participates in a cycle of the declared
 * trigger-analyte -> reflex-analyte graph, regardless of whether current
 * results would actually make that cycle fire. A cycle is a standing
 * misconfiguration risk (it could infinite-loop for other data), so it is
 * reported even when the supplied results never reach it.
 */
function detectCycleRuleIds(rules: ReflexRule[]): Set<string> {
  const edges = new Map<string, Array<{ to: string; ruleId: string }>>();
  for (const rule of rules) {
    const list = edges.get(rule.triggerAnalyte) ?? [];
    for (const reflexAnalyte of rule.reflexAnalytes) {
      list.push({ to: reflexAnalyte, ruleId: rule.id });
    }
    edges.set(rule.triggerAnalyte, list);
  }

  const cycleRuleIds = new Set<string>();
  const visited = new Set<string>();
  const onStackAnalytes: string[] = [];
  const onStackRuleIds: string[] = [];
  const onStackSet = new Set<string>();

  function visit(analyte: string): void {
    if (onStackSet.has(analyte)) {
      const startIndex = onStackAnalytes.indexOf(analyte);
      for (let i = startIndex; i < onStackRuleIds.length; i++) {
        cycleRuleIds.add(onStackRuleIds[i]);
      }
      return;
    }
    if (visited.has(analyte)) {
      return;
    }
    visited.add(analyte);
    onStackAnalytes.push(analyte);
    onStackSet.add(analyte);
    for (const edge of edges.get(analyte) ?? []) {
      onStackRuleIds.push(edge.ruleId);
      visit(edge.to);
      onStackRuleIds.pop();
    }
    onStackAnalytes.pop();
    onStackSet.delete(analyte);
  }

  for (const analyte of edges.keys()) {
    visit(analyte);
  }

  return cycleRuleIds;
}

/**
 * Compute each analyte's structural reflex depth from the declared,
 * cycle-free rule graph: an analyte that is never a reflex target of any
 * rule sits at depth 0; any other analyte sits one deeper than the deepest
 * analyte that reflexes into it. Well-defined only once the graph has
 * already been confirmed acyclic.
 */
function computeGraphDepths(rules: ReflexRule[]): Map<string, number> {
  const incoming = new Map<string, string[]>();
  const allAnalytes = new Set<string>();
  for (const rule of rules) {
    allAnalytes.add(rule.triggerAnalyte);
    for (const reflexAnalyte of rule.reflexAnalytes) {
      allAnalytes.add(reflexAnalyte);
      const sources = incoming.get(reflexAnalyte) ?? [];
      sources.push(rule.triggerAnalyte);
      incoming.set(reflexAnalyte, sources);
    }
  }

  const depths = new Map<string, number>();
  function depthOf(analyte: string): number {
    const cached = depths.get(analyte);
    if (cached !== undefined) {
      return cached;
    }
    const sources = incoming.get(analyte);
    if (!sources || sources.length === 0) {
      depths.set(analyte, 0);
      return 0;
    }
    let maxSourceDepth = 0;
    for (const source of sources) {
      maxSourceDepth = Math.max(maxSourceDepth, depthOf(source));
    }
    const depth = maxSourceDepth + 1;
    depths.set(analyte, depth);
    return depth;
  }

  for (const analyte of allAnalytes) {
    depthOf(analyte);
  }
  return depths;
}

/**
 * Compute the ordered list of reflex tests to add for a fabricated result
 * set, given a declared rule set and analyte panel.
 *
 * Fail-closed: an invalid or duplicate rule id, a trigger/reflex reference
 * to an analyte outside the declared panel, an empty reflex-analyte list,
 * an unrecognized comparison, a non-finite threshold, an invalid maximum
 * reflex depth, a duplicate or unknown result analyte, a non-finite result
 * value, a cycle among the declared rules, or a rule whose trigger analyte
 * sits deeper in the declared reflex graph than that rule's own declared
 * maximum depth allows all block the whole plan rather than returning a
 * partial or guessed-at result.
 */
export function planReflexTests(input: ReflexPlanInput): ReflexPlan {
  const rejections: ReflexRejection[] = [];
  const reject = (code: ReflexRejectionCode, extra?: { ruleId?: string; analyte?: string }) =>
    rejections.push({ code, ...extra });

  const knownAnalytes = new Set(input.knownAnalytes);

  const seenRuleIds = new Set<string>();
  for (const rule of input.rules) {
    if (!isNonBlankString(rule.id)) {
      reject('rule-id-invalid', { ruleId: rule.id });
    } else if (seenRuleIds.has(rule.id)) {
      reject('rule-id-duplicate', { ruleId: rule.id });
    } else {
      seenRuleIds.add(rule.id);
    }

    if (!isNonBlankString(rule.triggerAnalyte) || !knownAnalytes.has(rule.triggerAnalyte)) {
      reject('trigger-analyte-unknown', { ruleId: rule.id, analyte: rule.triggerAnalyte });
    }

    if (!Array.isArray(rule.reflexAnalytes) || rule.reflexAnalytes.length === 0) {
      reject('reflex-analytes-empty', { ruleId: rule.id });
    } else {
      for (const reflexAnalyte of rule.reflexAnalytes) {
        if (!isNonBlankString(reflexAnalyte) || !knownAnalytes.has(reflexAnalyte)) {
          reject('reflex-analyte-unknown', { ruleId: rule.id, analyte: reflexAnalyte });
        }
      }
    }

    if (!KNOWN_COMPARISONS.has(rule.comparison)) {
      reject('comparison-invalid', { ruleId: rule.id });
    }

    if (!isFiniteNumber(rule.threshold)) {
      reject('threshold-non-finite', { ruleId: rule.id });
    }

    if (!isPositiveInteger(rule.maxReflexDepth)) {
      reject('max-reflex-depth-invalid', { ruleId: rule.id });
    }
  }

  const seenResultAnalytes = new Set<string>();
  for (const result of input.results) {
    if (!isNonBlankString(result.analyte) || !knownAnalytes.has(result.analyte)) {
      reject('result-analyte-unknown', { analyte: result.analyte });
    } else if (seenResultAnalytes.has(result.analyte)) {
      reject('result-analyte-duplicate', { analyte: result.analyte });
    } else {
      seenResultAnalytes.add(result.analyte);
    }

    if (!isFiniteNumber(result.value)) {
      reject('result-value-non-finite', { analyte: result.analyte });
    }
  }

  if (rejections.length > 0) {
    rejections.sort(compareRejections);
    return { status: 'blocked', rejections };
  }

  const cycleRuleIds = detectCycleRuleIds(input.rules);
  if (cycleRuleIds.size > 0) {
    const cycleRejections = [...cycleRuleIds].map((ruleId) => ({
      code: 'rule-cycle-detected' as const,
      ruleId,
    }));
    cycleRejections.sort(compareRejections);
    return { status: 'blocked', rejections: cycleRejections };
  }

  const graphDepths = computeGraphDepths(input.rules);
  const depthRejections: ReflexRejection[] = [];
  for (const rule of input.rules) {
    const firingDepth = (graphDepths.get(rule.triggerAnalyte) ?? 0) + 1;
    if (firingDepth > rule.maxReflexDepth) {
      depthRejections.push({ code: 'reflex-depth-exceeded', ruleId: rule.id, analyte: rule.triggerAnalyte });
    }
  }
  if (depthRejections.length > 0) {
    depthRejections.sort(compareRejections);
    return { status: 'blocked', rejections: depthRejections };
  }

  const present = new Map(input.results.map((result) => [result.analyte, result.value]));
  const staged = new Set<string>();
  const additions: ReflexAddition[] = [];

  for (const result of input.results) {
    for (const rule of input.rules) {
      if (rule.triggerAnalyte !== result.analyte) {
        continue;
      }
      if (!compare(result.value, rule.comparison, rule.threshold)) {
        continue;
      }
      for (const reflexAnalyte of rule.reflexAnalytes) {
        if (present.has(reflexAnalyte) || staged.has(reflexAnalyte)) {
          continue;
        }
        staged.add(reflexAnalyte);
        additions.push({ analyte: reflexAnalyte, ruleId: rule.id, depth: graphDepths.get(reflexAnalyte) ?? 1 });
      }
    }
  }

  return { status: 'ok', additions };
}
