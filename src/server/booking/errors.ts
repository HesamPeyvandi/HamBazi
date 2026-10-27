/** Business-rule failure with a stable code and a Persian message safe to show to users. */
export class DomainError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export const E = {
  notFound: () => new DomainError('not_found', 'مورد درخواستی پیدا نشد.'),
  forbidden: () => new DomainError('forbidden', 'شما به این بخش دسترسی ندارید.'),
  slotUnavailable: () => new DomainError('slot_unavailable', 'این سانس دیگر در دسترس نیست. لطفاً سانس دیگری را انتخاب کنید.'),
  tooLate: () => new DomainError('too_late', 'زمان رزرو این سانس گذشته یا بسیار نزدیک است.'),
  holdExpired: () => new DomainError('hold_expired', 'مهلت پرداخت به پایان رسیده است. لطفاً دوباره اقدام کنید.'),
  badState: () => new DomainError('bad_state', 'این عملیات در وضعیت فعلی ممکن نیست.'),
  paymentsDisabled: () => new DomainError('payments_disabled', 'پرداخت آنلاین هنوز فعال نیست.'),
  full: () => new DomainError('full', 'ظرفیت این سانس تکمیل شده است.'),
  alreadyJoined: () => new DomainError('already_joined', 'شما قبلاً به این سانس پیوسته‌اید.'),
  skill: () => new DomainError('skill_range', 'سطح مهارت شما با محدودهٔ این سانس هم‌خوانی ندارد.'),
  deadline: () => new DomainError('deadline', 'مهلت پیوستن به این سانس تمام شده است.'),
  invite: () => new DomainError('invite_only', 'این سانس فقط با لینک دعوت قابل پیوستن است.'),
  invalid: (m = 'اطلاعات واردشده معتبر نیست.') => new DomainError('invalid', m),
};
