import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Link from "@jetbrains/ring-ui-built/components/link/link";
import Loader from "@jetbrains/ring-ui-built/components/loader/loader";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useEffect, useState } from "react";
import type { Template, TemplateTarget } from "../../@types/template";
import {
  countChildren,
  formatChildrenNoun,
  formatStatusSummary,
  getApplyActions,
  type ApplyActionKey,
  type ApplyStatus,
} from "../apply-template";

interface RemoveConfirmProps {
  template: Template;
  target: TemplateTarget;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Inline confirmation of removing a template, saying what is and is not undone.
const RemoveConfirm: React.FunctionComponent<RemoveConfirmProps> = ({
  template,
  target,
  submitting,
  onConfirm,
  onCancel,
}) => {
  const text = target === "ticket" ? "description" : "content";
  const kept = [
    ...(target === "ticket" ? ["fields"] : []),
    "tags",
    ...(countChildren(template) > 0 ? [formatChildrenNoun(target)] : []),
  ];
  return (
    <>
      <Text size={Text.Size.M}>
        Remove {template.name}? Its text is removed from the {text} if it has not been edited.{" "}
        {kept.length > 1
          ? `${kept.slice(0, -1).join(", ")} and ${kept[kept.length - 1]}`
          : kept[0]}{" "}
        are kept.
      </Text>
      <div className="apply-template-buttons">
        <Button danger loader={submitting} disabled={submitting} onClick={onConfirm}>
          Remove
        </Button>
        <Button disabled={submitting} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </>
  );
};

interface ApplyActionsPanelProps {
  template: Template | null;
  status: ApplyStatus | null;
  target: TemplateTarget;
  // Why the template cannot be used here, shown instead of its status; null when it can.
  blockedReason?: string | null;
  submitting: boolean;
  onAction: (key: ApplyActionKey) => void;
}

// Bottom panel of the apply dialogs: the state of the selected template, a link to its content
// and only the actions that apply to it.
export const ApplyActionsPanel: React.FunctionComponent<ApplyActionsPanelProps> = ({
  template,
  status,
  target,
  blockedReason = null,
  submitting,
  onAction,
}) => {
  const [confirmingRemove, setConfirmingRemove] = useState<boolean>(false);
  const templateId = template?.id;
  useEffect(() => setConfirmingRemove(false), [templateId, status]);

  if (template === null || status === null) {
    return (
      <Panel className="apply-template-panel">
        <Text size={Text.Size.M} info>
          Select a template to see what you can do with it.
        </Text>
      </Panel>
    );
  }
  if (confirmingRemove) {
    return (
      <Panel className="apply-template-panel">
        <RemoveConfirm
          template={template}
          target={target}
          submitting={submitting}
          onConfirm={() => onAction("remove")}
          onCancel={() => setConfirmingRemove(false)}
        />
      </Panel>
    );
  }
  return (
    <Panel className="apply-template-panel">
      <Text size={Text.Size.M} info={blockedReason === null}>
        {blockedReason ?? formatStatusSummary(status, target)}{" "}
        <Link href={`/articles/${template.articleId}`} target="_blank">
          Preview content ↗
        </Link>
      </Text>
      <div className="apply-template-buttons">
        {getApplyActions(template, status, target, blockedReason !== null).map((action) => (
          <Button
            key={action.key}
            primary={action.primary}
            loader={submitting && action.primary}
            disabled={submitting || action.disabled === true}
            onClick={() =>
              action.key === "remove" ? setConfirmingRemove(true) : onAction(action.key)
            }
          >
            {action.label}
          </Button>
        ))}
      </div>
    </Panel>
  );
};

interface ApplyLoadStateProps {
  error: string | null;
  onRetry: () => void;
}

// Shown until the templates are loaded: a loader, or the load error with a retry.
export const ApplyLoadState: React.FunctionComponent<ApplyLoadStateProps> = ({ error, onRetry }) =>
  error === null ? (
    <Loader message="Loading templates…"/>
  ) : (
    <Banner mode="error" title="Could not load templates" withIcon>
      {error}{" "}
      <Link onClick={onRetry}>Retry</Link>
    </Banner>
  );

interface NoTemplatesMessageProps {
  target: TemplateTarget;
}

export const NoTemplatesMessage: React.FunctionComponent<NoTemplatesMessageProps> = ({ target }) => (
  <Banner mode="info" withIcon title={`No templates apply to this ${target}`}>
    Templates are set up in Project settings → Ticket Templates Config.
  </Banner>
);
