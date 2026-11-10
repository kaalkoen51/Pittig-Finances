import { useEffect, useState } from 'react';
import { newId } from '../../domain/ids';
import type { Category } from '../../domain/types';
import { useT } from '../../i18n';
import { useActions } from '../../state/store';
import { Button, Field, Icon, Sheet, TextInput, useConfirm, useToast } from '../../ui';

export const CATEGORY_COLORS = ['#D9822B', '#8E6C4A', '#B05BC4', '#5B7BD5', '#2F9E8F', '#D4A72C', '#D2463A', '#4E9A3E', '#E0679A', '#8E8E93'];

export interface CategorySheetProps {
  /** Category to edit, or 'new'. null = closed. */
  category: Category | 'new' | null;
  onClose: () => void;
  /** Number of categories, to pick a fresh default colour. */
  count: number;
}

export function CategorySheet({ category, onClose, count }: CategorySheetProps) {
  const t = useT('settings');
  const tc = useT('common');
  const actions = useActions();
  const confirm = useConfirm();
  const toast = useToast();
  const isNew = category === 'new';
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLORS[0]!);
  const [error, setError] = useState<string | undefined>();
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (category === null) return;
    setError(undefined);
    setDirty(false);
    if (category === 'new') {
      setName('');
      setColor(CATEGORY_COLORS[count % CATEGORY_COLORS.length]!);
    } else {
      setName(category.name);
      setColor(category.color);
    }
  }, [category, count]);

  const save = () => {
    const n = name.trim();
    if (!n) {
      setError(tc('required'));
      return;
    }
    if (category === 'new') actions.upsert('categories', { id: newId(), name: n, color, archived: false });
    else if (category) actions.upsert('categories', { ...category, name: n, color });
    toast.show(tc('savedToast'), { tone: 'success' });
    onClose();
  };

  const existing = category !== 'new' && category !== null ? category : null;
  const referenced = existing ? actions.isReferenced('categories', existing.id) : false;

  const footer = existing ? (
    <div className="pf-row-actions">
      {existing.archived ? (
        <Button
          variant="secondary"
          icon={<Icon name="archive" size={16} />}
          onClick={() => {
            actions.archive('categories', existing.id, false);
            onClose();
          }}
        >
          {tc('unarchive')}
        </Button>
      ) : (
        <Button
          variant="secondary"
          icon={<Icon name="archive" size={16} />}
          onClick={() => {
            actions.archive('categories', existing.id, true);
            toast.show(t('categoryArchived'), { action: { label: tc('undo'), onClick: () => actions.archive('categories', existing.id, false) } });
            onClose();
          }}
        >
          {tc('archive')}
        </Button>
      )}
      {!referenced && (
        <Button
          variant="destructive"
          icon={<Icon name="trash" size={16} />}
          onClick={async () => {
            if (!(await confirm({ title: tc('deleteTitle', { name: existing.name }), message: tc('deleteMessage'), confirmLabel: tc('delete'), destructive: true }))) return;
            if (actions.remove('categories', existing.id)) {
              toast.show(tc('deletedToast'));
              onClose();
            }
          }}
        >
          {tc('delete')}
        </Button>
      )}
    </div>
  ) : undefined;

  return (
    <Sheet open={category !== null} onClose={onClose} title={isNew ? t('newCategory') : t('editCategory')} onSubmit={save} footer={footer} dirty={dirty}>
      <div className="pf-form-section">
        <Field label={t('categoryName')} error={error} hint={referenced ? t('categoryInUse') : undefined}>
          <TextInput
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(undefined);
              setDirty(true);
            }}
            data-autofocus
            maxLength={60}
          />
        </Field>
        <Field label={t('categoryColor')}>
          <div className="settings-colors" role="radiogroup" aria-label={t('categoryColor')}>
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color.toLowerCase() === c.toLowerCase()}
                aria-label={c}
                className={'settings-swatch' + (color.toLowerCase() === c.toLowerCase() ? ' is-selected' : '')}
                style={{ background: c }}
                onClick={() => {
                  setColor(c);
                  setDirty(true);
                }}
              />
            ))}
            <input type="color" className="settings-color-input" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#8e8e93'} onChange={(e) => {
              setColor(e.target.value.toUpperCase());
              setDirty(true);
            }} aria-label={t('categoryColor')} />
          </div>
        </Field>
      </div>
    </Sheet>
  );
}
