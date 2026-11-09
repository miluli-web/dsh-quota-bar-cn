/**
 * Host half of dsh-quota-bar.
 *
 * Reads the DeepSeek account wallet balance — the signed-in Platform account
 * first, then the DEEPSEEK_API_KEY fallback — and serves it to the Client half
 * through one same-origin JSON route. The Client half owns presentation and the
 * local today-spend ledger.
 */

/** The Web GUI always carries the HTTP carrier; without it there is nothing to serve. */
export const inject = ['webServer']

const BALANCE_ROUTE = '/dsh-quota-bar-cn/balance'
/** Pre-rename path, kept so a page still running the previous Client module keeps working. */
const LEGACY_BALANCE_ROUTE = '/dsh-quota-bar/balance'
const BALANCE_CACHE_MS = 30_000
const UPSTREAM_TIMEOUT_MS = 15_000
const OFFICIAL_BALANCE_URL = 'https://api.deepseek.com/user/balance'

/** Platform only distinguishes these two client languages. */
const CLIENT_META = {
  version: '0.1.0',
  locale: 'zh_CN',
  timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
}

/**
 * Read the official account links (usage page, top-up page) for the signed-in account.
 * @returns {{ usageUrl: string, topUpUrl: string } | null}
 */
async function readAccountLinks(ctx) {
  const account = ctx.get('deepseekAccount')
  if (account === undefined) return null
  try {
    const state = await account.getState()
    const links = state?.links
    if (links !== null && links !== undefined && typeof links.usageUrl === 'string' && links.usageUrl !== '') {
      return links
    }
  } catch (error) {
    console.error('[dsh-quota-bar] account links read failed:', error)
  }
  return null
}

/**
 * Read the signed-in Platform account wallet list.
 * @returns {{ source: string, wallets: Array<{ currency: string, balance: number }> } | null}
 */
async function readAccountBalance(ctx) {
  const account = ctx.get('deepseekAccount')
  if (account === undefined) return null
  try {
    const result = await account.getBalance(CLIENT_META)
    if (result === null || result === undefined || result.status !== 'ready') return null
    const wallets = [...result.value, ...result.bonusWallets]
      .map((wallet) => ({ currency: wallet.currency, balance: Number(wallet.balance) }))
      .filter((wallet) => Number.isFinite(wallet.balance))
    if (wallets.length === 0) return null
    return { source: 'account', wallets }
  } catch (error) {
    console.error('[dsh-quota-bar] account balance read failed:', error)
    return null
  }
}

/**
 * Fallback for API-key deployments: official GET /user/balance.
 * @returns {{ source: string, wallets: Array<{ currency: string, balance: number }> } | null}
 */
async function readApiKeyBalance() {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (typeof apiKey !== 'string' || apiKey.trim() === '') return null
  try {
    const response = await fetch(OFFICIAL_BALANCE_URL, {
      headers: { authorization: `Bearer ${apiKey.trim()}`, accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const body = await response.json()
    const infos = Array.isArray(body?.balance_infos) ? body.balance_infos : []
    const wallets = infos
      .map((info) => ({ currency: info?.currency, balance: Number(info?.total_balance) }))
      .filter((wallet) => Number.isFinite(wallet.balance))
    if (wallets.length === 0) return null
    return { source: 'api-key', wallets }
  } catch (error) {
    console.error('[dsh-quota-bar] API key balance read failed:', error)
    return null
  }
}

export function apply(ctx) {
  let cache = { at: 0, value: null }
  let inflight = null

  const read = async () => {
    const links = await readAccountLinks(ctx)
    const account = await readAccountBalance(ctx)
    if (account !== null) return { ...account, links }
    const apiKey = await readApiKeyBalance()
    if (apiKey !== null) return { ...apiKey, links }
    return { source: 'none', wallets: [], links }
  }

  const load = async () => {
    if (cache.value !== null && Date.now() - cache.at < BALANCE_CACHE_MS) return cache.value
    if (inflight === null) {
      inflight = read()
        .then((value) => {
          cache = { at: Date.now(), value }
          return value
        })
        .finally(() => {
          inflight = null
        })
    }
    return inflight
  }

  const handle = async () => {
    const value = await load()
    const body = JSON.stringify({ ok: true, ...value, updatedAt: Date.now() })
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }

  for (const path of [BALANCE_ROUTE, LEGACY_BALANCE_ROUTE]) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path,
      resource: handle,
    }))
  }
}
