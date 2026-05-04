export interface AccountTemplate {
  number: string
  name: string
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'
  normalBalance: 'debit' | 'credit'
  classification?: 'current' | 'non-current'
  isContra: boolean
  contraTo?: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'
  description: string
  businessTypes?: Array<'freelancer' | 'service' | 'product' | 'nonprofit' | 'other'>
}

export const ACCOUNT_TEMPLATES: AccountTemplate[] = [
  { number: '1000', name: 'Cash', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'Physical cash on hand.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '1010', name: 'Checking Account', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'Primary business checking account.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '1020', name: 'Savings Account', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'Business savings or reserve account.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '1100', name: 'Petty Cash', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'Small cash fund for minor expenses.', businessTypes: ['service','product','nonprofit'] },
  { number: '1200', name: 'Accounts Receivable', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'Money customers owe you for goods or services delivered.', businessTypes: ['service','product','nonprofit'] },
  { number: '1300', name: 'Prepaid Expenses', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'Expenses paid in advance (insurance, subscriptions).', businessTypes: ['service','product','nonprofit','other'] },
  { number: '1400', name: 'Inventory', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'Value of goods held for sale.', businessTypes: ['product'] },
  { number: '1500', name: 'Equipment', type: 'Asset', normalBalance: 'debit', classification: 'non-current', isContra: false, description: 'Machinery, computers, and tools used in operations.', businessTypes: ['service','product','nonprofit'] },
  { number: '1510', name: 'Accumulated Depreciation — Equipment', type: 'Asset', normalBalance: 'credit', classification: 'non-current', isContra: true, contraTo: 'Asset', description: 'Total depreciation recorded against Equipment to date.' },
  { number: '1600', name: 'Vehicles', type: 'Asset', normalBalance: 'debit', classification: 'non-current', isContra: false, description: 'Company-owned vehicles.', businessTypes: ['product','service'] },
  { number: '1610', name: 'Accumulated Depreciation — Vehicles', type: 'Asset', normalBalance: 'credit', classification: 'non-current', isContra: true, contraTo: 'Asset', description: 'Total depreciation recorded against Vehicles.' },
  { number: '1700', name: 'Land', type: 'Asset', normalBalance: 'debit', classification: 'non-current', isContra: false, description: 'Land owned by the business (does not depreciate).' },
  { number: '1800', name: 'Buildings', type: 'Asset', normalBalance: 'debit', classification: 'non-current', isContra: false, description: 'Structures owned by the business.' },
  { number: '1810', name: 'Accumulated Depreciation — Buildings', type: 'Asset', normalBalance: 'credit', classification: 'non-current', isContra: true, contraTo: 'Asset', description: 'Total depreciation recorded against Buildings.' },
  { number: '2000', name: 'Accounts Payable', type: 'Liability', normalBalance: 'credit', classification: 'current', isContra: false, description: 'Money owed to suppliers and vendors.', businessTypes: ['service','product','nonprofit','other'] },
  { number: '2100', name: 'Accrued Liabilities', type: 'Liability', normalBalance: 'credit', classification: 'current', isContra: false, description: 'Expenses incurred but not yet paid (wages, utilities).', businessTypes: ['service','product','nonprofit'] },
  { number: '2200', name: 'Unearned Revenue', type: 'Liability', normalBalance: 'credit', classification: 'current', isContra: false, description: 'Payments received before delivering the goods or service.', businessTypes: ['service','product','nonprofit'] },
  { number: '2300', name: 'Credit Card Payable', type: 'Liability', normalBalance: 'credit', classification: 'current', isContra: false, description: 'Outstanding balance on business credit cards.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '2400', name: 'Short-term Loans Payable', type: 'Liability', normalBalance: 'credit', classification: 'current', isContra: false, description: 'Loans due within 12 months.', businessTypes: ['service','product','nonprofit'] },
  { number: '2500', name: 'Sales Tax Payable', type: 'Liability', normalBalance: 'credit', classification: 'current', isContra: false, description: 'Sales tax collected from customers, owed to the government.', businessTypes: ['product'] },
  { number: '2700', name: 'Long-term Loans Payable', type: 'Liability', normalBalance: 'credit', classification: 'non-current', isContra: false, description: 'Loans due beyond 12 months.', businessTypes: ['service','product','nonprofit'] },
  { number: '2800', name: 'Deferred Revenue', type: 'Liability', normalBalance: 'credit', classification: 'non-current', isContra: false, description: 'Long-term deferred revenue not expected to be earned within a year.' },
  { number: '3000', name: "Owner's Equity", type: 'Equity', normalBalance: 'credit', isContra: false, description: "The owner's permanent investment in the business.", businessTypes: ['freelancer','other'] },
  { number: '3100', name: 'Common Stock', type: 'Equity', normalBalance: 'credit', isContra: false, description: 'Capital raised by issuing shares.', businessTypes: ['service','product'] },
  { number: '3200', name: 'Retained Earnings', type: 'Equity', normalBalance: 'credit', isContra: false, description: 'Cumulative net income kept in the business after distributions.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '3300', name: "Owner's Draw", type: 'Equity', normalBalance: 'debit', isContra: true, contraTo: 'Equity', description: 'Money the owner withdraws for personal use. Reduces equity.', businessTypes: ['freelancer'] },
  { number: '3400', name: 'Net Assets', type: 'Equity', normalBalance: 'credit', isContra: false, description: 'For nonprofits: total assets minus total liabilities.', businessTypes: ['nonprofit'] },
  { number: '4000', name: 'Sales Revenue', type: 'Revenue', normalBalance: 'credit', isContra: false, description: 'Income from selling goods.', businessTypes: ['product'] },
  { number: '4100', name: 'Service Revenue', type: 'Revenue', normalBalance: 'credit', isContra: false, description: 'Income from providing services.', businessTypes: ['freelancer','service','nonprofit','other'] },
  { number: '4200', name: 'Interest Income', type: 'Revenue', normalBalance: 'credit', isContra: false, description: 'Interest earned on bank accounts or loans made.', businessTypes: ['service','product','nonprofit','other'] },
  { number: '4300', name: 'Other Income', type: 'Revenue', normalBalance: 'credit', isContra: false, description: 'Miscellaneous income not classified elsewhere.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '4400', name: 'Grant Revenue', type: 'Revenue', normalBalance: 'credit', isContra: false, description: 'Income from grants and donations.', businessTypes: ['nonprofit'] },
  { number: '4500', name: 'Membership Dues', type: 'Revenue', normalBalance: 'credit', isContra: false, description: 'Income from membership fees.', businessTypes: ['nonprofit'] },
  { number: '5000', name: 'Cost of Goods Sold', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Direct cost of producing the goods sold.', businessTypes: ['product'] },
  { number: '5100', name: 'Wages and Salaries Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Employee compensation costs.', businessTypes: ['service','product','nonprofit'] },
  { number: '5200', name: 'Rent Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Office, warehouse, or retail space lease payments.', businessTypes: ['service','product','nonprofit','other'] },
  { number: '5300', name: 'Utilities Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Electricity, water, internet, and gas costs.', businessTypes: ['service','product','nonprofit','other'] },
  { number: '5400', name: 'Depreciation Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Periodic allocation of the cost of long-lived assets.', businessTypes: ['service','product','nonprofit'] },
  { number: '5500', name: 'Insurance Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Business insurance premiums.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '5600', name: 'Advertising Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Marketing and advertising costs.', businessTypes: ['service','product'] },
  { number: '5700', name: 'Office Supplies Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Paper, printer ink, and other consumable supplies.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '5800', name: 'Professional Services Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Accounting, legal, and consulting fees.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '5900', name: 'Travel and Entertainment Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Business travel, meals, and client entertainment.', businessTypes: ['service','product'] },
  { number: '5950', name: 'Miscellaneous Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Small expenses that do not fit other categories.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
]

export function getTemplatesForBusinessType(type: string): AccountTemplate[] {
  return ACCOUNT_TEMPLATES.filter(
    (t) => !t.businessTypes || t.businessTypes.includes(type as AccountTemplate['businessTypes'][0])
  )
}
