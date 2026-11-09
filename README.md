# DSH额度条

在 DSH（DeepSeek Harness）会话视图顶部常驻一条额度胶囊，一眼看到当前 DeepSeek 账号的**今日已用金额**与**剩余额度**，不用再切到开放平台页面查。

```
今日 ¥0.42 · 剩余 ¥50.20
```

## 功能

- 顶部显眼展示「今日已用 / 剩余额度」，金额用等宽数字，余额偏低时变色提醒
- 余额取自已登录的 DeepSeek 账号；未登录时回退环境变量 `DEEPSEEK_API_KEY`，调用官方 `/user/balance`
- 剩余低于 5 元转警告色，低于 1 元转错误色
- 单击胶囊立即刷新；双击「剩余额度」打开 DeepSeek 官方用量页
- 界面中英文跟随 DSH 语言设置

## 关于「今日已用」

- 由余额变化估算：当天以最近一次余额为基线，余额每下降一次就累加一次，跨天自动清零
- 首次运行当天没有 0 点基线，显示 `—`，直到余额出现下降才开始累计；tooltip 会注明统计起点
- 只统计 DSH 运行期间观测到的余额变化，不读取也不上传其他信息

## 安装

```bash
dsh plugin --profile <profile> add dsh-quota-bar-cn
```

本地开发时把本目录作为 bundle 安装也可以（Plugin Manager 的 install bundle，目标指向本包目录）。

## 目录

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host 半：读取账号余额与官方链接，注册 `/dsh-quota-bar/balance` 路由 |
| `client.js` | Client 半：会话头部额度胶囊、刷新与双击跳转 |
| `locale/*.json` | Plugin Manager 读取的标题与描述 |
| `icon.svg` | 插件图标 |
| `cordis.patch.yml` | bundle 补丁 |

## 许可

MIT
