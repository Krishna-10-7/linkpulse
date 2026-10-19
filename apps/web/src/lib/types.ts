export type Rule = { id?: string; type: 'device' | 'os' | 'country'; value: string; destination: string; priority?: number };

export type LinkItem = {
  id: string;
  code: string;
  destination: string;
  title: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DISABLED';
  startsAt: string | null;
  expiresAt: string | null;
  clickLimit: number | null;
  clickCount: number;
  hasPassword: boolean;
  flagged: boolean;
  disabledReason: string | null;
  healthStatus: number | null;
  createdAt: string;
  shortUrl: string;
  previewUrl: string;
  qrUrl: string;
  campaign: { id: string; name: string } | null;
  folder: { id: string; name: string } | null;
  tags: { id: string; name: string; color: string }[];
  rules: Rule[];
  owner?: { id: string; name: string; email: string };
  openReports?: number;
};
