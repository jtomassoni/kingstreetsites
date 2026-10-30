"use client";

import { useState, useTransition } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  addHouseholdMember,
  removeHouseholdMember,
  updateHouseholdMember,
} from "@meals/actions/household";
import { Button } from "@meals/components/ui/button";
import { Input } from "@meals/components/ui/input";
import { Label } from "@meals/components/ui/label";
import { cn } from "@meals/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@meals/components/ui/dialog";

type MemberRow = {
  userId: string;
  displayName: string | null;
  email: string | null;
  isSelf: boolean;
};

function memberInitials(member: MemberRow) {
  const name = member.displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const local = member.email?.split("@")[0] ?? "U";
  return local.slice(0, 2).toUpperCase();
}

export function HouseholdManager({
  members,
  className,
}: {
  members: MemberRow[];
  className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">Members</h2>
        <AddMemberDialog />
      </div>

      <ul className="divide-y divide-border/80">
        {members.map((m) => (
          <MemberCard key={m.userId} member={m} />
        ))}
      </ul>
    </section>
  );
}

function MemberCard({ member }: { member: MemberRow }) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(member.displayName ?? "");
  const [pending, start] = useTransition();
  const label = member.displayName || member.email || "Member";

  return (
    <li className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold tracking-wide text-primary">
        {memberInitials(member)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">
          {label}
          {member.isSelf ? (
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              you
            </span>
          ) : null}
        </p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="size-8 min-h-8 shrink-0 px-0"
            aria-label={`Edit ${label}`}
          >
            <Pencil className="size-3.5" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit member</DialogTitle>
            <DialogDescription>{member.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Display name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="min-h-11"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {!member.isSelf ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={pending}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Remove ${label} from this household?`,
                    )
                  ) {
                    return;
                  }
                  start(async () => {
                    const r = await removeHouseholdMember(member.userId);
                    if (r.error) toast.error(r.error);
                    else {
                      toast.success("Member removed");
                      setOpen(false);
                    }
                  });
                }}
              >
                Remove
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await updateHouseholdMember({
                    userId: member.userId,
                    displayName,
                  });
                  if (r.error) toast.error(r.error);
                  else {
                    toast.success("Member updated");
                    setOpen(false);
                  }
                })
              }
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setEmail("");
          setDisplayName("");
          setPassword("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 min-h-7 gap-1 px-2 text-xs"
        >
          <UserPlus className="size-3.5" />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add household member</DialogTitle>
          <DialogDescription>
            Creates a login if needed and adds them to this household. Share the
            email and password with them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-11"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label>Display name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Mary"
              className="min-h-11"
            />
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Required for new accounts (min 8 characters). Leave blank if they
              already have a login.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={
              pending ||
              !email.trim() ||
              (password.length > 0 && password.length < 8)
            }
            onClick={() =>
              start(async () => {
                const r = await addHouseholdMember({
                  email,
                  displayName,
                  password,
                });
                if (r.error) toast.error(r.error);
                else {
                  toast.success(r.message ?? "Member added");
                  setOpen(false);
                }
              })
            }
          >
            {pending ? "Adding…" : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
