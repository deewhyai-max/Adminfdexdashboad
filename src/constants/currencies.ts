/**
 * Comprehensive World Currencies Catalog
 * Includes global currencies spanning all continents, including Europe (Sweden, Norway, Denmark, etc.),
 * Americas, Asia-Pacific, Middle East, and Africa.
 */

export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
  country: string;
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  // Major Global Reserves & High-Frequency Logistics Currencies
  { code: 'USD', symbol: '$', label: 'USD ($) - US Dollar', country: 'United States' },
  { code: 'EUR', symbol: '€', label: 'EUR (€) - Euro (Eurozone)', country: 'European Union' },
  { code: 'GBP', symbol: '£', label: 'GBP (£) - British Pound', country: 'United Kingdom' },
  { code: 'CAD', symbol: 'CA$', label: 'CAD (CA$) - Canadian Dollar', country: 'Canada' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$) - Australian Dollar', country: 'Australia' },
  { code: 'JPY', symbol: '¥', label: 'JPY (¥) - Japanese Yen', country: 'Japan' },
  { code: 'CHF', symbol: 'CHF', label: 'CHF (CHF) - Swiss Franc', country: 'Switzerland' },
  { code: 'CNY', symbol: '¥', label: 'CNY (¥) - Chinese Yuan', country: 'China' },

  // Nordic / Scandinavian Currencies (Requested by User)
  { code: 'SEK', symbol: 'kr', label: 'SEK (kr) - Swedish Krona', country: 'Sweden' },
  { code: 'NOK', symbol: 'kr', label: 'NOK (kr) - Norwegian Krone', country: 'Norway' },
  { code: 'DKK', symbol: 'kr', label: 'DKK (kr) - Danish Krone', country: 'Denmark' },
  { code: 'ISK', symbol: 'kr', label: 'ISK (kr) - Icelandic Króna', country: 'Iceland' },

  // Rest of Europe
  { code: 'PLN', symbol: 'zł', label: 'PLN (zł) - Polish Złoty', country: 'Poland' },
  { code: 'CZK', symbol: 'Kč', label: 'CZK (Kč) - Czech Koruna', country: 'Czech Republic' },
  { code: 'HUF', symbol: 'Ft', label: 'HUF (Ft) - Hungarian Forint', country: 'Hungary' },
  { code: 'RON', symbol: 'lei', label: 'RON (lei) - Romanian Leu', country: 'Romania' },
  { code: 'BGN', symbol: 'лв', label: 'BGN (лв) - Bulgarian Lev', country: 'Bulgaria' },
  { code: 'HRK', symbol: 'kn', label: 'HRK (kn) - Croatian Kuna', country: 'Croatia' },
  { code: 'RSD', symbol: 'дин.', label: 'RSD (дин.) - Serbian Dinar', country: 'Serbia' },
  { code: 'BAM', symbol: 'KM', label: 'BAM (KM) - Bosnia & Herzegovina Mark', country: 'Bosnia and Herzegovina' },
  { code: 'MKD', symbol: 'ден', label: 'MKD (ден) - Macedonian Denar', country: 'North Macedonia' },
  { code: 'ALL', symbol: 'L', label: 'ALL (L) - Albanian Lek', country: 'Albania' },
  { code: 'MDL', symbol: 'L', label: 'MDL (L) - Moldovan Leu', country: 'Moldova' },
  { code: 'UAH', symbol: '₴', label: 'UAH (₴) - Ukrainian Hryvnia', country: 'Ukraine' },
  { code: 'BYN', symbol: 'Br', label: 'BYN (Br) - Belarusian Ruble', country: 'Belarus' },
  { code: 'RUB', symbol: '₽', label: 'RUB (₽) - Russian Ruble', country: 'Russia' },
  { code: 'TRY', symbol: '₺', label: 'TRY (₺) - Turkish Lira', country: 'Turkey' },

  // Middle East
  { code: 'AED', symbol: 'AED', label: 'AED (د.إ) - UAE Dirham', country: 'United Arab Emirates' },
  { code: 'SAR', symbol: 'SAR', label: 'SAR (ر.س) - Saudi Riyal', country: 'Saudi Arabia' },
  { code: 'QAR', symbol: 'QAR', label: 'QAR (ر.ق) - Qatari Riyal', country: 'Qatar' },
  { code: 'KWD', symbol: 'KWD', label: 'KWD (د.ك) - Kuwaiti Dinar', country: 'Kuwait' },
  { code: 'BHD', symbol: 'BHD', label: 'BHD (.د.ب) - Bahraini Dinar', country: 'Bahrain' },
  { code: 'OMR', symbol: 'OMR', label: 'OMR (ر.ع.) - Omani Rial', country: 'Oman' },
  { code: 'ILS', symbol: '₪', label: 'ILS (₪) - Israeli New Shekel', country: 'Israel' },
  { code: 'JOD', symbol: 'JOD', label: 'JOD (د.أ) - Jordanian Dinar', country: 'Jordan' },
  { code: 'LBP', symbol: 'L£', label: 'LBP (ل.ل) - Lebanese Pound', country: 'Lebanon' },
  { code: 'IQD', symbol: 'IQD', label: 'IQD (ع.د) - Iraqi Dinar', country: 'Iraq' },

  // Asia & Pacific
  { code: 'SGD', symbol: 'S$', label: 'SGD (S$) - Singapore Dollar', country: 'Singapore' },
  { code: 'HKD', symbol: 'HK$', label: 'HKD (HK$) - Hong Kong Dollar', country: 'Hong Kong' },
  { code: 'NZD', symbol: 'NZ$', label: 'NZD (NZ$) - New Zealand Dollar', country: 'New Zealand' },
  { code: 'KRW', symbol: '₩', label: 'KRW (₩) - South Korean Won', country: 'South Korea' },
  { code: 'TWD', symbol: 'NT$', label: 'TWD (NT$) - New Taiwan Dollar', country: 'Taiwan' },
  { code: 'INR', symbol: '₹', label: 'INR (₹) - Indian Rupee', country: 'India' },
  { code: 'PKR', symbol: '₨', label: 'PKR (₨) - Pakistani Rupee', country: 'Pakistan' },
  { code: 'BDT', symbol: '৳', label: 'BDT (৳) - Bangladeshi Taka', country: 'Bangladesh' },
  { code: 'LKR', symbol: 'Rs', label: 'LKR (Rs) - Sri Lankan Rupee', country: 'Sri Lanka' },
  { code: 'NPR', symbol: '₨', label: 'NPR (₨) - Nepalese Rupee', country: 'Nepal' },
  { code: 'IDR', symbol: 'Rp', label: 'IDR (Rp) - Indonesian Rupiah', country: 'Indonesia' },
  { code: 'MYR', symbol: 'RM', label: 'MYR (RM) - Malaysian Ringgit', country: 'Malaysia' },
  { code: 'PHP', symbol: '₱', label: 'PHP (₱) - Philippine Peso', country: 'Philippines' },
  { code: 'THB', symbol: '฿', label: 'THB (฿) - Thai Baht', country: 'Thailand' },
  { code: 'VND', symbol: '₫', label: 'VND (₫) - Vietnamese Đồng', country: 'Vietnam' },
  { code: 'KHR', symbol: '៛', label: 'KHR (៛) - Cambodian Riel', country: 'Cambodia' },
  { code: 'LAK', symbol: '₭', label: 'LAK (₭) - Lao Kip', country: 'Laos' },
  { code: 'MMK', symbol: 'K', label: 'MMK (K) - Myanmar Kyat', country: 'Myanmar' },
  { code: 'BND', symbol: 'B$', label: 'BND (B$) - Brunei Dollar', country: 'Brunei' },
  { code: 'MNT', symbol: '₮', label: 'MNT (₮) - Mongolian Tögrög', country: 'Mongolia' },
  { code: 'KZT', symbol: '₸', label: 'KZT (₸) - Kazakhstani Tenge', country: 'Kazakhstan' },
  { code: 'UZS', symbol: 'soʻm', label: 'UZS (soʻm) - Uzbekistani Som', country: 'Uzbekistan' },
  { code: 'GEL', symbol: '₾', label: 'GEL (₾) - Georgian Lari', country: 'Georgia' },
  { code: 'AZN', symbol: '₼', label: 'AZN (₼) - Azerbaijani Manat', country: 'Azerbaijan' },
  { code: 'AMD', symbol: '֏', label: 'AMD (֏) - Armenian Dram', country: 'Armenia' },
  { code: 'FJD', symbol: 'FJ$', label: 'FJD (FJ$) - Fijian Dollar', country: 'Fiji' },
  { code: 'PGK', symbol: 'K', label: 'PGK (K) - Papua New Guinean Kina', country: 'Papua New Guinea' },

  // Africa
  { code: 'NGN', symbol: '₦', label: 'NGN (₦) - Nigerian Naira', country: 'Nigeria' },
  { code: 'ZAR', symbol: 'R', label: 'ZAR (R) - South African Rand', country: 'South Africa' },
  { code: 'EGP', symbol: 'E£', label: 'EGP (E£) - Egyptian Pound', country: 'Egypt' },
  { code: 'KES', symbol: 'KSh', label: 'KES (KSh) - Kenyan Shilling', country: 'Kenya' },
  { code: 'GHS', symbol: 'GH₵', label: 'GHS (GH₵) - Ghanaian Cedi', country: 'Ghana' },
  { code: 'MAD', symbol: 'MAD', label: 'MAD (د.م.) - Moroccan Dirham', country: 'Morocco' },
  { code: 'DZD', symbol: 'DA', label: 'DZD (دج) - Algerian Dinar', country: 'Algeria' },
  { code: 'TND', symbol: 'DT', label: 'TND (د.ت) - Tunisian Dinar', country: 'Tunisia' },
  { code: 'TZS', symbol: 'TSh', label: 'TZS (TSh) - Tanzanian Shilling', country: 'Tanzania' },
  { code: 'UGX', symbol: 'USh', label: 'UGX (USh) - Ugandan Shilling', country: 'Uganda' },
  { code: 'ETB', symbol: 'Br', label: 'ETB (Br) - Ethiopian Birr', country: 'Ethiopia' },
  { code: 'RWF', symbol: 'RF', label: 'RWF (RF) - Rwandan Franc', country: 'Rwanda' },
  { code: 'XOF', symbol: 'CFA', label: 'XOF (CFA) - West African CFA Franc', country: 'West Africa (BCEAO)' },
  { code: 'XAF', symbol: 'FCFA', label: 'XAF (FCFA) - Central African CFA Franc', country: 'Central Africa (BEAC)' },
  { code: 'MUR', symbol: '₨', label: 'MUR (₨) - Mauritian Rupee', country: 'Mauritius' },
  { code: 'BWP', symbol: 'P', label: 'BWP (P) - Botswana Pula', country: 'Botswana' },
  { code: 'NAD', symbol: 'N$', label: 'NAD (N$) - Namibian Dollar', country: 'Namibia' },
  { code: 'ZMW', symbol: 'ZK', label: 'ZMW (ZK) - Zambian Kwacha', country: 'Zambia' },
  { code: 'MZN', symbol: 'MT', label: 'MZN (MT) - Mozambican Metical', country: 'Mozambique' },
  { code: 'AOA', symbol: 'Kz', label: 'AOA (Kz) - Angolan Kwanza', country: 'Angola' },
  { code: 'SCR', symbol: 'SR', label: 'SCR (SR) - Seychellois Rupee', country: 'Seychelles' },
  { code: 'LYD', symbol: 'LD', label: 'LYD (ل.د) - Libyan Dinar', country: 'Libya' },

  // Latin America & Caribbean
  { code: 'BRL', symbol: 'R$', label: 'BRL (R$) - Brazilian Real', country: 'Brazil' },
  { code: 'MXN', symbol: 'Mex$', label: 'MXN (Mex$) - Mexican Peso', country: 'Mexico' },
  { code: 'ARS', symbol: '$', label: 'ARS ($) - Argentine Peso', country: 'Argentina' },
  { code: 'CLP', symbol: '$', label: 'CLP ($) - Chilean Peso', country: 'Chile' },
  { code: 'COP', symbol: 'COL$', label: 'COP (COL$) - Colombian Peso', country: 'Colombia' },
  { code: 'PEN', symbol: 'S/.', label: 'PEN (S/.) - Peruvian Sol', country: 'Peru' },
  { code: 'UYU', symbol: '$U', label: 'UYU ($U) - Uruguayan Peso', country: 'Uruguay' },
  { code: 'CRC', symbol: '₡', label: 'CRC (₡) - Costa Rican Colón', country: 'Costa Rica' },
  { code: 'DOP', symbol: 'RD$', label: 'DOP (RD$) - Dominican Peso', country: 'Dominican Republic' },
  { code: 'GTQ', symbol: 'Q', label: 'GTQ (Q) - Guatemalan Quetzal', country: 'Guatemala' },
  { code: 'HNL', symbol: 'L', label: 'HNL (L) - Honduran Lempira', country: 'Honduras' },
  { code: 'PAB', symbol: 'B/.', label: 'PAB (B/.) - Panamanian Balboa', country: 'Panama' },
  { code: 'JMD', symbol: 'J$', label: 'JMD (J$) - Jamaican Dollar', country: 'Jamaica' },
  { code: 'TTD', symbol: 'TT$', label: 'TTD (TT$) - Trinidad & Tobago Dollar', country: 'Trinidad and Tobago' },
  { code: 'BSD', symbol: 'B$', label: 'BSD (B$) - Bahamian Dollar', country: 'Bahamas' },
  { code: 'BBD', symbol: 'Bds$', label: 'BBD (Bds$) - Barbadian Dollar', country: 'Barbados' },
  { code: 'XCD', symbol: 'EC$', label: 'XCD (EC$) - East Caribbean Dollar', country: 'Eastern Caribbean' },
  { code: 'BOB', symbol: 'Bs.', label: 'BOB (Bs.) - Bolivian Boliviano', country: 'Bolivia' },
  { code: 'PYG', symbol: '₲', label: 'PYG (₲) - Paraguayan Guaraní', country: 'Paraguay' },
];

/**
 * Helper to safely resolve a currency symbol by currency code.
 * Falls back to '$' if not recognized.
 */
export function getCurrencySymbol(code?: string | null): string {
  if (!code) return '$';
  const found = CURRENCY_OPTIONS.find(c => c.code.toUpperCase() === code.trim().toUpperCase());
  return found ? found.symbol : code;
}
