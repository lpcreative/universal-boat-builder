import Link from "next/link";

export default function HomePage(): JSX.Element {
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-10 md:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Universal Boat Builder</h1>
      <p className="text-sm text-slate-700">Minimal v0 configurator screen.</p>
      <p>
        <Link
          href="/configurator"
          className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Open configurator
        </Link>
      </p>
    </main>
  );
}
