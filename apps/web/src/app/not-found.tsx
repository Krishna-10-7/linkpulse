import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-md p-8">
        <div className="label">404</div>
        <h1 className="mt-2 text-3xl font-semibold">This page does not exist.</h1>
        <Link href="/" className="mt-4 inline-block font-mono text-sm font-bold underline underline-offset-4">Back to the dashboard</Link>
      </div>
    </main>
  );
}
