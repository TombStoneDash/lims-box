import { PersonnelPackDocumentKind } from "@prisma/client";
import {
  calculateNextReviewDue,
  createDocumentVersion,
  grantAuthorization,
  revokeAuthorization,
} from "@/lib/personnel-pack-v15/service";

describe("personnel pack v1.5 service", () => {
  test("calculates six-month and annual review due dates", () => {
    const reviewedAt = new Date("2026-01-15T00:00:00.000Z");

    expect(calculateNextReviewDue("six_month", reviewedAt)?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(calculateNextReviewDue("annual", reviewedAt)?.toISOString()).toBe("2027-01-15T00:00:00.000Z");
    expect(calculateNextReviewDue("ad_hoc", reviewedAt)).toBeNull();
  });

  test("new document version supersedes the prior current version", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({ id: "version_2" });
    const tx = {
      personnelPackDocument: {
        findUnique: jest.fn().mockResolvedValue({ id: "doc_1" }),
      },
      personnelPackDocumentVersion: {
        updateMany,
        create,
      },
    };
    const prisma = {
      $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
    };
    const effectiveDate = new Date("2026-06-01T00:00:00.000Z");

    await createDocumentVersion(prisma as never, {
      documentId: "doc_1",
      versionNumber: "1.2",
      effectiveDate,
      revisionSummary: "Updated maintenance verification steps.",
      approvedBy: "Dr. Robert Kim, MD",
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { documentId: "doc_1", supersededDate: null },
      data: { supersededDate: effectiveDate },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentId: "doc_1",
          versionNumber: "1.2",
          revisionSummary: "Updated maintenance verification steps.",
        }),
      }),
    );
  });

  test("grantAuthorization blocks duplicate active authorizations", async () => {
    const tx = {
      personnelPackDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: "proc_1",
          kind: PersonnelPackDocumentKind.procedure,
        }),
      },
      personnelPackAuthorization: {
        findFirst: jest.fn().mockResolvedValue({ id: "auth_1" }),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    };

    await expect(
      grantAuthorization(prisma as never, {
        personId: "person_1",
        documentId: "proc_1",
        authorizedAt: new Date("2026-05-27T00:00:00.000Z"),
        authorizedBy: "Carla Nguyen",
      }),
    ).rejects.toThrow("active authorization already exists");
  });

  test("revokeAuthorization writes revocation metadata", async () => {
    const update = jest.fn().mockResolvedValue({ id: "auth_1" });
    const prisma = {
      personnelPackAuthorization: {
        findUnique: jest.fn().mockResolvedValue({
          id: "auth_1",
          revokedAt: null,
        }),
        update,
      },
    };

    await revokeAuthorization(prisma as never, {
      authorizationId: "auth_1",
      revokedAt: new Date("2026-05-27T00:00:00.000Z"),
      revokedBy: "Carla Nguyen",
      revocationReason: "Corrective action pending retraining.",
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "auth_1" },
      data: {
        revokedAt: new Date("2026-05-27T00:00:00.000Z"),
        revokedBy: "Carla Nguyen",
        revocationReason: "Corrective action pending retraining.",
      },
    });
  });
});
