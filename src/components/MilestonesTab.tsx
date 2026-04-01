"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Edit2,
  Trash2,
  Plus,
  Target,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { Milestone } from "@/lib/types";
import {
  createMilestone,
  updateMilestone,
  updateMilestoneProgress,
  deleteMilestone,
  calculateProgress,
  isMilestoneOverdue,
} from "@/lib/firestore/milestones";
import type { Firestore } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

type MilestoneCategory = "weight" | "strength" | "endurance" | "flexibility" | "milestone" | "other";
type MilestoneStatus = "active" | "completed" | "missed" | "paused";

interface MilestonesTabProps {
  db: Firestore;
  user: any;
  studentId: string;
  milestones: Milestone[] | undefined;
  isLoading: boolean;
  onMilestonesChange?: () => void;
}

export function MilestonesTab({
  db,
  user,
  studentId,
  milestones = [],
  isLoading,
  onMilestonesChange,
}: MilestonesTabProps) {
  const { toast } = useToast();
  const [isAddingMilestone, setIsAddingMilestone] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "milestone" as MilestoneCategory,
    targetValue: "",
    targetUnit: "kg",
    currentValue: "",
    dueDate: "",
  });

  const statusConfig: Record<
    MilestoneStatus,
    { color: string; icon: React.ReactNode; label: string }
  > = {
    active: {
      color: "bg-blue-100 text-blue-800",
      icon: <Target className="h-4 w-4" />,
      label: "Active",
    },
    completed: {
      color: "bg-green-100 text-green-800",
      icon: <CheckCircle2 className="h-4 w-4" />,
      label: "Completed",
    },
    missed: {
      color: "bg-red-100 text-red-800",
      icon: <AlertCircle className="h-4 w-4" />,
      label: "Missed",
    },
    paused: {
      color: "bg-yellow-100 text-yellow-800",
      icon: <AlertCircle className="h-4 w-4" />,
      label: "Paused",
    },
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      category: "milestone",
      targetValue: "",
      targetUnit: "kg",
      currentValue: "",
      dueDate: "",
    });
    setEditingMilestone(null);
  };

  const openEditDialog = (milestone: Milestone) => {
    setFormData({
      title: milestone.title,
      description: milestone.description || "",
      category: milestone.category,
      targetValue: String(milestone.targetValue),
      targetUnit: milestone.targetUnit,
      currentValue: String(milestone.currentValue),
      dueDate: milestone.dueDate.split("T")[0],
    });
    setEditingMilestone(milestone);
    setIsAddingMilestone(true);
  };

  const handleSaveMilestone = async () => {
    if (!formData.title || !formData.targetValue || !formData.dueDate || !formData.currentValue) {
      toast({
        title: "Incomplete Form",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (!db || !user) return;

    setIsSaving(true);
    try {
      if (editingMilestone) {
        // Update existing milestone
        await updateMilestone(db, editingMilestone.id, {
          title: formData.title,
          description: formData.description,
          category: formData.category,
          targetValue: Number(formData.targetValue),
          targetUnit: formData.targetUnit,
          currentValue: Number(formData.currentValue),
          dueDate: new Date(formData.dueDate).toISOString(),
        });
        toast({
          title: "Milestone Updated",
          description: "The milestone has been successfully updated.",
        });
      } else {
        // Create new milestone
        await createMilestone(db, user.uid, studentId, {
          title: formData.title,
          description: formData.description,
          category: formData.category,
          targetValue: Number(formData.targetValue),
          targetUnit: formData.targetUnit,
          currentValue: Number(formData.currentValue),
          dueDate: new Date(formData.dueDate).toISOString(),
          status: "active",
        });
        toast({
          title: "Milestone Created",
          description: "The milestone has been successfully created.",
        });
      }
      resetForm();
      setIsAddingMilestone(false);
      onMilestonesChange?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMilestone = async () => {
    if (!deletingId || !db) return;

    setIsDeleting(true);
    try {
      await deleteMilestone(db, deletingId);
      toast({
        title: "Milestone Deleted",
        description: "The milestone has been removed.",
      });
      setDeletingId(null);
      onMilestonesChange?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdateProgress = async (milestone: Milestone, newValue: string) => {
    if (!db) return;
    try {
      await updateMilestoneProgress(db, milestone.id, Number(newValue));
      toast({
        title: "Progress Updated",
        description: "Milestone progress has been updated.",
      });
      onMilestonesChange?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const activeMilestones = milestones?.filter((m) => m.status === "active") || [];
  const completedMilestones = milestones?.filter((m) => m.status === "completed") || [];
  const otherMilestones = milestones?.filter((m) => m.status !== "active" && m.status !== "completed") || [];

  return (
    <div className="space-y-6">
      {/* Add/Edit Milestone Dialog */}
      <Dialog open={isAddingMilestone} onOpenChange={setIsAddingMilestone}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">Milestones</h3>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={() => resetForm()}>
              <Plus className="h-4 w-4" />
              Add Milestone
            </Button>
          </DialogTrigger>
        </div>

        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMilestone ? "Edit Milestone" : "Create New Milestone"}</DialogTitle>
            <DialogDescription>
              {editingMilestone ? "Update milestone details." : "Set a new goal for the student."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                placeholder="e.g., Reach 75kg"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional details about this milestone..."
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v as MilestoneCategory })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weight">Weight</SelectItem>
                    <SelectItem value="strength">Strength</SelectItem>
                    <SelectItem value="endurance">Endurance</SelectItem>
                    <SelectItem value="flexibility">Flexibility</SelectItem>
                    <SelectItem value="milestone">Milestone</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit *</Label>
                <Select value={formData.targetUnit} onValueChange={(v) => setFormData({ ...formData, targetUnit: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">Kilograms (kg)</SelectItem>
                    <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                    <SelectItem value="reps">Reps</SelectItem>
                    <SelectItem value="km">Kilometers (km)</SelectItem>
                    <SelectItem value="miles">Miles</SelectItem>
                    <SelectItem value="%">Percentage (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Current Value *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.currentValue}
                  onChange={(e) => setFormData({ ...formData, currentValue: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Target Value *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.targetValue}
                  onChange={(e) => setFormData({ ...formData, targetValue: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Due Date *</Label>
              <Input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleSaveMilestone}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                editingMilestone ? "Save Changes" : "Create Milestone"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Active Milestones */}
      {activeMilestones.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Active Milestones ({activeMilestones.length})
          </h4>
          {activeMilestones.map((milestone) => {
            const progress = calculateProgress(milestone.currentValue, milestone.targetValue);
            const isOverdue = isMilestoneOverdue(milestone);

            return (
              <Card key={milestone.id} className={isOverdue ? "border-red-300 bg-red-50/50" : ""}>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h5 className="font-semibold">{milestone.title}</h5>
                        {milestone.description && (
                          <p className="text-sm text-muted-foreground">{milestone.description}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(milestone)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeletingId(milestone.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {milestone.currentValue}
                          {milestone.targetUnit} / {milestone.targetValue}
                          {milestone.targetUnit}
                        </span>
                        <span className="font-medium">{progress.toFixed(0)}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    {/* Due Date and Status */}
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        Due: {new Date(milestone.dueDate).toLocaleDateString()}
                        {isOverdue && <span className="text-red-600 ml-2 font-semibold">OVERDUE</span>}
                      </div>
                      <Badge className="capitalize">{milestone.category}</Badge>
                    </div>

                    {/* Update Progress Input */}
                    <div className="flex gap-2 mt-3">
                      <Input
                        type="number"
                        placeholder="Update progress"
                        defaultValue={milestone.currentValue}
                        className="text-sm h-8"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const value = (e.target as HTMLInputElement).value;
                            handleUpdateProgress(milestone, value);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          const input = (e.currentTarget?.parentElement?.querySelector(
                            "input"
                          ) as HTMLInputElement) || { value: milestone.currentValue };
                          handleUpdateProgress(milestone, input.value);
                        }}
                      >
                        Update
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Completed Milestones */}
      {completedMilestones.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Completed Milestones ({completedMilestones.length})
          </h4>
          {completedMilestones.map((milestone) => (
            <Card key={milestone.id} className="bg-green-50/50 border-green-200">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h5 className="font-semibold text-green-900">{milestone.title}</h5>
                    <p className="text-sm text-green-700">
                      {milestone.currentValue}
                      {milestone.targetUnit} / {milestone.targetValue}
                      {milestone.targetUnit} · Completed on{" "}
                      {milestone.completedAt
                        ? new Date(milestone.completedAt).toLocaleDateString()
                        : "—"}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setDeletingId(milestone.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {milestones?.length === 0 && !isLoading && (
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="pt-6 text-center">
            <Target className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No milestones yet. Create one to get started!</p>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Milestone</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this milestone? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMilestone}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
