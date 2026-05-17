"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function optStr(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s.length ? s : null;
}
function reqDate(v: FormDataEntryValue | null, field: string): Date {
  const s = str(v);
  if (!s) throw new Error(`${field} required`);
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error(`${field} invalid date`);
  return d;
}
function optDate(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function optFloat(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export async function createPerson(formData: FormData) {
  const person = await prisma.person.create({
    data: {
      name: str(formData.get("name")),
      role: str(formData.get("role")),
      cliaCertNumber: optStr(formData.get("cliaCertNumber")),
      hireDate: reqDate(formData.get("hireDate"), "hireDate"),
      active: str(formData.get("active")) === "on" || str(formData.get("active")) === "true",
    },
  });
  revalidatePath("/admin");
  revalidatePath("/admin/people");
  redirect(`/admin/people/${person.id}`);
}

export async function updatePerson(id: string, formData: FormData) {
  await prisma.person.update({
    where: { id },
    data: {
      name: str(formData.get("name")),
      role: str(formData.get("role")),
      cliaCertNumber: optStr(formData.get("cliaCertNumber")),
      hireDate: reqDate(formData.get("hireDate"), "hireDate"),
      active: str(formData.get("active")) === "on" || str(formData.get("active")) === "true",
    },
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/people/${id}`);
  redirect(`/admin/people/${id}`);
}

export async function createCompetency(formData: FormData) {
  const personId = str(formData.get("personId"));
  await prisma.competency.create({
    data: {
      personId,
      type: str(formData.get("type")),
      status: str(formData.get("status")) || "due",
      completedAt: optDate(formData.get("completedAt")),
      expiresAt: optDate(formData.get("expiresAt")),
      notes: optStr(formData.get("notes")),
    },
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/people/${personId}`);
  redirect(`/admin/people/${personId}`);
}

export async function createTraining(formData: FormData) {
  const personId = str(formData.get("personId"));
  // File upload handled by separate route handler; here we accept text-only training log.
  // certificate path is stored as a string reference (manual upload to ./uploads/ for v1).
  await prisma.training.create({
    data: {
      personId,
      course: str(formData.get("course")),
      provider: optStr(formData.get("provider")),
      completedAt: reqDate(formData.get("completedAt"), "completedAt"),
      hours: optFloat(formData.get("hours")),
      certificate: optStr(formData.get("certificate")),
    },
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/people/${personId}`);
  redirect(`/admin/people/${personId}`);
}

export async function createSignOff(formData: FormData) {
  const personId = str(formData.get("personId"));
  await prisma.signOff.create({
    data: {
      personId,
      directorName: str(formData.get("directorName")),
      signedAt: reqDate(formData.get("signedAt"), "signedAt"),
      scope: str(formData.get("scope")),
      notes: optStr(formData.get("notes")),
    },
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/people/${personId}`);
  redirect(`/admin/people/${personId}`);
}
