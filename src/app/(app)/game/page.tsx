import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { GameHub } from "./game-hub";

export const metadata: Metadata = { title: "Giải lao" };

/** Hidden break screen: not in the nav, reached only by typing the address. */
export default async function GamePage() {
  await requireUser();

  return (
    <>
      <PageHeader title="Giải lao" description="Vài game nhỏ để nghỉ tay một chút." />
      <GameHub />
    </>
  );
}
