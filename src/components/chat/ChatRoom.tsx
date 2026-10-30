'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Ban, Check, CheckCheck, ChevronDown, Copy, CornerUpLeft, Flag, Pencil, Send, Trash2, X } from 'lucide-react';
import { identityColor } from '@/lib/ui/identity-color';
import { Avatar } from '@/components/ui/misc';
import { formatJalaliShort, formatTime } from '@/lib/i18n/jalali';
import { toFa } from '@/lib/i18n/digits';
import { blockAction, deleteMessageAction, editMessageAction, sendMessageAction } from '@/server/messaging/actions';
import type { MessageDTO } from '@/server/messaging';

const MAX = 1000;
const FAST = 3000, SLOW = 15000; // polling interval: 3 s while active, backs off to 15 s when nothing new arrives
const GROUP_MS = 5 * 60_000;     // consecutive messages of one sender within 5 minutes are grouped
const EDIT_MS = 48 * 3_600_000;  // must match EDIT_WINDOW_HOURS on the server (the server is the authority)
const nowMs = () => Date.now();
const stamp = (m: MessageDTO) => new Date(m.createdAt).getTime();

interface Props { roomId: string; initial: MessageDTO[]; hasMoreInitial: boolean; canWrite: boolean; peerReadInitial: number; updCursorInitial: number }

