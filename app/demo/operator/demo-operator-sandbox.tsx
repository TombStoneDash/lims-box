"use client";

import { useReducer } from "react";
import {
  createDemoOperatorBaseline,
  demoOperatorReducer,
  type DemoPerson,
} from "@/lib/demo-operator-state";

function PersonCard({
  person,
  dispatch,
}: {
  person: DemoPerson;
  dispatch: React.Dispatch<Parameters<typeof demoOperatorReducer>[1]>;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{person.name}</h2>
          <p className="text-sm text-slate-600">{person.role}</p>
        </div>
        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
          FICTIONAL PERSON
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="rounded-lg bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Competency</p>
          <p className="mt-1 font-medium text-slate-900">{person.competency.title}</p>
          <p className="mt-1 text-sm text-slate-600">
            Status: <strong>{person.competency.status}</strong> · Reviews: {person.competency.reviewCount}
          </p>
          <button
            type="button"
            className="mt-4 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={person.competency.status === "current"}
            onClick={() =>
              dispatch({
                type: "record_competency_review",
                personId: person.id,
                competencyId: person.competency.id,
              })
            }
          >
            Record synthetic review
          </button>
        </section>

        <section className="rounded-lg bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Authorisation</p>
          <p className="mt-1 font-medium text-slate-900">{person.authorization.procedure}</p>
          <p className="mt-1 text-sm text-slate-600">
            State: <strong>{person.authorization.active ? "active" : "not active"}</strong>
          </p>
          <button
            type="button"
            className="mt-4 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
            onClick={() =>
              dispatch({
                type: "set_authorization",
                personId: person.id,
                authorizationId: person.authorization.id,
                active: !person.authorization.active,
              })
            }
          >
            {person.authorization.active ? "Revoke synthetic authorisation" : "Grant synthetic authorisation"}
          </button>
        </section>
      </div>
    </article>
  );
}
export default function DemoOperatorSandbox() {
  const [state, dispatch] = useReducer(
    demoOperatorReducer,
    undefined,
    createDemoOperatorBaseline,
  );

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-5">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-amber-900">
            Synthetic · Non-production · Browser-local · Resettable
          </p>
          <p className="mt-2 text-sm leading-6 text-amber-950">
            This protected sandbox never calls a database or customer-data API. Changes exist only in this browser tab and are discarded on reload or reset.
          </p>
        </div>

        <div className="my-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Supervised demo operator</h1>
            <p className="mt-2 text-slate-600">Dataset: {state.datasetId}</p>
          </div>
          <button
            type="button"
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => dispatch({ type: "reset" })}
          >
            Reset synthetic baseline
          </button>
        </div>

        <div className="space-y-5">
          {state.people.map((person) => (
            <PersonCard key={person.id} person={person} dispatch={dispatch} />
          ))}
        </div>
      </div>
    </main>
  );
}
