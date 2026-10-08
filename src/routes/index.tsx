import { createFileRoute } from "@tanstack/react-router";
import { Starward } from "@/components/starfield/Starward";

export const Route = createFileRoute("/")({
  component: Starward,
});
