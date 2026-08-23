"use client";

import { crm } from "@/lib/admin-ui";

export function isFormDirty<T extends Record<string, string | boolean>>(
  current: T,
  baseline: T
): boolean {
  return (Object.keys(baseline) as (keyof T)[]).some((key) => current[key] !== baseline[key]);
}

type FormActionsProps = {
  /** Form has unsaved changes — shows Cancel and enables save unless saveEnabled overrides */
  dirty: boolean;
  isPending?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  feedback?: string;
  className?: string;
  formId?: string;
  onSave?: () => void;
  /** Override save enabled state (e.g. create forms that also require required fields) */
  saveEnabled?: boolean;
};

export default function FormActions({
  dirty,
  isPending = false,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  onCancel,
  feedback,
  className = "",
  formId,
  onSave,
  saveEnabled,
}: FormActionsProps) {
  const canSave = saveEnabled ?? dirty;
  const saveDisabled = !canSave || isPending;

  return (
    <div className={`${crm.formActions} ${className}`.trim()}>
      {onSave ? (
        <button type="button" onClick={onSave} disabled={saveDisabled} className={crm.btnPrimary}>
          {saveLabel}
        </button>
      ) : (
        <button type="submit" form={formId} disabled={saveDisabled} className={crm.btnPrimary}>
          {saveLabel}
        </button>
      )}
      {dirty ? (
        <button type="button" onClick={onCancel} disabled={isPending} className={crm.btn}>
          {cancelLabel}
        </button>
      ) : null}
      {feedback ? <span className="text-xs text-crm-faint">{feedback}</span> : null}
    </div>
  );
}
