import type { Dish, Member, TableState } from '../../shared/types.ts';
import { esc } from './dom.ts';

export interface TableHandlers {
  pick(dish: string): void;
  settle(dish: string): void;
  reopen(): void;
  invite(): void;
}

const timeText = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function partnerOf(s: TableState): Member | undefined {
  return s.members.find(m => m.id !== s.me.id);
}

/** One-line summary of where the two of you stand today. */
export function verdict(s: TableState): { text: string; settled: boolean } {
  const partner = partnerOf(s);
  const mine = s.today.choices.find(c => c.memberId === s.me.id);
  const theirs = partner && s.today.choices.find(c => c.memberId === partner.id);
  if (s.today.final) {
    return { text: s.today.final.by === 'match' ? `心有灵犀 · ${s.today.final.dish}` : `今日定案 · ${s.today.final.dish}`, settled: true };
  }
  if (!partner) return { text: '等 TA 入座', settled: false };
  if (mine && theirs) return { text: '两签不同', settled: false };
  if (mine) return { text: `等 ${partner.name} 定签`, settled: false };
  if (theirs) return { text: `${partner.name} 已定签`, settled: false };
  return { text: '都还没定', settled: false };
}

function seatHTML(s: TableState, m: Member, isMe: boolean): string {
  const draw = s.today.draws.find(d => d.memberId === m.id);
  const pick = s.today.choices.find(c => c.memberId === m.id);
  const who = isMe ? '你' : esc(m.name);
  const minis = draw
    ? `<div class="minis">${draw.cards.map((c: Dish) =>
        `<button type="button" class="mini ${c.rarity}${pick?.dish === c.name ? ' picked' : ''}" data-pick="${esc(c.name)}"
          title="${esc(c.name)}" aria-label="${isMe ? '' : '我也选'}${esc(c.name)}">${esc(c.ch || Array.from(c.name)[0])}</button>`).join('')}</div>`
    : '';
  const status = pick
    ? `<div class="seat-pick">定了 <b>${esc(pick.dish)}</b> · ${timeText(pick.at)}</div>`
    : draw
      ? `<div class="seat-pick">${timeText(draw.at)} 开了一包，还没定</div>`
      : `<div class="seat-empty">${isMe ? '你今天还没开包' : 'TA 今天还没开包'}</div>`;
  return `<div class="seat">
    <div class="seat-name">${who}${isMe ? '' : `<small>${draw && !isMe ? '点签可以跟着选' : ''}</small>`}</div>
    ${status}${minis}
  </div>`;
}

/** The 同桌 panel. Renders nothing for a local, single-player table. */
export function renderTable(root: HTMLElement, s: TableState, h: TableHandlers) {
  if (s.mode !== 'room') {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  const partner = partnerOf(s);
  const v = verdict(s);
  const mine = s.today.choices.find(c => c.memberId === s.me.id);
  const theirs = partner && s.today.choices.find(c => c.memberId === partner.id);
  let action = '';
  if (s.today.final) action = '<button type="button" class="btn small" data-act="reopen">重新商量</button>';
  else if (mine && theirs && mine.dish !== theirs.dish) action = '<button type="button" class="btn small primary" data-act="toss">掷签决定</button>';
  else if (!partner) action = '<button type="button" class="btn small primary" data-act="invite">邀请 TA</button>';

  root.innerHTML = `
    <div class="table-head">
      <h3>同桌</h3>
      <div class="verdict${v.settled ? ' settled' : ''}"><b>${esc(v.text)}</b>${action}</div>
    </div>
    <div class="seats">
      ${seatHTML(s, s.me, true)}
      ${partner ? seatHTML(s, partner, false) : `<div class="seat"><div class="seat-empty">把邀请码发给 TA，入座后你们共用一份菜单，并能看到彼此抽到的签。</div></div>`}
    </div>`;

  root.querySelectorAll<HTMLElement>('[data-pick]').forEach(b =>
    b.addEventListener('click', () => h.pick(b.dataset.pick!)));
  root.querySelector('[data-act="reopen"]')?.addEventListener('click', h.reopen);
  root.querySelector('[data-act="invite"]')?.addEventListener('click', h.invite);
  root.querySelector('[data-act="toss"]')?.addEventListener('click', () => {
    if (!mine || !theirs) return;
    h.settle(Math.random() < 0.5 ? mine.dish : theirs.dish);
  });
}