export function ChatRoom({ roomId, initial, hasMoreInitial, canWrite: canWriteInitial, peerReadInitial, updCursorInitial }: Props) {
  const [msgs, setMsgs] = useState<MessageDTO[]>(initial);
  const [hasMore, setHasMore] = useState(hasMoreInitial);
  const [canWrite, setCanWrite] = useState(canWriteInitial);
  const [peerRead, setPeerRead] = useState(peerReadInitial);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
  const [editing, setEditing] = useState<MessageDTO | null>(null);
  const [menu, setMenu] = useState<{ m: MessageDTO; x: number; y: number; now: number } | null>(null);
  const [toast, setToast] = useState('');
  const [away, setAway] = useState(false);       // scrolled up from the bottom
  const [newCount, setNewCount] = useState(0);   // messages that arrived while scrolled up
  const [fatal, setFatal] = useState('');
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const last = useRef(initial.length ? initial[initial.length - 1].seq : 0);
  const upd = useRef(updCursorInitial);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const delay = useRef(FAST);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2000); };
  const canEditAt = (m: MessageDTO, now: number) => m.mine && canWrite && !m.deleted && !m.hidden && now - stamp(m) < EDIT_MS;

  const openMenu = (m: MessageDTO, x: number, y: number) => {
    if (m.hidden || m.deleted) return;
    setMenu({ m, now: nowMs(), x: Math.max(8, Math.min(x, window.innerWidth - 210)), y: Math.max(8, Math.min(y, window.innerHeight - 260)) });
  };
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('click', close); window.addEventListener('wheel', close, { passive: true }); window.addEventListener('touchmove', close, { passive: true });
    window.addEventListener('resize', close); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('click', close); window.removeEventListener('wheel', close); window.removeEventListener('touchmove', close); window.removeEventListener('resize', close); window.removeEventListener('keydown', key); };
  }, [menu]);

  /** Replace a message by id (edit / delete / moderation) and refresh the quotes that point at it. */
  const replaceMsgs = useCallback((changed: MessageDTO[]) => {
    if (!changed.length) return;
    const byId = new Map(changed.map((m) => [m.id, m]));
    setMsgs((cur) => cur.map((m) => {
      const c = byId.get(m.id);
      let next = c ? { ...m, ...c, replyTo: c.replyTo ?? m.replyTo } : m;
      const q = next.replyTo && byId.get(next.replyTo.id);
      if (q) next = { ...next, replyTo: { ...next.replyTo!, snippet: q.hidden || q.deleted ? '' : [...q.body.replace(/\s+/g, ' ')].slice(0, 100).join(''), hidden: q.hidden || q.deleted } };
      return next;
    }));
  }, []);

  const merge = useCallback((incoming: MessageDTO[]) => {
    if (!incoming.length) return;
    setMsgs((cur) => {
      const seen = new Set(cur.map((m) => m.seq));
      const add = incoming.filter((m) => !seen.has(m.seq));
      if (add.length && !stick.current) setNewCount((n) => n + add.filter((m) => !m.mine).length);
      return add.length ? [...cur, ...add].sort((a, b) => a.seq - b.seq) : cur;
    });
    last.current = Math.max(last.current, incoming[incoming.length - 1].seq);
  }, []);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      if (stopped || document.visibilityState !== 'visible') return; // paused while hidden; resumes on visibilitychange
      try {
        const r = await fetch(`/api/chat/rooms/${roomId}/messages?after=${last.current}&mark=1&upd=${upd.current}`, { cache: 'no-store' });
        if (r.status === 429) delay.current = SLOW;
        else if (r.status === 401 || r.status === 404) { setFatal(r.status === 401 ? 'نشست شما پایان یافته است. دوباره وارد شوید.' : 'دسترسی شما به این گفت‌وگو پایان یافته است.'); return; }
        else if (r.ok) {
          const j = await r.json() as { messages: MessageDTO[]; canWrite: boolean; peerRead: number; updates: MessageDTO[]; updCursor: number };
          setCanWrite(j.canWrite); setPeerRead((p) => Math.max(p, j.peerRead));
          if (j.updCursor) upd.current = Math.max(upd.current, j.updCursor);
          replaceMsgs(j.updates);
          if (j.messages.length || j.updates.length) { merge(j.messages); delay.current = FAST; } else delay.current = Math.min(Math.round(delay.current * 1.5), SLOW);
        }
      } catch { delay.current = SLOW; /* offline: keep trying slowly */ }
      if (!stopped) timer.current = setTimeout(tick, delay.current);
    }
    timer.current = setTimeout(tick, delay.current);
    const wake = () => { if (document.visibilityState === 'visible') { if (timer.current) clearTimeout(timer.current); delay.current = FAST; void tick(); } };
    document.addEventListener('visibilitychange', wake);
    return () => { stopped = true; document.removeEventListener('visibilitychange', wake); if (timer.current) clearTimeout(timer.current); };
  }, [roomId, merge, replaceMsgs]);

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
  function toBottom() { stick.current = true; setNewCount(0); setAway(false); listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }

  function resetComposer() { setText(''); setReplyTo(null); setEditing(null); if (inputRef.current) inputRef.current.style.height = ''; }
  function startEdit(m: MessageDTO) { setEditing(m); setReplyTo(null); setText(m.body); setError(''); setTimeout(() => inputRef.current?.focus(), 0); }
  async function copy(m: MessageDTO) {
    try { await navigator.clipboard.writeText(m.body); say('متن کپی شد.'); }
    catch { const t = document.createElement('textarea'); t.value = m.body; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); say('متن کپی شد.'); } catch { say('کپی ممکن نشد.'); } t.remove(); }
  }
  function remove(m: MessageDTO) {
    if (!window.confirm('این پیام برای همه حذف شود؟ این کار قابل بازگشت نیست.')) return;
    start(async () => { const res = await deleteMessageAction(m.id); if (res.ok) replaceMsgs([res.message]); else say(res.error); });
  }

  function send() {
    const body = text.trim();
    if (!body || pending) return;
    setError('');
    if (editing) {
      if (body === editing.body) { resetComposer(); return; }
      const target = editing;
      start(async () => {
        const res = await editMessageAction(target.id, body);
        if (res.ok) { replaceMsgs([res.message]); resetComposer(); }
        else { setError(res.error); if (res.code === 'read_only') setCanWrite(false); }
      });
      return;
    }
    start(async () => {
      const res = await sendMessageAction(roomId, body, replyTo?.id ?? null);
      if (res.ok) { resetComposer(); stick.current = true; merge([res.message]); delay.current = FAST; }
      else { setError(res.error); if (res.code === 'read_only') setCanWrite(false); }
    });
  }

  return (
    <div className="card relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {fatal && <p role="alert" className="bg-danger-bg p-3 text-center text-sm text-danger-fg">{fatal}</p>}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="پیام‌ها"
        onScroll={(e) => { const el = e.currentTarget; const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80; stick.current = near; setAway(!near); if (near) setNewCount(0); }}>
        {hasMore && <div className="mb-2 text-center"><button type="button" onClick={older} className="btn btn-ghost btn-sm">نمایش پیام‌های قدیمی‌تر</button></div>}
        {msgs.length === 0 && <p className="py-10 text-center text-sm text-ink-500">هنوز پیامی نیست. اولین پیام را شما بفرستید.</p>}
        {msgs.map((m, i) => {
          const d = new Date(m.createdAt); const day = formatJalaliShort(d);
          const prev = msgs[i - 1], next = msgs[i + 1];
          const sep = i === 0 || day !== formatJalaliShort(new Date(prev.createdAt));
          const joinsPrev = !!prev && !sep && prev.senderId === m.senderId && stamp(m) - stamp(prev) < GROUP_MS;
          const nextSep = !!next && formatJalaliShort(new Date(next.createdAt)) !== day;
          const joinsNext = !!next && !nextSep && next.senderId === m.senderId && stamp(next) - stamp(m) < GROUP_MS;
          const gone = m.deleted || m.hidden;
          return (
            <div key={m.seq} id={`m-${m.id}`} className={`rounded-xl transition-colors ${joinsPrev ? 'mt-0.5' : 'mt-3'}`}>
              {sep && <p className="my-2 text-center text-xs text-ink-500">{day}</p>}
              <div className={`flex items-end gap-2 ${m.mine ? '' : 'flex-row-reverse'}`}>
                {!m.mine && (joinsNext ? <span className="w-8 shrink-0" aria-hidden /> : <Avatar seed={m.senderId} src={m.senderAvatar} name={m.senderName} size={32} />)}
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${gone ? '' : 'cursor-pointer'} ${m.mine ? 'bg-brand-600 text-white' : 'bg-page text-ink-900'}`}
                  onContextMenu={(e) => { if (gone) return; e.preventDefault(); openMenu(m, e.clientX, e.clientY); }}
                  onClick={(e) => { if ((e.target as HTMLElement).closest('button,a')) return; if (window.matchMedia('(pointer: coarse)').matches) { e.stopPropagation(); openMenu(m, e.clientX, e.clientY); } }}>
                  {!m.mine && !joinsPrev && <p className="mb-0.5 text-xs font-bold" style={{ color: identityColor(m.senderId).name }}>{m.senderName}</p>}
                  {m.replyTo && !gone && (
                    <button type="button" onClick={() => jump(m.replyTo!.id)} className={`mb-1 block w-full rounded-lg border-s-4 px-2 py-1 text-start text-xs ${m.mine ? 'bg-white/15' : 'bg-white'}`}
                      style={{ borderColor: identityColor(m.replyTo.senderId).name }} aria-label={`رفتن به پیام ${m.replyTo.senderName}`}>
                      <span className="block font-bold" style={m.mine ? undefined : { color: identityColor(m.replyTo.senderId).name }}>{m.replyTo.senderName}</span>
                      <span dir="auto" className="line-clamp-2 break-words opacity-80">{m.replyTo.hidden ? 'پیام در دسترس نیست' : m.replyTo.snippet}</span>
                    </button>)}
                  {m.deleted ? <p className="flex items-center gap-1 text-sm italic opacity-70"><Ban className="h-3.5 w-3.5" aria-hidden />این پیام حذف شد.</p>
                    : m.hidden ? <p className="text-sm italic opacity-70">این پیام توسط مدیریت حذف شد.</p>
                    : <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-7">{m.body}</p>}
                  <div className={`mt-0.5 flex items-center gap-2 text-[0.68rem] ${m.mine ? 'text-white/75' : 'text-ink-500'}`}>
                    <span>{formatTime(d)}</span>
                    {m.editedAt && !gone && <span>ویرایش شده</span>}
                    {m.mine && !gone && (m.seq <= peerRead
                      ? <CheckCheck className="h-3.5 w-3.5 text-accent" aria-label="دیده شد" />
                      : <Check className="h-3.5 w-3.5" aria-label="ارسال شد" />)}
                    {canWrite && !gone && <button type="button" onClick={() => { setReplyTo(m); setEditing(null); setText((t) => (editing ? '' : t)); inputRef.current?.focus(); }} className="inline-flex items-center gap-0.5 hover:underline" aria-label="پاسخ به این پیام"><CornerUpLeft className="h-3 w-3" aria-hidden />پاسخ</button>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {away && (
        <button type="button" onClick={toBottom} aria-label={newCount ? `رفتن به آخرین پیام (${toFa(newCount)} پیام جدید)` : 'رفتن به آخرین پیام'}
          className="absolute bottom-24 end-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink-700 shadow-md hover:bg-page">
          <ChevronDown className="h-5 w-5" aria-hidden />
          {newCount > 0 && <span className="absolute -top-2 -start-2 grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[0.65rem] font-bold text-white">{toFa(newCount)}</span>}
        </button>)}
      {toast && <p role="status" className="absolute inset-x-0 bottom-28 mx-auto w-fit rounded-full bg-ink-900 px-4 py-1.5 text-xs text-white">{toast}</p>}
      {menu && (
        <div role="menu" aria-label="گزینه‌های پیام" className="fixed z-50 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 text-sm shadow-lg" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {canWrite && <button role="menuitem" type="button" className="flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-page" onClick={() => { setReplyTo(menu.m); setEditing(null); setMenu(null); inputRef.current?.focus(); }}><CornerUpLeft className="h-4 w-4" aria-hidden />پاسخ</button>}
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-page" onClick={() => { const m = menu.m; setMenu(null); void copy(m); }}><Copy className="h-4 w-4" aria-hidden />کپی متن</button>
          {canEditAt(menu.m, menu.now) && <button role="menuitem" type="button" className="flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-page" onClick={() => { const m = menu.m; setMenu(null); startEdit(m); }}><Pencil className="h-4 w-4" aria-hidden />ویرایش</button>}
          {menu.m.mine && <button role="menuitem" type="button" className="flex w-full items-center gap-2 px-3 py-2 text-start text-danger-fg hover:bg-page" onClick={() => { const m = menu.m; setMenu(null); remove(m); }}><Trash2 className="h-4 w-4" aria-hidden />حذف برای همه</button>}
          {!menu.m.mine && (<>
            <Link role="menuitem" href={`/report?type=message&id=${menu.m.id}`} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-page"><Flag className="h-4 w-4" aria-hidden />گزارش پیام</Link>
            <form action={blockAction.bind(null, roomId, menu.m.senderId, true)}><button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-start text-danger-fg hover:bg-page"><Ban className="h-4 w-4" aria-hidden />مسدود کردن {menu.m.senderName}</button></form>
          </>)}
        </div>)}
      {canWrite ? (
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="shrink-0 border-t border-line p-3">
          {(replyTo || editing) && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border-s-4 bg-page px-3 py-2 text-xs" style={{ borderColor: identityColor((editing ?? replyTo)!.senderId).name }}>
              <div className="min-w-0 flex-1">
                <p className="font-bold" style={{ color: identityColor((editing ?? replyTo)!.senderId).name }}>{editing ? 'ویرایش پیام' : `پاسخ به ${replyTo!.mine ? 'خودتان' : replyTo!.senderName}`}</p>
                <p dir="auto" className="truncate opacity-80">{(editing ?? replyTo)!.body}</p></div>
              <button type="button" onClick={resetComposer} aria-label={editing ? 'لغو ویرایش' : 'لغو پاسخ'} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white"><X className="h-4 w-4" aria-hidden /></button>
            </div>)}
          {error && <p role="alert" className="mb-2 rounded-lg bg-danger-bg p-2 text-sm text-danger-fg">{error}</p>}
          <div className="flex items-end gap-2">
            <label htmlFor="chat-text" className="sr-only">متن پیام</label>
            <textarea ref={inputRef} id="chat-text" dir="rtl" rows={1} value={text} maxLength={MAX} placeholder="پیام خود را بنویسید…" className="field max-h-32 min-h-11 flex-1 resize-none"
              onChange={(e) => { setText(e.target.value); const el = e.currentTarget; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 128)}px`; }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
                else if (e.key === 'Escape' && (editing || replyTo)) resetComposer();
                else if (e.key === 'ArrowUp' && !text && !editing) { const mine = [...msgs].reverse().find((x) => canEditAt(x, nowMs())); if (mine) { e.preventDefault(); startEdit(mine); } }
              }} />
            <button className="btn btn-primary h-11" disabled={pending || !text.trim()} aria-label={editing ? 'ذخیرهٔ ویرایش' : 'ارسال پیام'}>{editing ? <Check className="h-5 w-5" aria-hidden /> : <Send className="h-5 w-5 -scale-x-100" aria-hidden />}</button>
          </div>
          <p className="help mt-1 text-end">{toFa(text.length)} از {toFa(MAX)}</p>
        </form>
      ) : <p className="shrink-0 border-t border-line p-3 text-center text-sm text-ink-500">این گفت‌وگو فقط‌خواندنی است.</p>}
    </div>
  );
}
