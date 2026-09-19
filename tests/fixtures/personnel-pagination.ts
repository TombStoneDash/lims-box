// Fictional, uniquely named personnel. Seventy rows exceed the index's first
// page capacity, exercising both explicit row breaks and PDFKit text flow.
export const personnelPaginationFixture = Array.from({ length: 70 }, (_, index) => {
  const number = String(index + 1).padStart(3, "0");
  return {
    id: `pagination-person-${number}`,
    name: `Fixture Person ${number}`,
    role: "Technologist",
    active: true,
    cliaCertNumber: null,
    hireDate: new Date("2026-01-01T12:00:00Z"),
    competencies: [],
    trainings: [],
    signOffs: [],
    authorizations: [],
  };
});
