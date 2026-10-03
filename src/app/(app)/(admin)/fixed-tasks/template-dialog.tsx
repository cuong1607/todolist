"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WEEKDAYS, trimSeconds } from "@/lib/time";
import { cn } from "@/lib/utils";
import { deleteTemplate, saveTemplate, type TemplateFormState } from "./actions";
import type { Template } from "./template-list";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assigneeId: string;
  assigneeName: string;
  template: Template | null;
};

const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

export function TemplateDialog({ open, onOpenChange, assigneeId, assigneeName, template }: Props) {
  const [state, action, pending] = useActionState<TemplateFormState, FormData>(saveTemplate, {});

  useEffect(() => {
    if (state.ok) {
      toast.success("Đã lưu việc cố định");
      onOpenChange(false);
    }
  }, [state.ok, state.nonce, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? "Sửa việc cố định" : "Thêm việc cố định"}</DialogTitle>
          <DialogDescription>
            Cho <span className="font-medium text-foreground">{assigneeName}</span>
            {template && " · Thay đổi áp dụng từ lần sinh việc tiếp theo, việc đã sinh giữ nguyên."}
          </DialogDescription>
        </DialogHeader>

        {/* key: fresh form state per template / per open */}
        <TemplateForm
          key={`${template?.id ?? "new"}-${open}`}
          action={action}
          pending={pending}
          error={state.error}
          assigneeId={assigneeId}
          template={template}
          onDeleted={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type FormProps = {
  action: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  assigneeId: string;
  template: Template | null;
  onDeleted: () => void;
};

function TemplateForm({ action, pending, error, assigneeId, template, onDeleted }: FormProps) {
  const [weekdays, setWeekdays] = useState<number[]>(template?.days_of_week ?? DEFAULT_WEEKDAYS);
  const [allowNote, setAllowNote] = useState(template?.allow_employee_note ?? false);
  const [deleting, startDelete] = useTransition();

  function toggleDay(day: number) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function remove() {
    if (!template) return;
    startDelete(async () => {
      const result = await deleteTemplate(template.id);
      if (result.ok) {
        toast.success("Đã xoá");
        onDeleted();
      } else toast.error(result.error);
    });
  }

  return (
    <form action={action} className="space-y-5">
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-caption text-danger-soft-foreground">
          {error}
        </p>
      )}

      {template && <input type="hidden" name="id" value={template.id} />}
      <input type="hidden" name="assignee_id" value={assigneeId} />

      <div className="space-y-2">
        <Label htmlFor="t-title">Tên công việc</Label>
        <Input
          id="t-title"
          name="title"
          required
          maxLength={200}
          defaultValue={template?.title}
          placeholder="VD: Kiểm tra đơn hàng mới"
          className="h-11 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="t-note">Hướng dẫn (không bắt buộc)</Label>
        <textarea
          id="t-note"
          name="note"
          rows={3}
          maxLength={2000}
          defaultValue={template?.default_note ?? ""}
          placeholder="Nhân viên sẽ thấy hướng dẫn này trong việc hằng ngày"
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Ngày áp dụng</legend>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d) => {
            const on = weekdays.includes(d.value);
            return (
              <label
                key={d.value}
                title={d.long}
                className={cn(
                  "flex h-11 cursor-pointer items-center justify-center rounded-lg border text-caption font-semibold transition-colors duration-(--duration-fast) has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  on ? "border-primary bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:bg-muted",
                )}
              >
                <input
                  type="checkbox"
                  name="weekdays"
                  value={d.value}
                  checked={on}
                  onChange={() => toggleDay(d.value)}
                  className="sr-only"
                />
                {d.short}
              </label>
            );
          })}
        </div>
        <div className="flex gap-2 text-caption">
          <button type="button" className="text-primary hover:underline" onClick={() => setWeekdays([1, 2, 3, 4, 5])}>
            T2–T6
          </button>
          <button type="button" className="text-primary hover:underline" onClick={() => setWeekdays([1, 2, 3, 4, 5, 6])}>
            T2–T7
          </button>
          <button type="button" className="text-primary hover:underline" onClick={() => setWeekdays([1, 2, 3, 4, 5, 6, 7])}>
            Hằng ngày
          </button>
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="t-due">Hạn trong ngày (không bắt buộc)</Label>
        <Input
          id="t-due"
          name="due_time"
          type="time"
          defaultValue={template?.due_time ? trimSeconds(template.due_time) : ""}
          className="h-11 w-36 text-base"
        />
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
        <span>
          <span className="block font-medium">Cho phép nhân viên ghi chú</span>
          <span className="block text-caption text-muted-foreground">VD: ghi số liệu, kết quả kiểm tra</span>
        </span>
        <Switch checked={allowNote} onCheckedChange={setAllowNote} aria-label="Cho phép nhân viên ghi chú" />
        {allowNote && <input type="hidden" name="allow_employee_note" value="on" />}
      </label>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {template && !template.hasHistory ? (
          <Button type="button" variant="destructive" size="lg" className="h-11" disabled={deleting} onClick={remove}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Xoá
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
        <Button type="submit" size="lg" disabled={pending || weekdays.length === 0} className="h-11 sm:px-6">
          {pending && <Loader2 className="animate-spin" />}
          {template ? "Lưu thay đổi" : "Thêm việc"}
        </Button>
      </div>
      {template?.hasHistory && (
        <p className="text-micro text-muted-foreground">Việc này đã có lịch sử nên không xoá được — dùng công tắc để tắt.</p>
      )}
    </form>
  );
}
