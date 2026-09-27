import { createFileRoute } from "@tanstack/react-router";
import { Slipstream } from "@/components/starfield/Slipstream";

export const Route = createFileRoute("/")({
  component: Slipstream,
});
