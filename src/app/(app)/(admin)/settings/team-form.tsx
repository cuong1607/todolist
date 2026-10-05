"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTeamSettings, type SettingsFormState } from "./actions";

export function TeamForm({ teamName }: { teamName: string }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(updateTeamSettings, {});

  useEffect(() => {
    if (state.ok) toast.success("Đã lưu tên team");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="team_name">Tên team</Label>
        <Input id="team_name" name="team_name" defaultValue={teamName} required maxLength={40} className="h-11 text-base" />
      </div>
      <Button type="submit" size="lg" disabled={pending} className="h-11 w-full sm:w-auto sm:px-6">
        {pending && <Loader2 className="animate-spin" />}
        Lưu
      </Button>
    </form>
  );
}
