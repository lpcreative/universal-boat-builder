import Link from "next/link";

export default function HomePage(): JSX.Element {
  return (
    <main>
      <h1>Universal Boat Builder</h1>
      <p>Minimal v0 configurator screen.</p>
      <p>
        <Link href="/configurator">Open configurator</Link>
      </p>
    </main>
  );
}
