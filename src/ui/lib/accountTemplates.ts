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
  // ── Assets ──────────────────────────────────────────────────────────────────
  { number: '1000', name: 'Cash', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'Physical currency kept on-site for immediate transactions.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '1010', name: 'Checking Account', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'Your primary bank account for day-to-day business payments and receipts.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '1020', name: 'Savings Account', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'A reserve bank account for setting aside operating funds or emergency reserves.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '1100', name: 'Petty Cash', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'A small cash fund kept on-site for minor day-to-day purchases like postage or office snacks.', businessTypes: ['service','product','nonprofit'] },
  { number: '1200', name: 'Accounts Receivable', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'Money customers owe you for goods or services already delivered but not yet paid for.', businessTypes: ['service','product','nonprofit'] },
  { number: '1300', name: 'Prepaid Expenses', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'Payments made in advance — like annual insurance or software subscriptions — that cover future periods.', businessTypes: ['service','product','nonprofit','other'] },
  { number: '1400', name: 'Inventory', type: 'Asset', normalBalance: 'debit', classification: 'current', isContra: false, description: 'The cost of products you hold for sale, including raw materials, work-in-progress, and finished goods.', businessTypes: ['product'] },
  { number: '1500', name: 'Equipment', type: 'Asset', normalBalance: 'debit', classification: 'non-current', isContra: false, description: 'Long-lived assets used in operations such as computers, machinery, and tools.', businessTypes: ['service','product','nonprofit'] },
  { number: '1510', name: 'Accumulated Depreciation — Equipment', type: 'Asset', normalBalance: 'credit', classification: 'non-current', isContra: true, contraTo: 'Asset', description: 'A running total of depreciation charged against your equipment; it offsets the Equipment account on the balance sheet.' },
  { number: '1600', name: 'Vehicles', type: 'Asset', normalBalance: 'debit', classification: 'non-current', isContra: false, description: 'Company-owned cars, trucks, or delivery vehicles used in the business.', businessTypes: ['product','service'] },
  { number: '1610', name: 'Accumulated Depreciation — Vehicles', type: 'Asset', normalBalance: 'credit', classification: 'non-current', isContra: true, contraTo: 'Asset', description: 'Running total of depreciation charged against your vehicle fleet; offsets Vehicles on the balance sheet.' },

  // ── Liabilities ──────────────────────────────────────────────────────────────
  { number: '2000', name: 'Accounts Payable', type: 'Liability', normalBalance: 'credit', classification: 'current', isContra: false, description: 'What you owe suppliers and vendors for goods or services received but not yet paid for.', businessTypes: ['service','product','nonprofit','other'] },
  { number: '2100', name: 'Accrued Liabilities', type: 'Liability', normalBalance: 'credit', classification: 'current', isContra: false, description: 'Expenses you\'ve incurred — like unpaid wages or utility bills — that haven\'t been invoiced or paid yet.', businessTypes: ['service','product','nonprofit'] },
  { number: '2200', name: 'Unearned Revenue', type: 'Liability', normalBalance: 'credit', classification: 'current', isContra: false, description: 'Cash received from customers before you\'ve delivered the promised product or service.', businessTypes: ['service','product','nonprofit'] },
  { number: '2300', name: 'Credit Card Payable', type: 'Liability', normalBalance: 'credit', classification: 'current', isContra: false, description: 'The outstanding balance on business credit cards owed to the card issuer.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '2400', name: 'Short-term Loans Payable', type: 'Liability', normalBalance: 'credit', classification: 'current', isContra: false, description: 'Borrowings that must be fully repaid within the next twelve months.', businessTypes: ['service','product','nonprofit'] },
  { number: '2500', name: 'Sales Tax Payable', type: 'Liability', normalBalance: 'credit', classification: 'current', isContra: false, description: 'Sales tax collected from customers that must be remitted to the government.', businessTypes: ['product'] },
  { number: '2700', name: 'Long-term Loans Payable', type: 'Liability', normalBalance: 'credit', classification: 'non-current', isContra: false, description: 'Borrowings with a repayment schedule extending beyond twelve months, such as a business loan or mortgage.', businessTypes: ['service','product','nonprofit'] },

  // ── Equity ───────────────────────────────────────────────────────────────────
  { number: '3000', name: "Owner's Equity", type: 'Equity', normalBalance: 'credit', isContra: false, description: 'The owner\'s total stake in the business — initial investment plus accumulated profits minus withdrawals.', businessTypes: ['freelancer','other'] },
  { number: '3100', name: 'Common Stock', type: 'Equity', normalBalance: 'credit', isContra: false, description: 'Capital contributed by shareholders in exchange for ownership shares in the corporation.', businessTypes: ['service','product'] },
  { number: '3200', name: 'Retained Earnings', type: 'Equity', normalBalance: 'credit', isContra: false, description: 'Cumulative profits kept in the business after any distributions or dividends paid to owners.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '3300', name: "Owner's Draw", type: 'Equity', normalBalance: 'debit', isContra: true, contraTo: 'Equity', description: 'Money the owner withdraws for personal use; reduces equity and is not a tax-deductible business expense.', businessTypes: ['freelancer'] },
  { number: '3400', name: 'Net Assets', type: 'Equity', normalBalance: 'credit', isContra: false, description: 'For nonprofits: total assets minus total liabilities, representing the organization\'s net worth.', businessTypes: ['nonprofit'] },

  // ── Revenue ──────────────────────────────────────────────────────────────────
  { number: '4000', name: 'Sales Revenue', type: 'Revenue', normalBalance: 'credit', isContra: false, description: 'Income earned from selling physical products to customers.', businessTypes: ['product'] },
  { number: '4100', name: 'Service Revenue', type: 'Revenue', normalBalance: 'credit', isContra: false, description: 'Income earned by providing services rather than selling physical goods.', businessTypes: ['freelancer','service','nonprofit','other'] },
  { number: '4200', name: 'Interest Income', type: 'Revenue', normalBalance: 'credit', isContra: false, description: 'Interest earned on savings accounts, investments, or loans you have made to others.', businessTypes: ['service','product','nonprofit','other'] },
  { number: '4300', name: 'Other Income', type: 'Revenue', normalBalance: 'credit', isContra: false, description: 'Any income that doesn\'t fit your other revenue categories, such as gains on asset disposals.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '4400', name: 'Grant Revenue', type: 'Revenue', normalBalance: 'credit', isContra: false, description: 'Funds received from government bodies, foundations, or donors to support specific programs or operations.', businessTypes: ['nonprofit'] },
  { number: '4500', name: 'Membership Dues', type: 'Revenue', normalBalance: 'credit', isContra: false, description: 'Recurring fees collected from members in exchange for organizational membership benefits.', businessTypes: ['nonprofit'] },

  // ── Expenses ─────────────────────────────────────────────────────────────────
  { number: '5000', name: 'Cost of Goods Sold', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'The direct costs of producing the goods you sold — materials, direct labor, and manufacturing overhead.', businessTypes: ['product'] },
  { number: '5100', name: 'Wages and Salaries Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'The gross pay earned by employees, including salaries, hourly wages, and bonuses before deductions.', businessTypes: ['service','product','nonprofit'] },
  { number: '5200', name: 'Rent Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Periodic payments for office, retail, or warehouse space you don\'t own.', businessTypes: ['service','product','nonprofit','other'] },
  { number: '5300', name: 'Utilities Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Recurring costs for electricity, water, gas, internet, and other utility services.', businessTypes: ['service','product','nonprofit','other'] },
  { number: '5400', name: 'Depreciation Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'The annual portion of a long-lived asset\'s cost allocated as an expense for the current period.', businessTypes: ['service','product','nonprofit'] },
  { number: '5500', name: 'Insurance Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Premiums paid for business insurance policies such as liability, property, and workers\' comp.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '5600', name: 'Advertising Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Costs for marketing campaigns, social media ads, print materials, and other promotional activity.', businessTypes: ['service','product'] },
  { number: '5700', name: 'Office Supplies Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Consumable items used in the office like paper, pens, printer cartridges, and packaging materials.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '5800', name: 'Professional Services Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Fees paid to accountants, lawyers, consultants, and other outside professionals.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '5900', name: 'Travel and Entertainment Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Costs for business travel, client meals, and entertainment — must have a clear business purpose to be deductible.', businessTypes: ['service','product'] },
  { number: '5950', name: 'Miscellaneous Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Small, infrequent expenses that don\'t fit any other category; keep this balance small for clean reporting.', businessTypes: ['freelancer','service','product','nonprofit','other'] },
]

type BusinessTypeValue = 'freelancer' | 'service' | 'product' | 'nonprofit' | 'other'

export function getTemplatesForBusinessType(type: string): AccountTemplate[] {
  return ACCOUNT_TEMPLATES.filter(
    (t) => !t.businessTypes || t.businessTypes.includes(type as BusinessTypeValue)
  )
}
