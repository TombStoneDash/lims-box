export const DEMO_DATASET_ID = "lims-box-synthetic-operator-v1" as const;
export const DEMO_REVIEWED_AT = "2026-08-28T12:00:00.000Z" as const;

export type DemoCompetency = {
  id: string;
  title: string;
  status: "due" | "current";
  reviewCount: number;
  lastReviewedAt: string | null;
};

export type DemoAuthorization = {
  id: string;
  procedure: string;
  active: boolean;
};

export type DemoPerson = {
  id: string;
  name: string;
  role: string;
  competency: DemoCompetency;
  authorization: DemoAuthorization;
};

export type DemoOperatorState = {
  datasetId: typeof DEMO_DATASET_ID;
  people: DemoPerson[];
};

export type DemoOperatorAction =
  | { type: "record_competency_review"; personId: string; competencyId: string }
  | { type: "set_authorization"; personId: string; authorizationId: string; active: boolean }
  | { type: "reset" };

const BASELINE: DemoOperatorState = {
  datasetId: DEMO_DATASET_ID,
  people: [
    {
      id: "demo-person-alice",
      name: "Alice Morgan",
      role: "Synthetic Clinical Practitioner",
      competency: {
        id: "demo-competency-immunisation",
        title: "Synthetic immunisation procedure review",
        status: "due",
        reviewCount: 0,
        lastReviewedAt: null,
      },
      authorization: {
        id: "demo-authorization-immunisation",
        procedure: "Synthetic immunisation workflow",
        active: false,
      },
    },
    {
      id: "demo-person-ben",
      name: "Ben Carter",
      role: "Synthetic POCT Operator",
      competency: {
        id: "demo-competency-poct",
        title: "Synthetic POCT competency review",
        status: "current",
        reviewCount: 1,
        lastReviewedAt: "2026-07-01T09:00:00.000Z",
      },
      authorization: {
        id: "demo-authorization-poct",
        procedure: "Synthetic POCT procedure",
        active: true,
      },
    },
  ],
};

export function createDemoOperatorBaseline(): DemoOperatorState {
  return structuredClone(BASELINE);
}
export function isSyntheticDemoState(state: DemoOperatorState): boolean {
  return (
    state.datasetId === DEMO_DATASET_ID &&
    state.people.length > 0 &&
    state.people.every(
      (person) =>
        person.id.startsWith("demo-") &&
        person.competency.id.startsWith("demo-") &&
        person.authorization.id.startsWith("demo-"),
    )
  );
}

export function demoOperatorReducer(
  state: DemoOperatorState,
  action: DemoOperatorAction,
): DemoOperatorState {
  if (!isSyntheticDemoState(state)) return createDemoOperatorBaseline();
  if (action.type === "reset") return createDemoOperatorBaseline();

  const target = state.people.find((person) => person.id === action.personId);
  if (!target) return state;

  if (action.type === "record_competency_review") {
    if (target.competency.id !== action.competencyId) return state;
    return {
      ...state,
      people: state.people.map((person) =>
        person.id === action.personId
          ? {
              ...person,
              competency: {
                ...person.competency,
                status: "current",
                reviewCount: person.competency.reviewCount + 1,
                lastReviewedAt: DEMO_REVIEWED_AT,
              },
            }
          : person,
      ),
    };
  }

  if (target.authorization.id !== action.authorizationId) return state;
  return {
    ...state,
    people: state.people.map((person) =>
      person.id === action.personId
        ? {
            ...person,
            authorization: { ...person.authorization, active: action.active },
          }
        : person,
    ),
  };
}
