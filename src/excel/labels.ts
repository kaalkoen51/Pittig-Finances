/**
 * Sheet and column names of our own Excel export, in both languages. The importer recognises
 * either language, so a file exported in English can be re-imported with the app in Dutch.
 */
import type { Language } from '../domain/types';

type L = Record<Language, string>;

export const SHEETS = {
  summary: { nl: 'Overzicht', en: 'Summary' },
  sales: { nl: 'Verkopen', en: 'Sales' },
  payments: { nl: 'Betalingen', en: 'Payments' },
  expenses: { nl: 'Uitgaven', en: 'Expenses' },
  clients: { nl: 'Klanten', en: 'Clients' },
  suppliers: { nl: 'Leveranciers', en: 'Suppliers' },
  products: { nl: 'Producten', en: 'Products' },
  batches: { nl: 'Batches', en: 'Batches' },
  statement: { nl: 'Overzicht klant', en: 'Client statement' },
} satisfies Record<string, L>;

export const COLS = {
  id: { nl: 'ID', en: 'ID' },
  saleId: { nl: 'Verkoop-ID', en: 'Sale ID' },
  month: { nl: 'Maand', en: 'Month' },
  moneyIn: { nl: 'Geld in', en: 'Money in' },
  moneyOut: { nl: 'Geld uit', en: 'Money out' },
  result: { nl: 'Resultaat', en: 'Result' },
  sold: { nl: 'Verkocht', en: 'Sold' },
  costs: { nl: 'Kosten', en: 'Costs' },
  profit: { nl: 'Winst', en: 'Profit' },
  total: { nl: 'Totaal', en: 'Total' },
  date: { nl: 'Datum', en: 'Date' },
  client: { nl: 'Klant', en: 'Client' },
  product: { nl: 'Product', en: 'Product' },
  batch: { nl: 'Batch', en: 'Batch' },
  quantity: { nl: 'Aantal', en: 'Quantity' },
  unitPrice: { nl: 'Prijs per stuk', en: 'Unit price' },
  lineTotal: { nl: 'Regeltotaal', en: 'Line total' },
  status: { nl: 'Status', en: 'Status' },
  dueDate: { nl: 'Uiterlijk betalen op', en: 'Due date' },
  amount: { nl: 'Bedrag', en: 'Amount' },
  method: { nl: 'Betaalwijze', en: 'Method' },
  notes: { nl: 'Notities', en: 'Notes' },
  description: { nl: 'Omschrijving', en: 'Description' },
  category: { nl: 'Categorie', en: 'Category' },
  supplier: { nl: 'Leverancier', en: 'Supplier' },
  paidOn: { nl: 'Betaald op', en: 'Paid on' },
  name: { nl: 'Naam', en: 'Name' },
  email: { nl: 'E-mail', en: 'Email' },
  phone: { nl: 'Telefoon', en: 'Phone' },
  bought: { nl: 'Gekocht', en: 'Bought' },
  received: { nl: 'Ontvangen', en: 'Received' },
  open: { nl: 'Nog open', en: 'Open' },
  owed: { nl: 'Nog te betalen', en: 'Owed' },
  unit: { nl: 'Eenheid', en: 'Unit' },
  defaultPrice: { nl: 'Standaardprijs', en: 'Default price' },
  code: { nl: 'Code', en: 'Code' },
  producedOn: { nl: 'Gemaakt op', en: 'Produced on' },
  produced: { nl: 'Gemaakt', en: 'Produced' },
  left: { nl: 'Over', en: 'Left' },
  revenue: { nl: 'Omzet', en: 'Revenue' },
  costPerUnit: { nl: 'Kosten per stuk', en: 'Cost per unit' },
  type: { nl: 'Soort', en: 'Type' },
  counterparty: { nl: 'Tegenpartij', en: 'Counterparty' },
  balance: { nl: 'Saldo', en: 'Balance' },
  archived: { nl: 'Gearchiveerd', en: 'Archived' },
} satisfies Record<string, L>;

export const WORDS = {
  paid: { nl: 'Betaald', en: 'Paid' },
  partial: { nl: 'Deels betaald', en: 'Partly paid' },
  open: { nl: 'Open', en: 'Open' },
  walkIn: { nl: 'Losse verkoop / markt', en: 'Walk-in / market' },
  sale: { nl: 'Verkoop', en: 'Sale' },
  payment: { nl: 'Betaling', en: 'Payment' },
  yes: { nl: 'Ja', en: 'Yes' },
  bank: { nl: 'Bank', en: 'Bank' },
  cash: { nl: 'Contant', en: 'Cash' },
  card: { nl: 'Pin', en: 'Card' },
  other: { nl: 'Anders', en: 'Other' },
  statementFor: { nl: 'Overzicht voor {name}', en: 'Statement for {name}' },
  generated: { nl: 'Gemaakt op {date}', en: 'Created on {date}' },
} satisfies Record<string, L>;

export type ColKey = keyof typeof COLS;
export type SheetKey = keyof typeof SHEETS;
