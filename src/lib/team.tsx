import { useQuery } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";
import { useState } from "react";

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
  const [failed, setFailed] = useState<string | null>(null);
  if (!team.logoUrl || failed === team.logoUrl)
    return <Clapperboard className="size-5" aria-hidden />;
  return (
    <img
      src={team.logoUrl}
      alt=""
      onError={() => setFailed(team.logoUrl)}
      className="size-5 rounded-sm object-contain"
    />
  );
}
