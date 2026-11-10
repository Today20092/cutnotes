import { useQuery } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";

export type Team = { name: string; logoUrl: string };

export function useTeam() {
  return useQuery({
    queryKey: ["team"],
    queryFn: async (): Promise<Team> => {
      const response = await fetch("/api/team");
      if (!response.ok) throw new Error("Could not load the Team");
      return response.json();
    },
    staleTime: Infinity,
  });
}

export function TeamLogo({ team }: { team: Team }) {
  if (!team.logoUrl) return <Clapperboard className="size-5" aria-hidden />;
  return <img src={team.logoUrl} alt="" className="size-5 rounded-sm object-contain" />;
}
