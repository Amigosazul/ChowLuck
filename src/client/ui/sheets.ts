import { CATS, RARITIES, RARITY_LABEL } from '../../shared/dishes.ts';
import { allDishes, cleanText, emptyPool } from '../../shared/draw.ts';
import { dayLabel } from '../../shared/day.ts';
import type { PoolConfig, Rarity, TableState } from '../../shared/types.ts';
import { $, copyText, esc, toast } from './dom.ts';
import { renderTable } from './table.ts';
import type { TableHandlers } from './table.ts';

/** Bottom sheet shell: backdrop click and Escape close it, focus returns to the opener. */
class Sheet {
  back: HTMLElement;
  body: HTMLElement;
  sub: HTMLElement;
  private opener: HTMLElement | null = null;

  constructor(id: string) {
    this.back = $(`#${id}`);
    this.body = $('.sheet-body', this.back);
    this.sub = $('header span', this.back);
    $('[data-close]', this.back).addEventListener('click', () => this.close());
    this.back.addEventListener('click', e => { if (e.target === this.back) this.close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen) this.close(); });
  }

  get isOpen() { return !this.back.hidden; }

  open() {
    this.opener = document.activeElement as HTMLElement | null;
    this.back.hidden = false;
    $<HTMLButtonElement>('[data-close]', this.back).focus({ preventScroll: true });
  }

  close() {
    this.back.hidden = true;
    this.opener?.focus({ preventScroll: true });
  }
}

/* ---------------- menu ---------------- */

export class PoolSheet extends Sheet {
  private state!: TableState;
  private save: (pool: PoolConfig) => Promise<void>;

  constructor(save: (pool: PoolConfig) => Promise<void>) {
    super('poolSheet');
    this.save = save;
  }

  show(s: TableState) {
    this.render(s);
    this.open();
  }

  render(s: TableState) {
    this.state = s;
    const pool = s.pool;
    const all = allDishes(pool);
    const on = all.filter(d => !pool.off.includes(d.name)).length;
    this.sub.textContent = `已启用 ${on} / ${all.length} 道${s.mode === 'room' ? ' · 两人共用' : ''}`;
    const groups = [...RARITIES].reverse().map(r => {
      const items = all.filter(d => d.rarity === r);
      if (!items.length) return '';
      return `<div class="grp"><h4><span class="rtag ${r}">${r}</span>${RARITY_LABEL[r]} · ${items.length} 道</h4><div class="chips">${
        items.map(d => `<button type="button" class="chip" data-name="${esc(d.name)}" aria-pressed="${!pool.off.includes(d.name)}">
          <span class="ce">${esc(d.ch)}</span><span class="nm">${esc(d.name)}</span>${
          d.custom ? `<span class="del" data-del="1" aria-label="删除 ${esc(d.name)}">×</span>` : ''}</button>`).join('')
      }</div></div>`;
    }).join('');
    const keep = this.body.querySelector<HTMLInputElement>('#addName')?.value ?? '';
    this.body.innerHTML = `
      <form class="form add" id="addForm" autocomplete="off">
        <p class="form-title">添一道自己的菜</p>
        <label class="wide">菜名<input id="addName" maxlength="12" placeholder="例如：隆江猪脚饭" required></label>
        <label>主字<input id="addCh" maxlength="2" placeholder="猪"></label>
        <label>类别<select id="addCat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label>签位<select id="addRar">${RARITIES.map(r => `<option value="${r}">${RARITY_LABEL[r]} ${r}</option>`).join('')}</select></label>
        <label>人均 ¥<input id="addPrice" type="number" min="0" max="99999" inputmode="numeric" placeholder="25"></label>
        <button class="btn primary" type="submit">加入</button>
      </form>
      ${groups}
      <div class="sheet-foot">
        <span>点菜名可暂时停用，停用的菜不会被抽到。${s.mode === 'room' ? '改动会同步给同桌。' : '设置只保存在这台设备上。'}</span>
        <button class="btn" type="button" id="poolReset">恢复默认</button>
      </div>`;
    $<HTMLInputElement>('#addName', this.body).value = keep;

    $('#addForm', this.body).addEventListener('submit', e => {
      e.preventDefault();
      const name = cleanText($<HTMLInputElement>('#addName', this.body).value, 12);
      if (!name) return;
      if (all.some(d => d.name === name)) { toast(`菜单里已经有「${name}」了`); return; }
      const price = parseInt($<HTMLInputElement>('#addPrice', this.body).value, 10);
      const next: PoolConfig = {
        off: [...pool.off],
        custom: [...pool.custom, {
          name,
          ch: cleanText($<HTMLInputElement>('#addCh', this.body).value, 1) || Array.from(name)[0],
          cat: $<HTMLSelectElement>('#addCat', this.body).value,
          rarity: $<HTMLSelectElement>('#addRar', this.body).value as Rarity,
          price: Number.isFinite(price) ? price : 25,
          min: 20, kcal: 700, line: '亲手添进菜单的一道菜。'
        }]
      };
      $<HTMLInputElement>('#addName', this.body).value = '';
      void this.commit(next, `已添入「${name}」`);
    });
    this.body.querySelectorAll<HTMLElement>('.chip').forEach(chip => chip.addEventListener('click', e => {
      const name = chip.dataset.name!;
      const del = (e.target as HTMLElement).dataset.del;
      const next: PoolConfig = { off: [...pool.off], custom: [...pool.custom] };
      if (del) {
        next.custom = next.custom.filter(c => c.name !== name);
        next.off = next.off.filter(n => n !== name);
      } else if (next.off.includes(name)) {
        next.off = next.off.filter(n => n !== name);
      } else {
        next.off.push(name);
      }
      void this.commit(next);
    }));
    $('#poolReset', this.body).addEventListener('click', () => void this.commit(emptyPool(), '已恢复默认菜单'));
  }

