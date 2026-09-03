import type { Metadata } from "next";
import { GuestSession } from "@/components/GuestSession";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `Send a song · yt mixer`,
    description: "Pick a song for the party.",
  };
}

export default async function SessionPage({ params }: Props) {
  const { code } = await params;
  return <GuestSession code={code.toUpperCase()} />;
}
