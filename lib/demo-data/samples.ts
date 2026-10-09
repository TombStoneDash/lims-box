export type SampleStatus = 'Registered' | 'Received' | 'Verified' | 'Published' | 'Pending Verification';
export type SampleType = 'Blood' | 'Urine' | 'Swab' | 'Tissue';

export interface Sample {
  id: string;
  type: SampleType;
  status: SampleStatus;
  clientName: string;
  dateRegistered: string;
  dateReceived: string | null;
  dateVerified: string | null;
  datePublished: string | null;
  collectedBy: string;
  receivedBy: string | null;
  analyst: string | null;
  priority: 'Routine' | 'STAT';
}

const sampleTypes: SampleType[] = ['Blood', 'Urine', 'Swab', 'Tissue'];
const statuses: SampleStatus[] = ['Registered', 'Received', 'Verified', 'Published'];
const staff = ['Sarah Chen', 'Mike Torres', 'Ana Patel', 'James Kim'];
const clients = [
  'Valley Medical Center', 'Summit Health Clinic', 'Desert Springs Hospital',
  'Cactus Family Practice', 'Sunrise Urgent Care', 'Mesa Community Health',
  'Ironwood Medical Group', 'Red Rock Diagnostics', 'Saguaro Health Partners',
  'Tombstone Regional Medical',
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateSamples(): Sample[] {
  const rand = seededRandom(20260413);
  const samples: Sample[] = [];

  for (let i = 1; i <= 847; i++) {
    const id = `SA-2026-${String(i).padStart(4, '0')}`;
    const type = sampleTypes[Math.floor(rand() * sampleTypes.length)];
    const client = clients[Math.floor(rand() * clients.length)];
    const collector = staff[Math.floor(rand() * staff.length)];
    const priority = rand() > 0.9 ? 'STAT' as const : 'Routine' as const;

    // Distribute dates across Jan 13 - Apr 13, 2026 (90 days)
    const dayOffset = Math.floor(rand() * 90);
    const baseDate = new Date(2026, 0, 13);
    baseDate.setDate(baseDate.getDate() + dayOffset);
    const dateRegistered = baseDate.toISOString().split('T')[0];

    let status: SampleStatus;
    let dateReceived: string | null = null;
    let dateVerified: string | null = null;
    let datePublished: string | null = null;
    let receivedBy: string | null = null;
    let analyst: string | null = null;

    // 3 specific samples in Pending Verification
    if (i === 845 || i === 846 || i === 847) {
      status = 'Pending Verification';
      receivedBy = staff[Math.floor(rand() * staff.length)];
      analyst = staff[Math.floor(rand() * staff.length)];
      const recvDate = new Date(baseDate);
      recvDate.setDate(recvDate.getDate() + Math.floor(rand() * 2));
      dateReceived = recvDate.toISOString().split('T')[0];
    } else {
      const r = rand();
      if (r < 0.05) {
        status = 'Registered';
      } else if (r < 0.12) {
        status = 'Received';
        receivedBy = staff[Math.floor(rand() * staff.length)];
        const recvDate = new Date(baseDate);
        recvDate.setDate(recvDate.getDate() + 1);
        dateReceived = recvDate.toISOString().split('T')[0];
      } else if (r < 0.25) {
        status = 'Verified';
        receivedBy = staff[Math.floor(rand() * staff.length)];
        analyst = staff[Math.floor(rand() * staff.length)];
        const recvDate = new Date(baseDate);
        recvDate.setDate(recvDate.getDate() + 1);
        dateReceived = recvDate.toISOString().split('T')[0];
        const verDate = new Date(recvDate);
        verDate.setDate(verDate.getDate() + Math.floor(rand() * 2) + 1);
        dateVerified = verDate.toISOString().split('T')[0];
      } else {
        status = 'Published';
        receivedBy = staff[Math.floor(rand() * staff.length)];
        analyst = staff[Math.floor(rand() * staff.length)];
        const recvDate = new Date(baseDate);
        recvDate.setDate(recvDate.getDate() + 1);
        dateReceived = recvDate.toISOString().split('T')[0];
        const verDate = new Date(recvDate);
        verDate.setDate(verDate.getDate() + Math.floor(rand() * 2) + 1);
        dateVerified = verDate.toISOString().split('T')[0];
        const pubDate = new Date(verDate);
        pubDate.setDate(pubDate.getDate() + 1);
        datePublished = pubDate.toISOString().split('T')[0];
      }
    }

    samples.push({
      id, type, status, clientName: client,
      dateRegistered, dateReceived, dateVerified, datePublished,
      collectedBy: collector, receivedBy, analyst, priority,
    });
  }

  return samples;
}

export const samples = generateSamples();

export const sampleCounts = {
  total: samples.length,
  byStatus: {
    Registered: samples.filter(s => s.status === 'Registered').length,
    Received: samples.filter(s => s.status === 'Received').length,
    Verified: samples.filter(s => s.status === 'Verified').length,
    Published: samples.filter(s => s.status === 'Published').length,
    'Pending Verification': samples.filter(s => s.status === 'Pending Verification').length,
  },
  byType: {
    Blood: samples.filter(s => s.type === 'Blood').length,
    Urine: samples.filter(s => s.type === 'Urine').length,
    Swab: samples.filter(s => s.type === 'Swab').length,
    Tissue: samples.filter(s => s.type === 'Tissue').length,
  },
};

// Featured sample for demo
export const featuredSample: Sample = {
  id: 'SA-2026-0847',
  type: 'Blood',
  status: 'Pending Verification',
  clientName: 'Tombstone Regional Medical',
  dateRegistered: '2026-04-11',
  dateReceived: '2026-04-11',
  dateVerified: null,
  datePublished: null,
  collectedBy: 'Ana Patel',
  receivedBy: 'Mike Torres',
  analyst: 'James Kim',
  priority: 'Routine',
};
