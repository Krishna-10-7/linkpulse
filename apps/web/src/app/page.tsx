'use client';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { PageHeader, Button } from '@/components/ui';

export default function Home() {
  return (
    <AppShell>
      <PageHeader title={<>Your <span className="hl">links</span>, with a pulse.</>} sub="Create a short link to get started." actions={<Link href="/links/new/"><Button>New link</Button></Link>} />
    </AppShell>
  );
}
