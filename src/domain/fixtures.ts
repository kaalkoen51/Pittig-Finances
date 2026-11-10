/**
 * Demo dataset: a small Dutch chili-sauce maker. Dates are relative to `ref` (default today)
 * so "this month" always has activity. IDs are stable ('demo-…') for tests.
 *
 * Contains: 2 products, 3 batches, 4 clients, 4 suppliers, sales with and without client,
 * a partial payment, an open (overdue) sale, paid + unpaid (overdue) expenses, general costs
 * and two "to sort" import rows.
 */
import { addDays, today } from './dates';
import { importFingerprint } from './importing';
import { CURRENT_VERSION } from './migrate';
import type { AppData, Category, ImportRow } from './types';

export function demoData(ref: string = today()): AppData {
  const d = (days: number) => addDays(ref, -days);
  const categories: Category[] = [
    { id: 'demo-cat-ingr', name: 'Ingrediënten', color: '#D9822B', archived: false },
    { id: 'demo-cat-pack', name: 'Verpakking', color: '#8E6C4A', archived: false },
    { id: 'demo-cat-label', name: 'Etiketten & drukwerk', color: '#B05BC4', archived: false },
    { id: 'demo-cat-equip', name: 'Apparatuur', color: '#5B7BD5', archived: false },
    { id: 'demo-cat-transport', name: 'Transport', color: '#2F9E8F', archived: false },
    { id: 'demo-cat-market', name: 'Marktkosten', color: '#D4A72C', archived: false },
    { id: 'demo-cat-mkt', name: 'Marketing', color: '#D2463A', archived: false },
    { id: 'demo-cat-other', name: 'Overig', color: '#8E8E93', archived: false },
  ];
  const importRow = (id: string, date: string, description: string, amount: number, counterparty: string): ImportRow => {
    const source = 'demo-bank.csv';
    return {
      id,
      date,
      description,
      amount,
      source,
      counterparty,
      fingerprint: importFingerprint({ date, amount, description }),
      status: 'todo',
      importedAt: `${ref}T09:00:00.000Z`,
    };
  };
  return {
    version: CURRENT_VERSION,
    settings: { businessName: 'Pittig Sauzen', language: 'nl', firstRunDone: true },
    categories,
    products: [
      { id: 'demo-p-sambal', name: 'Sambal Pittig', unit: 'pot', defaultPrice: 650, archived: false },
      { id: 'demo-p-habanero', name: 'Habanero Hot Sauce', unit: 'fles', defaultPrice: 795, archived: false },
    ],
    batches: [
      { id: 'demo-b-s1', productId: 'demo-p-sambal', code: 'S-01', producedOn: d(75), quantity: 120, closed: true, notes: 'Eerste batch, iets te zout' },
      { id: 'demo-b-s2', productId: 'demo-p-sambal', code: 'S-02', producedOn: d(20), quantity: 150, closed: false },
      { id: 'demo-b-h1', productId: 'demo-p-habanero', code: 'H-01', producedOn: d(40), quantity: 80, closed: false },
    ],
    clients: [
      { id: 'demo-c-smaak', name: 'Delicatessen De Smaakmaker', email: 'inkoop@desmaakmaker.example', archived: false },
      { id: 'demo-c-toko', name: 'Toko Sari', phone: '06 12345678', archived: false },
      { id: 'demo-c-hoekje', name: 'Café Het Hoekje', archived: false },
      { id: 'demo-c-hoeve', name: 'Boerderijwinkel Hoeve Linde', notes: 'Betaalt altijd aan het eind van de maand', archived: false },
    ],
    suppliers: [
      { id: 'demo-s-spice', name: 'Spice Import Rotterdam', archived: false },
      { id: 'demo-s-jars', name: 'Verpakking Direct', email: 'orders@verpakkingdirect.example', archived: false },
      { id: 'demo-s-print', name: 'Drukkerij Van Dam', archived: false },
      { id: 'demo-s-markt', name: 'Gemeente Utrecht (markt)', archived: false },
    ],
    sales: [
      // Batch S-01 – fully paid (targeted payment)
      { id: 'demo-sale-1', date: d(60), clientId: 'demo-c-smaak', items: [{ productId: 'demo-p-sambal', batchId: 'demo-b-s1', quantity: 40, unitPrice: 550 }] },
      // Market day – walk-in, counts as paid
      { id: 'demo-sale-2', date: d(45), items: [{ productId: 'demo-p-sambal', batchId: 'demo-b-s1', quantity: 25, unitPrice: 650 }], notes: 'Zaterdagmarkt' },
      // Toko Sari – partly paid (FIFO)
      {
        id: 'demo-sale-3',
        date: d(30),
        clientId: 'demo-c-toko',
        dueDate: d(16),
        items: [
          { productId: 'demo-p-sambal', batchId: 'demo-b-s1', quantity: 30, unitPrice: 550 },
          { productId: 'demo-p-habanero', batchId: 'demo-b-h1', quantity: 12, unitPrice: 700 },
        ],
      },
      // Café – open and overdue
      { id: 'demo-sale-4', date: d(25), clientId: 'demo-c-hoekje', dueDate: d(11), items: [{ productId: 'demo-p-habanero', batchId: 'demo-b-h1', quantity: 10, unitPrice: 750 }] },
      // Hoeve Linde – this month, open, not yet due
      { id: 'demo-sale-5', date: d(5), clientId: 'demo-c-hoeve', dueDate: addDays(ref, 25), items: [{ productId: 'demo-p-sambal', batchId: 'demo-b-s2', quantity: 24, unitPrice: 550 }] },
      // Smaakmaker – this month, paid already
      {
        id: 'demo-sale-6',
        date: d(3),
        clientId: 'demo-c-smaak',
        items: [
          { productId: 'demo-p-sambal', batchId: 'demo-b-s2', quantity: 30, unitPrice: 550 },
          { productId: 'demo-p-habanero', batchId: 'demo-b-h1', quantity: 20, unitPrice: 700 },
        ],
      },
      // Market again – walk-in this month
      { id: 'demo-sale-7', date: d(1), items: [{ productId: 'demo-p-habanero', batchId: 'demo-b-h1', quantity: 8, unitPrice: 795 }], notes: 'Zaterdagmarkt' },
    ],
    payments: [
      { id: 'demo-pay-1', date: d(55), clientId: 'demo-c-smaak', saleId: 'demo-sale-1', amount: 22000, method: 'bank' },
      // Toko Sari pays €100 of €249 (no saleId → FIFO)
      { id: 'demo-pay-2', date: d(14), clientId: 'demo-c-toko', amount: 10000, method: 'bank' },
      { id: 'demo-pay-3', date: d(3), clientId: 'demo-c-smaak', saleId: 'demo-sale-6', amount: 30500, method: 'bank' },
    ],
    expenses: [
      { id: 'demo-e-1', date: d(78), supplierId: 'demo-s-spice', categoryId: 'demo-cat-ingr', batchId: 'demo-b-s1', description: 'Rode pepers en knoflook', amount: 14500, paidOn: d(78) },
      { id: 'demo-e-2', date: d(78), supplierId: 'demo-s-jars', categoryId: 'demo-cat-pack', batchId: 'demo-b-s1', description: '120 potten met deksel', amount: 9600, paidOn: d(70) },
      { id: 'demo-e-3', date: d(42), supplierId: 'demo-s-spice', categoryId: 'demo-cat-ingr', batchId: 'demo-b-h1', description: 'Habanero pepers', amount: 11250, paidOn: d(42) },
      { id: 'demo-e-4', date: d(42), supplierId: 'demo-s-jars', categoryId: 'demo-cat-pack', batchId: 'demo-b-h1', description: '80 flessen', amount: 6400, paidOn: d(35) },
      { id: 'demo-e-5', date: d(22), supplierId: 'demo-s-spice', categoryId: 'demo-cat-ingr', batchId: 'demo-b-s2', description: 'Pepers, sjalot, gula djawa', amount: 17800, paidOn: d(22) },
      // Unpaid, overdue
      { id: 'demo-e-6', date: d(21), supplierId: 'demo-s-jars', categoryId: 'demo-cat-pack', batchId: 'demo-b-s2', description: '150 potten met deksel', amount: 12000, paidOn: null, dueDate: d(7) },
      // Unpaid, due later – general cost (no batch)
      { id: 'demo-e-7', date: d(6), supplierId: 'demo-s-print', categoryId: 'demo-cat-label', description: 'Etiketten 500 st.', amount: 8950, paidOn: null, dueDate: addDays(ref, 24) },
      // Paid general costs
      { id: 'demo-e-8', date: d(45), supplierId: 'demo-s-markt', categoryId: 'demo-cat-market', description: 'Standplaats zaterdagmarkt', amount: 3500, paidOn: d(45) },
      { id: 'demo-e-9', date: d(1), supplierId: 'demo-s-markt', categoryId: 'demo-cat-market', description: 'Standplaats zaterdagmarkt', amount: 3500, paidOn: d(1) },
      { id: 'demo-e-10', date: d(10), categoryId: 'demo-cat-transport', description: 'Benzine leveringen', amount: 4280, paidOn: d(10) },
    ],
    importRows: [
      importRow('demo-imp-1', d(2), 'TIKKIE VAN CAFE HET HOEKJE', 7500, 'Café Het Hoekje'),
      importRow('demo-imp-2', d(4), 'BOL.COM BESTELLING TRECHTERS', -1899, 'bol.com'),
    ],
  };
}
