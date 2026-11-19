import { config } from "@/lib/config";

export default function Home() {
  return (
    <main>
      <h1>{config.app.name}</h1>
      <p>{config.app.tagline}</p>
    </main>
  );
}
