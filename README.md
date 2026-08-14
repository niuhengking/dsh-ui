# ⚡ DeepSeek 账户面板（dsh 插件）

一个账户信息面板插件：右下角悬浮按钮，点开即可实时查看 DeepSeek 账户余额 和 Token 消耗量（带折线图）。
不过数据只在安装完此插件后开始记录，安装前的数据未被记录。

## 功能

-  **账户余额**：总余额 / 充值余额 / 赠送余额 + 账户可用状态（官方 `GET /user/balance` 接口，30 秒自动刷新）
-  **Token 用量**：支持 **今天 / 近3天 / 近7天 / 近30天 / 近1年 / 总共** 六个时间范围，配折线图
-  **用量明细**：总计 + 输入 / 输出 / 缓存读取分开统计（K/M 格式化）
-  **低余额提醒**：余额 < ¥10 黄色提示，< ¥1 或账户不可用时红色提示
-  **实时刷新**：面板打开时每 30 秒自动刷新 + 手动刷新按钮

## 安装

1. 把本仓库克隆/下载到本地（例如 `D:\dsh\deepseek-account`）
2. 在 dsh 中安装插件：

   ```powershell
   dsh plugin --profile web add D:\dsh\deepseek-account
   ```

3. **重启 dsh web**，右下角会出现 ⚡ 悬浮按钮，点开即可使用

> 要求：Node.js 22.19+、dsh（DeepSeek Harness）web profile。

## 数据来源与安全

- **API Key**：插件**不保存、不上传任何密钥**。它只在运行时读取你本机的 `~/.dsh/.credentials.yaml` 里的 `DEEPSEEK_API_KEY`（dsh 自带的凭证文件），Key 永远不会进入浏览器或离开你的电脑。
- **余额**：由插件宿主进程调用 DeepSeek 官方接口 `https://api.deepseek.com/user/balance`。
- **Token 用量**：官方没有账户级用量 API，所以用量聚合自 **dsh 本机会话记录**（`assistant/message` 事件的 provider 用量），并实时监听当前会话，持久化到 `~/.dsh/storages/deepseek-account/usage.json`。

## 卸载

```powershell
dsh plugin --profile web remove @dsh-external/dsh-client-ui-deepseek-account
```

然后重启 dsh web。

## 结构

```
deepseek-account/
├── lib/
│   ├── index.js    # 宿主插件：读凭证、余额接口、会话用量聚合、HTTP 路由
│   └── client.js   # 浏览器端：悬浮按钮 + 面板 + SVG 折线图
├── cordis.patch.yml
└── package.json
```

牛横是糖。

## License

[MIT](LICENSE)
