'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Ban, CornerUpLeft, Flag, Send, X } from 'lucide-react';
import { identityColor } from '@/lib/ui/identity-color';
import { Avatar } from '@/components/ui/misc';
import { formatJalaliShort, formatTime } from '@/lib/i18n/jalali';
import { toFa } from '@/lib/i18n/digits';
import { blockAction, sendMessageAction } from '@/server/messaging/actions';
import type { MessageDTO } from '@/server/messaging';

const MAX = 1000;
const FAST = 3000, SLOW = 15000; // polling interval: 3 s while active, backs off to 15 s when nothing new arrives

export function ChatRoom({ roomId, initial, hasMoreInitial, canWrite: canWriteInitial }: { roomId: string; initial: MessageDTO[]; hasMoreInitial: boolean; canWrite: boolean }) {
  const [msgs, setMsgs] = useState<MessageDTO[]>(initial);
  const [hasMore, setHasMore] = useState(hasMoreInitial);
  const [canWrite, setCanWrite] = useState(canWriteInitial);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [fatal, setFatal] = useState('');
  const [pending, start] = useTransition();
  const last = useRef(initial.length ? initial[initial.length - 1].seq : 0);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const delay = useRef(FAST);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const merge = useCallback((incoming: MessageDTO[]) => {
    if (!incoming.length) return;
    setMsgs((cur) => {
      const seen = new Set(cur.map((m) => m.seq));
      const add = incoming.filter((m) => !seen.has(m.seq));
      return add.length ? [...cur, ...add].sort((a, b) => a.seq - b.seq) : cur;
    });
    last.current = Math.max(last.current, incoming[incoming.length - 1].seq);
  }, []);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      if (stopped || document.visibilityState !== 'visible') return; // paused while hidden; resumes on visibilitychange
      try {
        const r = await fetch(`/api/chat/rooms/${roomId}/messages?after=${last.current}&mark=1`, { cache: 'no-store' });
        if (r.status === 429) delay.current = SLOW;
        else if (r.status === 401 || r.status === 404) { setFatal(r.status === 401 ? 'نشست شما پایان یافته است. دوباره وارد شوید.' : 'دسترسی شما به این گفت‌وگو پایان یافته است.'); return; }
        else if (r.ok) {
          const j = await r.json() as { messages: MessageDTO[]; canWrite: boolean };
          setCanWrite(j.canWrite);
          if (j.messages.length) { merge(j.messages); delay.current = FAST; } else delay.current = Math.min(Math.round(delay.current * 1.5), SLOW);
        }
      } catch { delay.current = SLOW; /* offline: keep trying slowly */ }
      if (!stopped) timer.current = setTimeout(tick, delay.current);
    }
    timer.current = setTimeout(tick, delay.current);
    const wake = () => { if (document.visibilityState === 'visible') { if (timer.current) clearTimeout(timer.current); delay.current = FAST; void tick(); } };
    document.addEventListener('visibilitychange', wake);
    return () => { stopped = true; document.removeEventListener('visibilitychange', wake); if (timer.current) clearTimeout(timer.current); };
  }, [roomId, merge]);

  useEffect(() => { if (stick.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs]);

  async function older() {
    const first = msgs[0]?.seq; if (!first) return;
    const r = await fetch(`/api/chat/rooms/${roomId}/messages?before=${first}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json() as { messages: MessageDTO[]; hasMore: boolean };
    stick.current = false;
    setMsgs((cur) => [...j.messages.filter((m) => !cur.some((c) => c.seq === m.seq)), ...cur]);
    setHasMore(j.hasMore);
  }

  function jump(id: string) {
    const el = document.getElementById(`m-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('bg-accent/30'); setTimeout(() => el.classList.remove('bg-accent/30'), 1500);
  }

  function send() {
    const body = text.trim();
    if (!body || pending) return;
    setError('');
    start(async () => {
      const res = await sendMessageAction(roomId, body, replyTo?.id ?? null);
      if (res.ok) { setText(''); setReplyTo(null); stick.current = true; merge([res.message]); delay.current = FAST; }
      else { setError(res.error); if (res.code === 'read_only') setCanWrite(false); }
    });
  }

  return (
    <div className="card flex h-[70vh] min-h-[420px] flex-col overflow-hidden">
      {fatal && <p role="alert" className="bg-danger-bg p-3 text-center text-sm text-danger-fg">{fatal}</p>}
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="پیام‌ها"
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {hasMore && <div className="text-center"><button type="button" onClick={older} className="btn btn-ghost btn-sm">نمایش پیام‌های قدیمی‌تر</button></div>}
        {msgs.length === 0 && <p className="py-10 text-center text-sm text-ink-500">هنوز پیامی نیست. اولین پیام را شما بفرستید.</p>}
        {msgs.map((m, i) => {
          const d = new Date(m.createdAt); const day = formatJalaliShort(d); const sep = i === 0 || day !== formatJalaliShort(new Date(msgs[i - 1].createdAt));
          return (
            <div key={m.seq} id={`m-${m.id}`} className="rounded-xl transition-colors">
              {sep && <p className="my-2 text-center text-xs text-ink-500">{day}</p>}
              <div className={`flex items-end gap-2 ${m.mine ? 'flex-row-reverse' : ''}`}>
                {!m.mine && <Avatar seed={m.senderId} src={m.senderAvatar} name={m.senderName} size={32} />}
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.mine ? 'bg-brand-600 text-white' : 'bg-page text-ink-900'}`}>
                  {!m.mine && <p className="mb-0.5 text-xs font-bold" style={{ color: identityColor(m.senderId).name }}>{m.senderName}</p>}
                  {m.replyTo && (
                    <button type="button" onClick={() => jump(m.replyTo!.id)} className={`mb-1 block w-full rounded-lg border-s-4 px-2 py-1 text-start text-xs ${m.mine ? 'bg-white/15' : 'bg-white'}`}
                      style={{ borderColor: identityColor(m.replyTo.senderId).name }} aria-label={`رفتن به پیام ${m.replyTo.senderName}`}>
                      <span className="block font-bold" style={m.mine ? undefined : { color: identityColor(m.replyTo.senderId).name }}>{m.replyTo.senderName}</span>
                      <span dir="auto" className="line-clamp-2 break-words opacity-80">{m.replyTo.hidden ? 'پیام در دسترس نیست' : m.replyTo.snippet}</span>
                    </button>)}
                  {m.hidden ? <p className="text-sm italic opacity-70">این پیام توسط مدیریت حذف شد.</p>
                    : <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-7">{m.body}</p>}
                  <p className={`mt-0.5 flex items-center gap-2 text-[0.68rem] ${m.mine ? 'text-white/75' : 'text-ink-500'}`}>
                    <span>{formatTime(d)}</span>
                    {canWrite && !m.hidden && <button type="button" onClick={() => { setReplyTo(m); inputRef.current?.focus(); }} className="inline-flex items-center gap-0.5 hover:underline" aria-label="پاسخ به این پیام"><CornerUpLeft className="h-3 w-3" aria-hidden />پاسخ</button>}
                    {!m.mine && !m.hidden && (<>
                      <Link href={`/report?type=message&id=${m.id}`} className="inline-flex items-center gap-0.5 hover:underline" aria-label="گزارش این پیام"><Flag className="h-3 w-3" aria-hidden />گزارش</Link>
                      <form action={blockAction.bind(null, roomId, m.senderId, true)} className="inline"><button className="inline-flex items-center gap-0.5 hover:underline" aria-label={`مسدود کردن ${m.senderName}`}><Ban className="h-3 w-3" aria-hidden />مسدود</button></form>
                    </>)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {canWrite ? (
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-line p-3">
          {replyTo && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border-s-4 bg-page px-3 py-2 text-xs" style={{ borderColor: identityColor(replyTo.senderId).name }}>
              <div className="min-w-0 flex-1"><p className="font-bold" style={{ color: identityColor(replyTo.senderId).name }}>پاسخ به {replyTo.mine ? 'خودتان' : replyTo.senderName}</p>
                <p dir="auto" className="truncate opacity-80">{replyTo.body}</p></div>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="لغو پاسخ" className="grid h-6 w-6 place-items-center rounded-full hover:bg-white"><X className="h-4 w-4" aria-hidden /></button>
            </div>)}
          {error && <p role="alert" className="mb-2 rounded-lg bg-danger-bg p-2 text-sm text-danger-fg">{error}</p>}
          <div className="flex items-end gap-2">
            <label htmlFor="chat-text" className="sr-only">متن پیام</label>
            <textarea ref={inputRef} id="chat-text" dir="auto" rows={1} value={text} maxLength={MAX} placeholder="پیام خود را بنویسید…" className="field max-h-32 min-h-11 flex-1 resize-none"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
            <button className="btn btn-primary h-11" disabled={pending || !text.trim()} aria-label="ارسال پیام"><Send className="h-5 w-5 -scale-x-100" aria-hidden /></button>
          </div>
          <p className="help mt-1 text-end">{toFa(text.length)} از {toFa(MAX)}</p>
        </form>
      ) : <p className="border-t border-line p-3 text-center text-sm text-ink-500">این گفت‌وگو فقط‌خواندنی است.</p>}
    </div>
  );
}
