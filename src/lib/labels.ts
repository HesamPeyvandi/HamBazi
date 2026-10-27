export const RES_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'در حال ثبت', cls: 'pill-warn' }, awaiting_payment: { label: 'در انتظار پرداخت', cls: 'pill-warn' },
  confirmed: { label: 'تأیید شده', cls: 'pill-green' }, completed: { label: 'برگزار شده', cls: 'pill-info' },
  cancelled: { label: 'لغو شده', cls: 'pill-danger' }, expired: { label: 'منقضی شده', cls: 'pill-danger' },
  refund_pending: { label: 'در حال بازگشت وجه', cls: 'pill-warn' }, refunded: { label: 'بازگشت وجه شده', cls: 'pill-info' }, failed: { label: 'ناموفق', cls: 'pill-danger' },
};
export const SESSION_STATUS: Record<string, { label: string; cls: string }> = {
  collecting: { label: 'در حال جذب بازیکن', cls: 'pill-warn' }, confirmed: { label: 'قطعی شد', cls: 'pill-green' },
  cancelled: { label: 'لغو شد', cls: 'pill-danger' }, expired: { label: 'منقضی شد', cls: 'pill-danger' }, completed: { label: 'برگزار شد', cls: 'pill-info' },
};
export const PAY_STATUS: Record<string, string> = { created: 'در انتظار پرداخت', succeeded: 'پرداخت شد', failed: 'ناموفق', cancelled: 'لغو شد', refund_pending: 'در حال بازگشت', refunded: 'بازگشت وجه شد' };
export const REFUND_REASON: Record<string, string> = {
  player_cancelled: 'لغو توسط بازیکن', venue_cancelled: 'لغو توسط سالن', target_not_met: 'نرسیدن سانس به حداقل نفرات', host_unpaid: 'عدم پرداخت میزبان',
  host_cancelled: 'لغو توسط میزبان', participant_left: 'خروج از سانس',
};
