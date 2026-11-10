import type { SalePaymentInfo } from '../../domain/types';
import { useT } from '../../i18n';
import { Badge } from '../../ui';

/** Paid / partly paid / open / overdue badge for a sale. */
export function StatusBadge({ info }: { info: SalePaymentInfo | undefined }) {
  const tc = useT('common');
  if (!info) return null;
  if (info.status === 'paid') return <Badge tone="success">{tc('paid')}</Badge>;
  if (info.overdue) return <Badge tone="danger">{tc('overdue')}</Badge>;
  if (info.status === 'partial') return <Badge tone="warning">{tc('partlyPaid')}</Badge>;
  return <Badge tone="warning">{tc('open')}</Badge>;
}
