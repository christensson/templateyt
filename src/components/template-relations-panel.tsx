import AddIcon from "@jetbrains/icons/add-12px";
import TrashIcon from "@jetbrains/icons/trash";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useMemo, useState } from "react";
import {
  flattenChildTemplates,
  getChildTemplates,
  type Template,
  type TemplateRelation,
} from "../../@types/template";

// Checks that a ticket exists and is accessible; resolves to "ID: summary", or null if not.
export type IssueChecker = (issueId: string) => Promise<string | null>;

const ROOT_KEY = "root";
const FIXED_KEY = "fixed";
const CHILD_PREFIX = "child:";
// Depth indentation of child templates in the target select.
const INDENT = "   ";

const getTargetKey = (relation: TemplateRelation): string => {
  if (relation.target === "child") {
    return `${CHILD_PREFIX}${relation.childId}`;
  }
  return relation.target === "root" ? ROOT_KEY : FIXED_KEY;
};

const withTarget = (relation: TemplateRelation, key: string): TemplateRelation => {
  if (key === ROOT_KEY) {
    return { linkName: relation.linkName, target: "root" };
  }
  if (key.startsWith(CHILD_PREFIX)) {
    return { linkName: relation.linkName, target: "child", childId: key.slice(CHILD_PREFIX.length) };
  }
  return {
    linkName: relation.linkName,
    target: "fixed",
    issueId: relation.target === "fixed" ? relation.issueId : "",
  };
};

// Tickets a relation can point to: the root ticket and the other child templates' subtasks
// (hierarchical templates only), then a fixed ticket. The owner's own ticket is left out.
const getTargetItems = (template: Template, ownerChildId: string | null): Array<SelectItem> => {
  const items: Array<SelectItem> = [];
  if (template.hierarchical) {
    if (ownerChildId !== null) {
      items.push({ key: ROOT_KEY, label: "Root ticket" });
    }
    for (const { child, depth } of flattenChildTemplates(getChildTemplates(template))) {
      if (child.id !== ownerChildId) {
        items.push({ key: `${CHILD_PREFIX}${child.id}`, label: `${INDENT.repeat(depth)}${child.name}` });
      }
    }
  }
  items.push({ key: FIXED_KEY, label: "Fixed ticket..." });
  return items;
};

interface RelationRowProps {
  relation: TemplateRelation;
  linkItems: Array<SelectItem>;
  targetItems: Array<SelectItem>;
  checkIssue: IssueChecker;
  onChange: (relation: TemplateRelation) => void;
  onRemove: () => void;
}

const RelationRow: React.FunctionComponent<RelationRowProps> = ({
  relation,
  linkItems,
  targetItems,
  checkIssue,
  onChange,
  onRemove,
}) => {
  // Result of checking the fixed ticket id: its "ID: summary", an error, or nothing yet.
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);

  const runCheck = async (issueId: string) => {
    const id = issueId.trim();
    if (id === "") {
      setCheck(null);
      return;
    }
    const text = await checkIssue(id);
    setCheck(
      text === null ? { ok: false, text: `Ticket ${id} not found or not accessible.` } : { ok: true, text },
    );
  };

  return (
    <div>
      <div className="template-replacement-row">
        <Text size={Text.Size.M}>Add relation </Text>
        <Select
          filter
          label="..."
          type={Select.Type.INLINE}
          size={Select.Size.AUTO}
          data={linkItems}
          selected={linkItems.find((item) => item.key === relation.linkName) || null}
          onSelect={(item: SelectItem | null) =>
            item && onChange({ ...relation, linkName: String(item.key) })
          }
        />
        <Text size={Text.Size.M}> to </Text>
        <Select
          label="..."
          type={Select.Type.INLINE}
          size={Select.Size.AUTO}
          data={targetItems}
          selected={targetItems.find((item) => item.key === getTargetKey(relation)) || null}
          onSelect={(item: SelectItem | null) => {
            if (item) {
              setCheck(null);
              onChange(withTarget(relation, String(item.key)));
            }
          }}
        />
        {relation.target === "fixed" && (
          <Input
            value={relation.issueId}
            placeholder="Ticket id"
            size={Size.S}
            onChange={(e) => onChange({ ...relation, issueId: e.target.value.trim() })}
            onBlur={() => runCheck(relation.issueId)}
          />
        )}
        <Button onClick={onRemove} icon={TrashIcon} title="Remove relation"/>
      </div>
      {relation.target === "fixed" && check !== null && (
        <Text size={Text.Size.S} info={check.ok}>
          {check.text}
        </Text>
      )}
    </div>
  );
};

interface TemplateRelationsPanelProps {
  title: string;
  // The whole template, for the targets in its hierarchy.
  template: Template;
  // The child template owning the relations, or null for the template itself.
  ownerChildId: string | null;
  relations: Array<TemplateRelation>;
  onRelationsChange: (relations: Array<TemplateRelation>) => void;
  linkNames: Array<string>;
  checkIssue: IssueChecker;
  hint?: string;
}

// Editable list of the relations a template (or child template) adds from its ticket.
const TemplateRelationsPanel: React.FunctionComponent<TemplateRelationsPanelProps> = ({
  title,
  template,
  ownerChildId,
  relations,
  onRelationsChange,
  linkNames,
  checkIssue,
  hint,
}) => {
  const linkItems = useMemo(
    () => linkNames.map((name) => ({ key: name, label: name })),
    [linkNames],
  );
  const targetItems = useMemo(() => getTargetItems(template, ownerChildId), [template, ownerChildId]);

  const updateRelation = (idx: number, relation: TemplateRelation) =>
    onRelationsChange(relations.map((current, index) => (index === idx ? relation : current)));
  const removeRelation = (idx: number) =>
    onRelationsChange(relations.filter((_, index) => index !== idx));
  const addRelation = () =>
    onRelationsChange([...relations, { linkName: "", target: "fixed", issueId: "" }]);

  return (
    <div className="template-edit-field-panel">
      <Text size={Text.Size.S} info>
        {title}
      </Text>
      {relations.length === 0 && <Text size={Text.Size.M}>No relations set yet.</Text>}
      {relations.map((relation, idx) => (
        <RelationRow
          // Relations are keyed by position: link name and target are user-editable and may be
          // empty or duplicated while editing.
          // eslint-disable-next-line react/no-array-index-key
          key={`template-relation-${idx}`}
          relation={relation}
          linkItems={linkItems}
          targetItems={targetItems}
          checkIssue={checkIssue}
          onChange={(updated) => updateRelation(idx, updated)}
          onRemove={() => removeRelation(idx)}
        />
      ))}
      <div>
        <Button onClick={addRelation} icon={AddIcon} inline>
          Add relation
        </Button>
      </div>
      {hint && (
        <Text size={Text.Size.S} info>
          {hint}
        </Text>
      )}
    </div>
  );
};

export default TemplateRelationsPanel;
