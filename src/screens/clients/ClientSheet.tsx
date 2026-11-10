import { useState } from 'react';
import { newId } from '../../domain/ids';
import type { Client } from '../../domain/types';
import { useT } from '../../i18n';
import { useActions } from '../../state/store';
import { Field, Sheet, TextArea, TextInput, useToast } from '../../ui';

export interface ClientSheetProps {
  open: boolean;
  onClose: () => void;
  client?: Client;
  onSaved?: (c: Client) => void;
}

/** Build a Client from the form, omitting empty optional fields. */
export function buildClient(form: { name: string; email: string; phone: string; notes: string }, existing?: Client): Client {
  const email = form.email.trim();
  const phone = form.phone.trim();
  const notes = form.notes.trim();
  return {
    id: existing?.id ?? newId(),
    name: form.name.trim(),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(notes ? { notes } : {}),
    archived: existing?.archived ?? false,
  };
}

export function ClientSheet(props: ClientSheetProps) {
  if (!props.open) return null;
  return <Inner {...props} />;
}

function Inner({ onClose, client, onSaved }: ClientSheetProps) {
  const t = useT('clients');
  const tc = useT('common');
  const { upsert } = useActions();
  const toast = useToast();
  const [form, setForm] = useState({ name: client?.name ?? '', email: client?.email ?? '', phone: client?.phone ?? '', notes: client?.notes ?? '' });
  const [initial] = useState(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const [error, setError] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((p) => ({ ...p, ...patch }));

  const submit = () => {
    if (!form.name.trim()) {
      setError(true);
      return;
    }
    const c = buildClient(form, client);
    upsert('clients', c);
    toast.show(t('savedToast'), { tone: 'success' });
    onSaved?.(c);
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={client ? t('editClient') : t('newClient')} onSubmit={submit} dirty={dirty}>
      <div className="pf-form-section pf-stack clients-form">
        <Field label={tc('name')} error={error ? tc('required') : undefined}>
          <TextInput value={form.name} onChange={(e) => set({ name: e.target.value })} data-autofocus="" />
        </Field>
        <div className="pf-form-row">
          <Field label={tc('email')} optionalLabel={tc('optional')}>
            <TextInput type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label={tc('phone')} optionalLabel={tc('optional')}>
            <TextInput type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
        </div>
        <Field label={tc('notes')} optionalLabel={tc('optional')}>
          <TextArea rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}
