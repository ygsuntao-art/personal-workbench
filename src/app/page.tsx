"use client";

import dynamic from "next/dynamic";

const Workbench = dynamic(() => import("@/components/workbench").then((module) => module.Workbench), {
  ssr: false,
});

export default function Home() {
  return <Workbench />;
}
