"use client";

import { BookOpen, Circle, CircleDot, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface SampleGroup {
  id: string;
  name: string;
  timestamp: string;
  samples: any[];
}

export function AppSidebar() {
  const [groups, setGroups] = useState<SampleGroup[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string>("");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      const response = await fetch("/api/sample-groups");
      if (response.ok) {
        const data = await response.json();
        setGroups(data.groups || []);
        setCurrentGroupId(data.currentGroupId || "");
      }
    } catch (error) {
      console.error("Failed to load groups:", error);
    }
  };

  const handleGroupChange = async (groupId: string) => {
    try {
      const response = await fetch("/api/sample-groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentGroupId: groupId }),
      });

      if (response.ok) {
        setCurrentGroupId(groupId);
        // Reload the page to refresh all prompt-dependent data
        window.location.reload();
      } else {
        toast.error("Failed to change prompt");
      }
    } catch (error) {
      console.error("Failed to change prompt:", error);
      toast.error("Failed to change prompt");
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Please enter a prompt name");
      return;
    }

    try {
      const response = await fetch("/api/sample-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });

      if (response.ok) {
        toast.success("Prompt created successfully");
        setNewGroupName("");
        setIsCreatingGroup(false);
        await loadGroups();
        // The API sets the new prompt as current, so reload the page
        window.location.reload();
      } else {
        toast.error("Failed to create prompt");
      }
    } catch (error) {
      console.error("Failed to create prompt:", error);
      toast.error("Failed to create prompt");
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (groupId === "default") {
      toast.error("Cannot delete default prompt");
      return;
    }

    try {
      const response = await fetch(`/api/sample-groups?id=${groupId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Prompt deleted");
        setDeleteGroupId(null);
        await loadGroups();
        // If we deleted the current prompt, reload to switch to default
        if (currentGroupId === groupId) {
          window.location.reload();
        }
      } else {
        toast.error("Failed to delete prompt");
      }
    } catch (error) {
      console.error("Failed to delete prompt:", error);
      toast.error("Failed to delete prompt");
    }
  };

  const handleFactoryReset = async () => {
    try {
      setIsResetting(true);

      const runsRes = await fetch("/api/factory-reset", {
        method: "POST",
      });

      if (!runsRes.ok) {
        throw new Error("Failed to factory reset");
      }

      toast.success("Factory reset completed successfully");
      setResetDialogOpen(false);
      window.location.reload();
    } catch (error) {
      console.error("Error during factory reset:", error);
      toast.error("Failed to complete factory reset");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Sidebar variant="floating" collapsible="offcanvas">
      <SidebarHeader className="flex flex-row items-center justify-between p-4 border-b">
        <span className="text-lg font-semibold">DSPyground</span>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Prompts</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {groups.map((group) => (
                <SidebarMenuItem key={group.id} className="group/item">
                  <button
                    onClick={() => handleGroupChange(group.id)}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-md hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {currentGroupId === group.id ? (
                        <CircleDot className="size-4 flex-shrink-0" />
                      ) : (
                        <Circle className="size-4 flex-shrink-0" />
                      )}
                      <span className="text-sm truncate">{group.name}</span>
                    </div>
                    {group.id !== "default" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 opacity-0 group-hover/item:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteGroupId(group.id);
                        }}
                      >
                        <X className="size-3" />
                      </Button>
                    )}
                  </button>
                </SidebarMenuItem>
              ))}

              {/* Create new prompt */}
              {isCreatingGroup ? (
                <SidebarMenuItem>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Input
                      placeholder="Prompt name..."
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateGroup();
                        if (e.key === "Escape") {
                          setIsCreatingGroup(false);
                          setNewGroupName("");
                        }
                      }}
                      autoFocus
                      className="h-7 text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={handleCreateGroup}
                      className="h-7"
                    >
                      Add
                    </Button>
                  </div>
                </SidebarMenuItem>
              ) : (
                <SidebarMenuItem>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCreatingGroup(true)}
                    className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="size-4" />
                    New Prompt
                  </Button>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 flex flex-row items-center justify-start gap-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-muted-foreground"
        >
          <Link href="/how-to">
            <BookOpen className="size-4 mr-2" />
            How To
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setResetDialogOpen(true)}
          className="text-muted-foreground hover:text-destructive"
          title="Factory Reset"
        >
          <Trash2 className="size-4" />
        </Button>
      </SidebarFooter>

      {/* Factory Reset Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete all
              samples, runs, and reset all prompts. Your preferences will be
              preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFactoryReset}
              disabled={isResetting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isResetting ? "Resetting..." : "Yes, reset everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Prompt Dialog */}
      <AlertDialog
        open={deleteGroupId !== null}
        onOpenChange={(open) => !open && setDeleteGroupId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this prompt and all its samples
              and chat history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGroupId && handleDeleteGroup(deleteGroupId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Prompt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
