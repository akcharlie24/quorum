import type { Metadata } from "next";

import { BugleIndex } from "@/components/bugle-index";

export const metadata: Metadata = { title: "The Daily Bugle" };

export default function BuglePage() {
  return <BugleIndex />;
}
