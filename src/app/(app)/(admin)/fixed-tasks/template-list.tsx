"use client";

import { useState, useTransition } from "react";
import { Reorder, useDragControls } from "motion/react";
import { Clock, GripVertical, MessageSquareText, Pencil, Plus, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/empty-state";
import { Fab } from "@/components/shell/fab";
import { describeWeekdays, trimSeconds } from "@/lib/time";
import { cn } from "@/lib/utils";
import { reorderTemplates, setTemplateActive } from "./actions";
import { TemplateDialog } from "./template-dialog";

export type Template = {
  id: string;
  title: string;
  note: string | null;
  allow_employee_note: boolean;
  due_time: string | null;
  weekdays: number[];
  sort_order: number;
  active: boolean;
  /** Has generated at least one task → can be disabled but not deleted. */
  hasHistory: boolean;
};

type Props = { assigneeId: string; assigneeName: string; templates: Template[] };

export function TemplateList({ assigneeId, assigneeName, templates }: Props) {
  // Local copy so drag-reorder feels instant; re-synced when the server sends new data.
  const [items, setItems] = useState(templates);
  const [synced, setSynced] = useState(templates);
  if (synced !== templates) {
    setSynced(templates);
    setItems(templates);
  }

  const [editing, setEditing] = useState<Template | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(t: Template) {
    setEditing(t);
    setDialogOpen(true);
  }

  function persistOrder() {
    const ids = items.map((t) => t.id);
    if (ids.join() === templates.map((t) => t.id).join()) return;
    startTransition(async () => {
      const result = await reorderTemplates(assigneeId, ids);
      if (!result.ok) {
        toast.error(result.error);
        setItems(templates);
      }
    });
  }

  function toggleActive(t: Template, active: boolean) {
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, active } : x)));
    startTransition(async () => {
      const result = await setTemplateActive(t.id, active);
      if (result.ok) toast.success(active ? `Đã bật “${t.title}”` : `Đã tắt “${t.title}”. Lịch sử vẫn được giữ.`);
      else {
        toast.error(result.error);
        setItems(templates);
      }
    });
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-caption text-muted-foreground">
          {items.filter((t) => t.active).length} việc đang bật cho <span className="font-medium text-foreground">{assigneeName}</span>
        </p>
        <Button size="lg" onClick={openCreate} className="hidden md:inline-flex">
          <Plus />
          Thêm việc cố định
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Repeat />}
          title="Chưa có việc cố định"
          description={`Thêm những việc ${assigneeName} phải làm mỗi ngày.`}
        >
          <Button size="lg" onClick={openCreate}>
            <Plus />
            Thêm việc cố định
          </Button>
        </EmptyState>
      ) : (
        <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-2">
          {items.map((t) => (
            <TemplateItem
              key={t.id}
              template={t}
              onDragEnd={persistOrder}
              onEdit={() => openEdit(t)}
              onToggle={(active) => toggleActive(t, active)}
            />
          ))}
        </Reorder.Group>
      )}

      <Fab icon={Plus} label="Thêm việc cố định" onClick={openCreate} />
      <TemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        assigneeId={assigneeId}
        assigneeName={assigneeName}
        template={editing}
      />
    </>
  );
}

type ItemProps = {
  template: Template;
  onDragEnd: () => void;
  onEdit: () => void;
  onToggle: (active: boolean) => void;
};

function TemplateItem({ template: t, onDragEnd, onEdit, onToggle }: ItemProps) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={t}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.02, boxShadow: "var(--shadow-overlay)" }}
      className="relative list-none rounded-xl"
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border bg-surface py-3 pr-3 pl-1 shadow-card transition-opacity duration-(--duration-normal)",
          !t.active && "opacity-55",
        )}
      >
        {/* Drag handle only — lets the rest of the card scroll normally on touch. */}
        <button
          type="button"
          aria-label={`Kéo để sắp xếp “${t.title}”`}
          onPointerDown={(e) => controls.start(e)}
          className="flex size-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-5" />
        </button>

        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left outline-none">
          <p className="truncate font-medium">{t.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
            <span className="flex items-center gap-1">
              <Repeat className="size-3.5" />
              {describeWeekdays(t.weekdays)}
            </span>
            {t.due_time && (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" />
                {trimSeconds(t.due_time)}
              </span>
            )}
            {t.allow_employee_note && (
              <span className="flex items-center gap-1">
                <MessageSquareText className="size-3.5" />
                Cho ghi chú
              </span>
            )}
          </p>
        </button>

        <Button variant="ghost" size="icon-lg" aria-label={`Sửa “${t.title}”`} onClick={onEdit} className="hidden sm:inline-flex">
          <Pencil />
        </Button>
        <Switch checked={t.active} onCheckedChange={onToggle} aria-label={t.active ? `Tắt “${t.title}”` : `Bật “${t.title}”`} />
      </div>
    </Reorder.Item>
  );
}