  private async commit(next: PoolConfig, message?: string) {
    try {
      await this.save(next);
      if (message) toast(message);
    } catch (err) {
      toast((err as Error).message);
      this.render(this.state);
    }
  }
}

/* ---------------- table / invite ---------------- */

export interface RoomHooks extends TableHandlers {
  create(name: string): Promise<void>;
  join(code: string, name: string): Promise<void>;
  remove(memberId: string): Promise<void>;
}

export class RoomSheet extends Sheet {
  private hooks: RoomHooks;
  private state!: TableState;
  joinCode = '';

  constructor(hooks: RoomHooks) {
    super('roomSheet');
    this.hooks = hooks;
  }

  show(s: TableState) {
    this.render(s);
    this.open();
  }

  render(s: TableState) {
    this.state = s;
    if (s.mode === 'local') this.renderSolo();
    else this.renderRoom(s);
  }

  private renderSolo() {
    this.sub.textContent = '两个人共用一份菜单，互相看到今天抽了什么';
    this.body.innerHTML = `
      <form class="form two" id="createForm" autocomplete="off">
        <p class="form-title">开一张饭桌</p>
        <label>你的称呼<input id="createName" maxlength="12" placeholder="例如：阿杰" required></label>
        <button class="btn primary" type="submit">开桌</button>
        <p class="form-err" hidden></p>
      </form>
      <div class="or">或</div>
      <form class="form three" id="joinForm" autocomplete="off">
        <p class="form-title">加入 TA 的饭桌</p>
        <label>邀请码<input id="joinCode" maxlength="6" placeholder="6 位" required autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.3em"></label>
        <label>你的称呼<input id="joinName" maxlength="12" placeholder="例如：小雨" required></label>
        <button class="btn primary" type="submit">入座</button>
        <p class="form-err" hidden></p>
      </form>
      <p class="sheet-note">开桌后，你现在的菜单会带过去。饭桌凭证只存在这台设备上，换手机需要重新入座。</p>`;
    $<HTMLInputElement>('#joinCode', this.body).value = this.joinCode;

    const wire = (formId: string, run: (f: HTMLFormElement) => Promise<void>) => {
      const form = $<HTMLFormElement>(formId, this.body);
      const err = $('.form-err', form);
      const btn = $<HTMLButtonElement>('button[type="submit"]', form);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        btn.disabled = true;
        err.hidden = true;
        try {
          await run(form);
        } catch (ex) {
          err.textContent = (ex as Error).message;
          err.hidden = false;
        } finally {
          btn.disabled = false;
        }
      });
    };
    wire('#createForm', () => this.hooks.create($<HTMLInputElement>('#createName', this.body).value));
    wire('#joinForm', () => this.hooks.join(
      $<HTMLInputElement>('#joinCode', this.body).value, $<HTMLInputElement>('#joinName', this.body).value));
    if (this.joinCode) setTimeout(() => $<HTMLInputElement>('#joinName', this.body).focus(), 50);
  }

  private renderRoom(s: TableState) {
    const code = s.room!.code;
    const link = `${location.origin}/?join=${code}`;
    const full = s.members.length >= 2;
    this.sub.textContent = full ? '两人已入座' : '还空着一个座位';
    this.body.innerHTML = `
      <section class="table" id="sheetTable"></section>
      ${full ? '' : `<div class="invite">
        <span class="eyebrow">邀请码</span>
        <span class="code">${esc(code)}</span>
        <span class="link">${esc(link)}</span>
        <div class="invite-actions">
          <button class="btn primary small" type="button" data-copy="${esc(link)}">复制邀请链接</button>
          <button class="btn small" type="button" data-copy="${esc(code)}">复制邀请码</button>
        </div>
      </div>`}
      <div class="people">${s.members.map(m => `
        <div class="person" data-id="${esc(m.id)}">
          <span><b>${esc(m.name)}</b>${m.id === s.me.id ? '<small>你</small>' : ''}</span>
          <span class="confirm">
            <button class="btn small danger" type="button" data-ask>${m.id === s.me.id ? '离开饭桌' : '请 TA 离席'}</button>
          </span>
        </div>`).join('')}
      </div>
      <p class="sheet-note">邀请码就是进门的钥匙，只发给 TA。饭桌坐满两人后，别人就进不来了；有人离席会空出座位。</p>`;

    renderTable($('#sheetTable', this.body), s, this.hooks);
    this.body.querySelector('[data-act="invite"]')?.remove();
    this.body.querySelectorAll<HTMLElement>('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      toast(await copyText(b.dataset.copy!) ? '已复制' : '复制失败，请长按上面的文字手动复制');
    }));
    this.body.querySelectorAll<HTMLElement>('.person').forEach(row => {
      const id = row.dataset.id!;
      const mine = id === s.me.id;
      const box = $('.confirm', row);
      $('[data-ask]', row).addEventListener('click', () => {
        box.innerHTML = `<span>${mine ? '离开后这台设备会回到单人模式' : '确定请 TA 离开？'}</span>
          <button class="btn small danger" type="button" data-yes>确定</button>
          <button class="btn small" type="button" data-no>取消</button>`;
        $('[data-no]', box).addEventListener('click', () => this.render(this.state));
        $('[data-yes]', box).addEventListener('click', async () => {
          try { await this.hooks.remove(id); } catch (err) { toast((err as Error).message); }
        });
      });
    });
  }
}

/* ---------------- history ---------------- */

export class HistorySheet extends Sheet {
  constructor() {
    super('historySheet');
  }

  show(s: TableState) {
    this.render(s);
    this.open();
  }

  render(s: TableState) {
    const nameOf = (id: string) => id === s.me.id ? '你' : (s.members.find(m => m.id === id)?.name ?? 'TA');
    const rows = s.history;
    this.sub.textContent = rows.length ? `最近 ${rows.length} 天` : '';
    this.body.innerHTML = rows.length
      ? `<div class="hist">${rows.map(h => {
          const picks = h.choices.map(c => `${esc(nameOf(c.memberId))}选了${esc(c.dish)}`).join(' · ');
          const main = h.final ?? (h.choices.length === 1 ? h.choices[0].dish : '没有定案');
          return `<div class="hist-row"><span class="hist-day">${dayLabel(h.day)}</span>
            <div class="hist-main"><b>${esc(main)}</b>${s.mode === 'room' && picks ? `<span>${picks}</span>` : ''}</div></div>`;
        }).join('')}</div>`
      : '<p class="empty">还没有记录。<br>定下一签后，第二天就会出现在这里。</p>';
  }
}
