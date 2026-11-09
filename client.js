/**
 * Client half of dsh-quota-bar.
 *
 * Renders a compact quota pill in the conversation header: today's spend
 * (derived from the local wallet-balance ledger) and the remaining balance.
 */
window.__ModuleLoader__.load({
  id: 'dsh-quota-bar-cn',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const SLOT = 'conversation.session.header.actions'
    const ROUTE = '/dsh-quota-bar-cn/balance'
    const STORAGE_KEY = 'dsh-quota-bar:ledger:v1'
    const REFRESH_MS = 60_000
    const DAY_MS = 24 * 60 * 60 * 1000
    const LEDGER_DAYS = 14
    const LOW_BALANCE = 5
    const EMPTY_BALANCE = 1
    const DEFAULT_USAGE_URL = 'https://platform.deepseek.com/usage'

    const COPY = {
      zh: { spent: '今日', left: '剩余', loading: '额度', signedOut: '未登录账号', failed: '额度不可用', openUsage: '双击打开 DeepSeek 用量页' },
      en: { spent: 'Today', left: 'Left', loading: 'Quota', signedOut: 'Not signed in', failed: 'Quota unavailable', openUsage: 'Double-click to open the DeepSeek usage page' },
    }

    const STYLE = `
.dsh-qbar{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;white-space:nowrap;cursor:pointer;user-select:none;font-variant-numeric:tabular-nums;transition:background .15s ease,border-color .15s ease}
.dsh-qbar:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.dsh-qbar:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-qbar__label{color:var(--dsw-alias-label-secondary)}
.dsh-qbar__spent{color:var(--dsw-alias-brand-primary);font-size:13px;font-weight:700}
.dsh-qbar__sep{color:var(--dsw-alias-label-secondary);opacity:.55}
.dsh-qbar__left{color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-qbar__left.is-warn{color:var(--dsw-alias-state-warn-primary)}
.dsh-qbar__left.is-error{color:var(--dsw-alias-state-error-primary)}
`

    function readLang(locale) {
      try {
        const active = locale?.getLocale?.().active ?? locale?.getSnapshot?.().active
        if (typeof active === 'string' && active.length > 0) {
          return active.toLowerCase().startsWith('zh') ? 'zh' : 'en'
        }
      } catch {
        // fall through to the browser preference
      }
      const language = typeof navigator === 'object' ? navigator.language : ''
      return String(language).toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }

    function dayKey(date) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    function loadLedger() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }

    function saveLedger(ledger) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger))
      } catch {
        // storage is best effort: the pill still shows the live balance
      }
    }

    /**
     * Fold one balance observation into the local ledger.
     * Spend only ever grows from a dropping balance; a top-up resets the anchor
     * without erasing what was already spent today.
     */
    function recordSample(total) {
      const ledger = loadLedger()
      const today = dayKey(new Date())
      const yesterday = dayKey(new Date(Date.now() - DAY_MS))
      let day = ledger[today]
      if (day === undefined || typeof day.last !== 'number') {
        const previous = ledger[yesterday]
        const anchored = previous !== undefined && typeof previous.last === 'number'
        day = { last: anchored ? previous.last : total, spent: 0, anchored }
        ledger[today] = day
      }
      const delta = day.last - total
      if (delta > 0) day.spent = Math.round((day.spent + delta) * 100) / 100
      day.last = total
      const keys = Object.keys(ledger).sort()
      while (keys.length > LEDGER_DAYS) delete ledger[keys.shift()]
      saveLedger(ledger)
      return { spent: day.spent, anchored: day.anchored !== false }
    }

    function summarize(wallets) {
      if (!Array.isArray(wallets)) return null
      const totals = new Map()
      for (const wallet of wallets) {
        const value = Number(wallet?.balance)
        if (!Number.isFinite(value)) continue
        const currency = wallet.currency === 'USD' ? 'USD' : 'CNY'
        totals.set(currency, (totals.get(currency) ?? 0) + value)
      }
      if (totals.size === 0) return null
      const currency = totals.has('CNY') ? 'CNY' : totals.keys().next().value
      return { currency, total: Math.round(totals.get(currency) * 100) / 100 }
    }

    function money(currency, value) {
      return `${currency === 'USD' ? '$' : '¥'}${value.toFixed(2)}`
    }

    function makeQuotaBar(locale) {
      return function QuotaBar() {
        const [lang, setLang] = React.useState(() => readLang(locale))
        const [snapshot, setSnapshot] = React.useState({ phase: 'loading' })

        React.useEffect(() => {
          if (locale === undefined || locale === null || typeof locale.subscribe !== 'function') return undefined
          return locale.subscribe(() => setLang(readLang(locale)))
        }, [])

        const refresh = React.useCallback(async () => {
          try {
            const response = await fetch(ROUTE, {
              headers: { accept: 'application/json' },
              cache: 'no-store',
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const data = await response.json()
            const summary = summarize(data?.wallets)
            if (summary === null) {
              setSnapshot({ phase: data?.source === 'none' ? 'signedOut' : 'failed' })
              return
            }
            const sample = recordSample(summary.total)
            setSnapshot({
              phase: 'ready',
              currency: summary.currency,
              total: summary.total,
              spent: sample.spent,
              anchored: sample.anchored,
              source: data?.source,
              usageUrl: typeof data?.links?.usageUrl === 'string' && data.links.usageUrl !== '' ? data.links.usageUrl : null,
              updatedAt: Number(data?.updatedAt) || Date.now(),
            })
          } catch {
            setSnapshot((previous) => (previous.phase === 'ready' ? previous : { phase: 'failed' }))
          }
        }, [])

        const openUsage = React.useCallback((event) => {
          event.stopPropagation()
          const url = snapshot.usageUrl ?? DEFAULT_USAGE_URL
          window.open(url, '_blank', 'noopener,noreferrer')
        }, [snapshot.usageUrl])

        React.useEffect(() => {
          let alive = true
          let timer
          const run = async () => {
            if (!alive) return
            await refresh()
            if (alive) timer = setTimeout(run, REFRESH_MS)
          }
          run()
          return () => {
            alive = false
            clearTimeout(timer)
          }
        }, [refresh])

        const copy = COPY[lang] ?? COPY.zh
        let children
        if (snapshot.phase === 'ready') {
          const tone = snapshot.total < EMPTY_BALANCE ? ' is-error' : snapshot.total < LOW_BALANCE ? ' is-warn' : ''
          children = [
            h('span', { key: 'spent-label', className: 'dsh-qbar__label' }, copy.spent),
            h('span', { key: 'spent', className: 'dsh-qbar__spent' }, snapshot.anchored === false && snapshot.spent === 0 ? '—' : money(snapshot.currency, snapshot.spent)),
            h('span', { key: 'sep', className: 'dsh-qbar__sep', 'aria-hidden': 'true' }, '·'),
            h('span', { key: 'left-label', className: 'dsh-qbar__label' }, copy.left),
            h('span', {
              key: 'left',
              className: `dsh-qbar__left${tone}`,
              title: copy.openUsage,
              onDoubleClick: openUsage,
            }, money(snapshot.currency, snapshot.total)),
          ]
        } else if (snapshot.phase === 'loading') {
          children = h('span', { className: 'dsh-qbar__label' }, copy.loading)
        } else {
          const text = snapshot.phase === 'signedOut' ? copy.signedOut : copy.failed
          children = h('span', { className: 'dsh-qbar__label' }, text)
        }

        const note = snapshot.anchored === false
          ? (lang === 'zh' ? '今日已用自插件首次运行起统计' : "Today's spend is counted from the first run")
          : undefined
        const detail = snapshot.phase === 'ready'
          ? [new Date(snapshot.updatedAt).toLocaleTimeString(), snapshot.source, note].filter(Boolean).join(' · ')
          : undefined

        return h(React.Fragment, null,
          h('style', null, STYLE),
          h('button', {
            type: 'button',
            className: 'dsh-qbar',
            title: detail,
            onClick: (event) => {
              if (event.detail > 1) return
              refresh()
            },
          }, children),
        )
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const locale = ctx.get('locale')
        const QuotaBar = makeQuotaBar(locale)
        ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          id: 'dsh-quota-bar-cn',
          order: 0,
        }, QuotaBar))
      },
    }
  },
})
